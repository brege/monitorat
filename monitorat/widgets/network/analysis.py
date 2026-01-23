#!/usr/bin/env python3
"""
Network log analysis: shared parsing and computation for events and uptime.

Provides:
- Log parsing (ddclient-style)
- Event detection (outages, IP changes, failures)
- Uptime segment computation (windowStats)
- Caching to avoid reparsing on every request
"""

import hashlib
import math
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from monitor import config, get_data_path
from pytimeparse import parse as parse_duration

logger = logging.getLogger(__name__)

MONTH_MAP = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}

# Match ddclient-style IPv4 detection log lines.
DETECTED_PATTERN = re.compile(
    r"^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
    r"[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+"
    r"[A-Z]+:\s+(?:\[[^\]]+\]>\s+)?"
    r"detected IPv4 address\s+([0-9.]+)",
    re.IGNORECASE,
)

# Match ddclient-style failure log lines.
FAILED_PATTERN = re.compile(
    r"^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
    r"[^\s]+\s+[^\s]+(?:\[\d+\])?:\s+"
    r"FAILED:\s+(.*)$",
    re.IGNORECASE,
)

TOLERANCE_SECONDS = 90


def network_config():
    return config["widgets"]["network"]


def get_log_file_path() -> Optional[Path]:
    try:
        log_file = network_config()["log_file"].get(str)
        log_path = Path(log_file)
        if not log_path.is_absolute():
            log_path = get_data_path() / log_path
        return log_path
    except Exception:
        return None


def get_expected_interval() -> int:
    try:
        return network_config()["chirper"]["interval_seconds"].get(int)
    except Exception:
        return 300


def get_uptime_periods() -> list:
    try:
        return network_config()["uptime"]["periods"].get(list)
    except Exception:
        return []


@dataclass
class LogEntry:
    timestamp: datetime
    ip: str
    failure: bool = False
    message: Optional[str] = None


@dataclass
class Alert:
    type: str
    timestamp: datetime
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    missed_checks: int = 0
    open: bool = False
    old_ip: Optional[str] = None
    new_ip: Optional[str] = None
    message: Optional[str] = None


@dataclass
class Segment:
    key: str
    label: str
    start: datetime
    end: datetime
    available: int
    expected: int
    observed: int
    missed: int
    uptime: Optional[float]
    coverage: float
    status: str


@dataclass
class WindowStats:
    key: str
    label: str
    segments: list
    observed: int
    expected: int
    missed: int
    uptime: Optional[float]
    coverage: float


@dataclass
class AnalysisResult:
    entries: list
    alerts: list
    missed_checks: int
    expected_checks: int
    uptime_value: Optional[float]
    uptime_text: str
    first_entry: Optional[datetime]
    last_entry: Optional[datetime]
    window_stats: list


_cache = {"hash": None, "entries": None, "slots": None}
_analysis_cache = {"key": None, "result": None}


def parse_period_seconds(value: str) -> Optional[int]:
    if not isinstance(value, str):
        return None
    parsed = parse_duration(value)
    if parsed:
        return int(parsed)
    # Match month/year units that pytimeparse does not support.
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(months?|years?)\s*$", value)
    if not match:
        return None
    amount = float(match.group(1))
    unit = match.group(2).lower()
    if unit.startswith("month"):
        return int(amount * 30 * 24 * 3600)
    if unit.startswith("year"):
        return int(amount * 365 * 24 * 3600)
    return None


def parse_timestamp(label: str) -> Optional[datetime]:
    match = re.match(
        r"^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$",
        label.strip(),
    )
    if not match:
        return None

    month_name, day, hour, minute, second = match.groups()
    month = MONTH_MAP.get(month_name)
    if month is None:
        return None

    now = datetime.now()
    candidate = datetime(now.year, month, int(day), int(hour), int(minute), int(second))

    half_year_days = 182
    diff_days = (candidate - now).days
    if diff_days > half_year_days:
        candidate = candidate.replace(year=now.year - 1)
    elif diff_days < -half_year_days and month > now.month:
        candidate = candidate.replace(year=now.year - 1)

    return candidate


def normalize_failure_message(message: str) -> str:
    cleaned = re.sub(r"^\[[^\]]+\]>\s*", "", message)
    cleaned = re.sub(r"^updating\s+[^:]+:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned or message


def parse_log(text: str) -> list[LogEntry]:
    entries = []
    last_ip = None

    for line in text.split("\n"):
        if "detected IPv4 address" in line:
            match = DETECTED_PATTERN.match(line)
            if not match:
                continue
            timestamp = parse_timestamp(match.group(1))
            if not timestamp:
                continue
            last_ip = match.group(2).strip()
            entries.append(LogEntry(timestamp=timestamp, ip=last_ip))

        elif "FAILED:" in line:
            match = FAILED_PATTERN.match(line)
            if not match:
                continue
            timestamp = parse_timestamp(match.group(1))
            if not timestamp:
                continue
            if not last_ip:
                continue
            message = normalize_failure_message(match.group(2).strip())
            entries.append(
                LogEntry(timestamp=timestamp, ip=last_ip, failure=True, message=message)
            )

    entries.sort(key=lambda e: e.timestamp)
    return entries


def compute_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def get_cached_entries(text: str) -> tuple[list[LogEntry], list[int]]:
    """Parse log with caching based on content hash."""
    text_hash = compute_hash(text)
    if _cache["hash"] == text_hash and _cache["entries"] is not None:
        return _cache["entries"], _cache["slots"]

    entries = parse_log(text)
    interval_ms = get_expected_interval() * 1000
    slots = build_slot_numbers(entries, interval_ms)

    _cache["hash"] = text_hash
    _cache["entries"] = entries
    _cache["slots"] = slots

    return entries, slots


def build_slot_numbers(entries: list[LogEntry], interval_ms: int) -> list[int]:
    slots = []
    previous = None
    for entry in entries:
        slot = round(entry.timestamp.timestamp() * 1000 / interval_ms)
        if slot != previous:
            slots.append(slot)
            previous = slot
    return slots


def detect_alerts(
    entries: list[LogEntry],
    interval_seconds: int,
    now: Optional[datetime] = None,
) -> tuple[list[Alert], int]:
    """Detect alerts from entries. Returns (alerts, missed_checks)."""
    if not entries:
        return [], 0

    now = now or datetime.now()
    alerts = []
    missed = 0
    interval_ms = interval_seconds * 1000
    tolerance_ms = TOLERANCE_SECONDS * 1000

    for i in range(len(entries) - 1):
        current = entries[i]
        next_entry = entries[i + 1]
        diff_ms = (next_entry.timestamp - current.timestamp).total_seconds() * 1000

        missing = int((diff_ms - tolerance_ms) / interval_ms)
        if missing > 0:
            missed += missing
            start = current.timestamp + timedelta(seconds=interval_seconds)
            alerts.append(
                Alert(
                    type="outage",
                    timestamp=next_entry.timestamp,
                    start=start,
                    end=next_entry.timestamp,
                    missed_checks=missing,
                    open=False,
                )
            )

        if current.ip and next_entry.ip and current.ip != next_entry.ip:
            alerts.append(
                Alert(
                    type="ipchange",
                    timestamp=next_entry.timestamp,
                    old_ip=current.ip,
                    new_ip=next_entry.ip,
                )
            )

        if current.failure:
            alerts.append(
                Alert(
                    type="failure",
                    timestamp=current.timestamp,
                    message=current.message or "Connection failure",
                )
            )

    if entries and entries[-1].failure:
        last = entries[-1]
        alerts.append(
            Alert(
                type="failure",
                timestamp=last.timestamp,
                message=last.message or "Connection failure",
            )
        )

    last_entry = entries[-1]
    tail_diff_ms = (now - last_entry.timestamp).total_seconds() * 1000
    tail_missing = int((tail_diff_ms - tolerance_ms) / interval_ms)
    if tail_missing > 0:
        missed += tail_missing
        alerts.append(
            Alert(
                type="outage",
                timestamp=now,
                start=last_entry.timestamp + timedelta(seconds=interval_seconds),
                end=now,
                missed_checks=tail_missing,
                open=True,
            )
        )

    alerts.sort(key=lambda a: a.start if a.type == "outage" else a.timestamp)
    return alerts, missed


def resolve_segment_status(start_ms: int, end_ms: int, alerts: list[Alert]) -> str:
    if not alerts:
        return "normal"

    has_failure = False
    for alert in alerts:
        if alert.type == "outage":
            alert_start = alert.start.timestamp() * 1000
            alert_end = alert.end.timestamp() * 1000
            if start_ms <= alert_end and end_ms >= alert_start:
                return "systemDown"
        elif alert.type == "failure":
            failure_time = alert.timestamp.timestamp() * 1000
            if start_ms <= failure_time <= end_ms:
                has_failure = True

    return "connectionFailure" if has_failure else "normal"


def lower_bound(slots: list[int], value: int) -> int:
    low, high = 0, len(slots)
    while low < high:
        mid = (low + high) // 2
        if slots[mid] < value:
            low = mid + 1
        else:
            high = mid
    return low


def upper_bound(slots: list[int], value: int) -> int:
    low, high = 0, len(slots)
    while low < high:
        mid = (low + high) // 2
        if slots[mid] <= value:
            low = mid + 1
        else:
            high = mid
    return low


def count_slots_in_range(slots: list[int], start_slot: int, end_slot: int) -> int:
    if start_slot > end_slot:
        return 0
    start_index = lower_bound(slots, start_slot)
    end_index = upper_bound(slots, end_slot)
    return max(0, end_index - start_index)


def format_period_label(period: str) -> str:
    match = re.match(r"^1\s+(hour|day|week|month|year)s?$", period, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    return period


def format_segment_label(segment_ms: int, start_ms: int, end_ms: int) -> str:
    start_dt = datetime.fromtimestamp(start_ms / 1000)
    end_dt = datetime.fromtimestamp(end_ms / 1000)

    if segment_ms >= 86400000:
        if start_dt.month == end_dt.month:
            return start_dt.strftime("%b %d")
        return f"{start_dt.strftime('%b %d')} - {end_dt.strftime('%b %d')}"
    elif segment_ms >= 3600000:
        return start_dt.strftime("%H:%M")
    else:
        return start_dt.strftime("%H:%M:%S")


def compute_window_stats(
    entries: list[LogEntry],
    slots: list[int],
    alerts: list[Alert],
    periods_config: list,
    interval_seconds: int,
    now: Optional[datetime] = None,
) -> list[WindowStats]:
    now = now or datetime.now()
    now_ms = now.timestamp() * 1000
    interval_ms = interval_seconds * 1000
    now_slot = int(now_ms / interval_ms)

    first_slot = (
        int(entries[0].timestamp.timestamp() * 1000 / interval_ms) if entries else 0
    )

    results = []
    for index, period_config in enumerate(periods_config):
        period_str = period_config.get("period", "1 hour")
        segment_str = period_config.get("segment_size", "5 minutes")

        period_seconds = parse_period_seconds(period_str)
        segment_seconds = parse_period_seconds(segment_str)

        if not period_seconds or not segment_seconds:
            results.append(
                WindowStats(
                    key=f"period-{index}",
                    label=period_str,
                    segments=[],
                    observed=0,
                    expected=0,
                    missed=0,
                    uptime=None,
                    coverage=0,
                )
            )
            continue

        period_ms = period_seconds * 1000
        segment_ms = segment_seconds * 1000
        segment_count = max(1, math.ceil(period_ms / segment_ms))
        segment_slots = max(1, round(segment_ms / interval_ms))

        end_slot = now_slot
        first_start_slot = end_slot - segment_count * segment_slots + 1

        segments = []
        for seg_index in range(segment_count):
            start_slot = first_start_slot + seg_index * segment_slots
            end_slot_seg = start_slot + segment_slots - 1
            start_ms = start_slot * interval_ms
            end_ms = (end_slot_seg + 1) * interval_ms

            clamped_end_slot = min(end_slot_seg, now_slot)
            is_future = start_slot > now_slot
            available = 0 if is_future else max(0, clamped_end_slot - start_slot + 1)
            effective_start = max(start_slot, first_slot)
            expected = (
                clamped_end_slot - effective_start + 1
                if not is_future and clamped_end_slot >= effective_start
                else 0
            )
            observed = (
                count_slots_in_range(slots, effective_start, clamped_end_slot)
                if expected > 0
                else 0
            )
            missed = max(0, expected - observed)
            uptime = (observed / expected * 100) if expected > 0 else None
            coverage = expected / available if available > 0 else 0

            end_ms_clamped = min(end_ms, (clamped_end_slot + 1) * interval_ms)
            status = resolve_segment_status(int(start_ms), int(end_ms_clamped), alerts)

            segments.append(
                Segment(
                    key=f"{period_str.replace(' ', '-')}-{seg_index}",
                    label=format_segment_label(segment_ms, start_ms, end_ms),
                    start=datetime.fromtimestamp(max(start_ms, 0) / 1000),
                    end=datetime.fromtimestamp(max(end_ms_clamped, start_ms) / 1000),
                    available=available,
                    expected=expected,
                    observed=observed,
                    missed=missed,
                    uptime=uptime,
                    coverage=coverage,
                    status=status,
                )
            )

        total_observed = sum(s.observed for s in segments)
        total_expected = sum(s.expected for s in segments)
        total_available = sum(s.available for s in segments)
        total_missed = max(0, total_expected - total_observed)
        total_uptime = (
            (total_observed / total_expected * 100) if total_expected > 0 else None
        )
        total_coverage = total_expected / total_available if total_available > 0 else 0

        results.append(
            WindowStats(
                key=f"period-{index}",
                label=f"Past {format_period_label(period_str)}",
                segments=segments,
                observed=total_observed,
                expected=total_expected,
                missed=total_missed,
                uptime=total_uptime,
                coverage=total_coverage,
            )
        )

    return results


def analyze_log(text: str, now: Optional[datetime] = None) -> AnalysisResult:
    """Full analysis: parse log, detect alerts, compute uptime stats."""
    now = now or datetime.now()
    entries, slots = get_cached_entries(text)

    if not entries:
        periods = get_uptime_periods()
        interval = get_expected_interval()
        return AnalysisResult(
            entries=[],
            alerts=[],
            missed_checks=0,
            expected_checks=0,
            uptime_value=None,
            uptime_text="–",
            first_entry=None,
            last_entry=None,
            window_stats=compute_window_stats([], [], [], periods, interval, now),
        )

    interval = get_expected_interval()
    alerts, missed = detect_alerts(entries, interval, now)

    expected_checks = len(entries) + missed
    uptime_value = (len(entries) / expected_checks * 100) if expected_checks else 100
    uptime_text = f"{uptime_value:.2f}%" if expected_checks else "100%"

    periods = get_uptime_periods()
    window_stats = compute_window_stats(entries, slots, alerts, periods, interval, now)

    return AnalysisResult(
        entries=entries,
        alerts=alerts,
        missed_checks=missed,
        expected_checks=expected_checks,
        uptime_value=uptime_value,
        uptime_text=uptime_text,
        first_entry=entries[0].timestamp,
        last_entry=entries[-1].timestamp,
        window_stats=window_stats,
    )


def analyze_log_file(log_path: Path, now: Optional[datetime] = None) -> AnalysisResult:
    try:
        stat = log_path.stat()
    except OSError:
        return analyze_log("", now)

    cache_key = (stat.st_mtime_ns, stat.st_size)
    if _analysis_cache["key"] == cache_key and _analysis_cache["result"] is not None:
        return _analysis_cache["result"]

    with open(log_path, "r", encoding="utf-8") as handle:
        text = handle.read()

    result = analyze_log(text, now)
    _analysis_cache["key"] = cache_key
    _analysis_cache["result"] = result
    return result


def serialize_segment(segment: Segment) -> dict:
    return {
        "key": segment.key,
        "label": segment.label,
        "start": segment.start.isoformat(),
        "end": segment.end.isoformat(),
        "available": segment.available,
        "expected": segment.expected,
        "observed": segment.observed,
        "missed": segment.missed,
        "uptime": segment.uptime,
        "coverage": segment.coverage,
        "status": segment.status,
    }


def serialize_window_stats(stats: WindowStats) -> dict:
    return {
        "key": stats.key,
        "label": stats.label,
        "segments": [serialize_segment(s) for s in stats.segments],
        "observed": stats.observed,
        "expected": stats.expected,
        "missed": stats.missed,
        "uptime": stats.uptime,
        "coverage": stats.coverage,
    }


def serialize_alert(alert: Alert) -> dict:
    result = {"type": alert.type, "timestamp": alert.timestamp.isoformat()}
    if alert.type == "outage":
        result["start"] = alert.start.isoformat()
        result["end"] = alert.end.isoformat()
        result["missedChecks"] = alert.missed_checks
        result["open"] = alert.open
    elif alert.type == "ipchange":
        result["oldIp"] = alert.old_ip
        result["newIp"] = alert.new_ip
    elif alert.type == "failure":
        result["message"] = alert.message
    return result
