#!/usr/bin/env python3
"""
Metrics observer source: emits threshold breach events from metrics history.
"""

import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import psutil

try:
    from monitorat.observer import (
        Event,
        Observer,
        register_observer_source,
        get_observer,
    )
except ImportError:
    from observer import Event, Observer, register_observer_source, get_observer

try:
    from monitorat.monitor import config, get_data_path, parse_iso_timestamp
except ImportError:
    from monitor import config, get_data_path, parse_iso_timestamp

from .registry import METRIC_REGISTRY


@dataclass(frozen=True)
class MetricEntry:
    timestamp: datetime
    values: dict[str, float]


def metrics_config():
    return config["widgets"]["metrics"]


def get_threshold_settings() -> dict[str, dict[str, float]]:
    return metrics_config()["thresholds"].get(dict)


def get_metrics_csv_path() -> Path:
    return get_data_path() / "metrics.csv"


def read_metric_entries(csv_path: Path, threshold_keys: list[str]) -> list[MetricEntry]:
    entries: list[MetricEntry] = []
    if not csv_path.exists():
        return entries

    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            timestamp = parse_iso_timestamp(row.get("timestamp"))
            if not timestamp:
                continue
            values: dict[str, float] = {}
            for key in threshold_keys:
                raw = row.get(key)
                if raw is None or raw == "":
                    continue
                try:
                    values[key] = float(raw)
                except ValueError:
                    continue
            entries.append(MetricEntry(timestamp=timestamp, values=values))
    return entries


def read_last_checkpoint(path: Path, source: str) -> datetime | None:
    if not path.exists():
        return None
    last_time = None
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("widget") != "metrics":
                continue
            if event.get("type") != "checkpoint":
                continue
            if event.get("source") != source:
                continue
            details = event.get("details") or {}
            row_time = details.get("row_time")
            if not row_time:
                continue
            try:
                timestamp = datetime.fromisoformat(row_time)
            except ValueError:
                continue
            if last_time is None or timestamp > last_time:
                last_time = timestamp
    return last_time


def read_last_event_time(path: Path, source: str) -> datetime | None:
    if not path.exists():
        return None
    last_time = None
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("widget") != "metrics":
                continue
            if event.get("type") == "checkpoint":
                continue
            if event.get("source") != source:
                continue
            timestamp_raw = event.get("timestamp")
            if not timestamp_raw:
                continue
            try:
                timestamp = datetime.fromisoformat(timestamp_raw)
            except ValueError:
                continue
            if last_time is None or timestamp > last_time:
                last_time = timestamp
    return last_time


def append_checkpoint(observer: Observer, row_time: datetime, source: str) -> None:
    checkpoint = Event(
        timestamp=row_time.isoformat(),
        widget="metrics",
        type="checkpoint",
        key=None,
        status="recorded",
        value=None,
        threshold=None,
        message="metrics csv checkpoint",
        source=source,
        details={"row_time": row_time.isoformat()},
    )
    observer.event_store.append(checkpoint)


def resolve_metric_status(
    metric_key: str, value: float, thresholds: dict[str, float]
) -> tuple[str, float | None, float]:
    comparator = value
    if metric_key == "load_1min" and thresholds.get("normalize_per_cpu", True):
        cpu_count = psutil.cpu_count() or 1
        comparator = value / cpu_count

    caution = thresholds.get("caution")
    critical = thresholds.get("critical")

    if critical is not None and comparator > critical:
        return "critical", critical, comparator
    if caution is not None and comparator > caution:
        return "caution", caution, comparator
    return "ok", None, comparator


def build_threshold_event(
    entry: MetricEntry,
    metric_key: str,
    status: str,
    value: float,
    threshold: float,
    source: str,
) -> Event:
    quantity = METRIC_REGISTRY.get_quantity(metric_key)
    label = quantity.title or quantity.label
    message = f"{label} {value} > {threshold}"
    details = {
        "metric": metric_key,
        "label": label,
        "value": value,
        "threshold": threshold,
        "status": status,
        "unit": quantity.unit,
    }
    return Event(
        timestamp=entry.timestamp.isoformat(),
        widget="metrics",
        type=metric_key,
        key=metric_key,
        status=status,
        value=value,
        threshold=threshold,
        message=message,
        source=source,
        details=details,
    )


def detect_threshold_events(
    entries: list[MetricEntry],
    thresholds: dict[str, dict[str, float]],
    cutoff: datetime | None,
    source: str,
) -> list[Event]:
    events: list[Event] = []
    previous_statuses: dict[str, str] = {}

    for entry in entries:
        current_statuses: dict[str, tuple[str, float | None, float]] = {}
        for key, rules in thresholds.items():
            if key not in entry.values:
                continue
            value = entry.values[key]
            status, threshold, comparator = resolve_metric_status(key, value, rules)
            current_statuses[key] = (status, threshold, comparator)

        if cutoff and entry.timestamp <= cutoff:
            for key, (status, _, _) in current_statuses.items():
                previous_statuses[key] = status
            continue

        for key, (status, threshold, comparator) in current_statuses.items():
            if status == "ok" or threshold is None:
                continue
            previous_status = previous_statuses.get(key, "ok")
            if previous_status == status:
                continue
            events.append(
                build_threshold_event(
                    entry,
                    key,
                    status,
                    comparator,
                    threshold,
                    source,
                )
            )

        for key, (status, _, _) in current_statuses.items():
            previous_statuses[key] = status

    return events


def process_metrics_csv(observer: Observer) -> list[Event]:
    csv_path = get_metrics_csv_path()
    thresholds = get_threshold_settings()
    if not thresholds or not csv_path.exists():
        return []

    threshold_keys = list(thresholds.keys())
    entries = read_metric_entries(csv_path, threshold_keys)
    if not entries:
        return []

    events_path = observer.event_store.path
    source = "local"
    last_checkpoint = read_last_checkpoint(events_path, source)
    last_event = read_last_event_time(events_path, source)
    cutoff = last_checkpoint or last_event

    events = detect_threshold_events(entries, thresholds, cutoff, source)
    for event in events:
        observer.emit(event)

    if cutoff is None or entries[-1].timestamp > cutoff:
        append_checkpoint(observer, entries[-1].timestamp, source)

    return events


def get_metrics_events_for_demo(limit: int = 100) -> list[dict]:
    events_path = get_data_path() / "events.jsonl"
    events: list[dict] = []
    if events_path.exists():
        with events_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("widget") != "metrics":
                    continue
                if event.get("type") == "checkpoint":
                    continue
                if event.get("type") == "threshold" and event.get("key"):
                    event["type"] = event["key"]
                events.append(event)

    if not events:
        thresholds = get_threshold_settings()
        if not thresholds:
            return []
        entries = read_metric_entries(get_metrics_csv_path(), list(thresholds.keys()))
        generated = detect_threshold_events(entries, thresholds, None, "local")
        generated.sort(key=lambda event: event.timestamp, reverse=True)
        if limit > 0:
            generated = generated[:limit]
        return [event.to_dict() for event in generated]

    events.sort(key=lambda event: event.get("timestamp", ""), reverse=True)
    if limit > 0:
        events = events[:limit]
    return events


def register_metrics_observer():
    """Register metrics event source with the observer."""
    register_observer_source("metrics", process_metrics_csv, interval_seconds=300)
    observer = get_observer()
    if observer is None:
        return
    events_path = observer.event_store.path
    if not events_path.exists() or events_path.stat().st_size == 0:
        process_metrics_csv(observer)
