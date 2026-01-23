#!/usr/bin/env python3
"""
Network observer source: registers with the observer daemon.

Uses the shared analysis module for log parsing and event detection.
"""

import json
import logging
from datetime import datetime


try:
    from monitorat.observer import (
        Event,
        Observer,
        register_observer_source,
        get_observer,
    )
except ImportError:
    from observer import Event, Observer, register_observer_source, get_observer

from monitor import config
from .analysis import (
    get_log_file_path,
    get_expected_interval,
    parse_log,
    detect_alerts,
    Alert,
    LogEntry,
)

logger = logging.getLogger(__name__)


def get_source() -> str:
    external = config["widgets"]["network"]["external"].get()
    return "external" if external else "local"


def alert_to_event(alert: Alert, source: str = "local") -> Event:
    """Convert Alert to observer Event."""
    if alert.type == "outage":
        return Event(
            timestamp=alert.timestamp.isoformat(),
            widget="network",
            type="outage",
            key=None,
            status="detected",
            value=float(alert.missed_checks),
            threshold=None,
            message=f"{alert.missed_checks} check{'s' if alert.missed_checks != 1 else ''} missed",
            source=source,
            details={
                "start": alert.start.isoformat(),
                "end": alert.end.isoformat(),
                "missedChecks": alert.missed_checks,
                "open": alert.open,
            },
        )
    elif alert.type == "ipchange":
        return Event(
            timestamp=alert.timestamp.isoformat(),
            widget="network",
            type="ipchange",
            key=None,
            status="detected",
            value=None,
            threshold=None,
            message=f"IP changed from {alert.old_ip} to {alert.new_ip}",
            source=source,
            details={
                "oldIp": alert.old_ip,
                "newIp": alert.new_ip,
            },
        )
    else:
        return Event(
            timestamp=alert.timestamp.isoformat(),
            widget="network",
            type="failure",
            key=None,
            status="detected",
            value=None,
            threshold=None,
            message=alert.message or "Connection failure",
            source=source,
        )


def read_last_checkpoint(path, source: str) -> datetime | None:
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
            if event.get("widget") != "network":
                continue
            if event.get("type") != "checkpoint":
                continue
            if event.get("source") != source:
                continue
            details = event.get("details") or {}
            log_time = details.get("log_time")
            if not log_time:
                continue
            try:
                timestamp = datetime.fromisoformat(log_time)
            except ValueError:
                continue
            if last_time is None or timestamp > last_time:
                last_time = timestamp
    return last_time


def read_last_event_time(path, source: str) -> datetime | None:
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
            if event.get("widget") != "network":
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


def append_checkpoint(observer: Observer, log_time: datetime, source: str) -> None:
    checkpoint = Event(
        timestamp=log_time.isoformat(),
        widget="network",
        type="checkpoint",
        key=None,
        status="recorded",
        value=None,
        threshold=None,
        message="network log checkpoint",
        source=source,
        details={"log_time": log_time.isoformat()},
    )
    observer.event_store.append(checkpoint)


def process_network_log(observer: Observer) -> list[Event]:
    """
    Observer source handler for network widget.

    Reads the network log, parses new entries since last processed,
    detects alerts, and emits them through the observer.
    """
    log_path = get_log_file_path()
    if not log_path or not log_path.exists():
        return []

    try:
        with open(log_path, "r", encoding="utf-8") as handle:
            text = handle.read()
    except IOError as error:
        logger.error(f"Failed to read network log: {error}")
        return []

    source = get_source()
    events_path = observer.event_store.path
    all_entries = parse_log(text)
    if not all_entries:
        return []

    last_checkpoint = read_last_checkpoint(events_path, source)
    last_event = read_last_event_time(events_path, source)
    cutoff = last_checkpoint or last_event

    previous_entry = None
    if cutoff:
        for entry in all_entries:
            if entry.timestamp <= cutoff:
                previous_entry = entry
            else:
                break

    if cutoff:
        entries = [e for e in all_entries if e.timestamp > cutoff]
    else:
        entries = all_entries

    if not entries:
        if cutoff is None:
            append_checkpoint(observer, all_entries[-1].timestamp, source)
        return []

    entries_for_alerts = []
    if previous_entry:
        entries_for_alerts.append(
            LogEntry(timestamp=previous_entry.timestamp, ip=previous_entry.ip)
        )
    entries_for_alerts.extend(entries)

    interval = get_expected_interval()
    alerts, _ = detect_alerts(entries_for_alerts, interval)

    events = []
    for alert in alerts:
        event = alert_to_event(alert, source)
        observer.emit(event)
        events.append(event)

    append_checkpoint(observer, all_entries[-1].timestamp, source)

    return events


def register_network_observer():
    """Register network event source with the observer."""
    register_observer_source("network", process_network_log)
    observer = get_observer()
    if observer is None:
        return
    events_path = observer.event_store.path
    if not events_path.exists() or events_path.stat().st_size == 0:
        process_network_log(observer)
