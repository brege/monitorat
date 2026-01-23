#!/usr/bin/env python3
"""
Observer daemon: generic event detection and storage pipeline.

Widgets register their own event sources. The observer runs them
on interval, stores events to events.jsonl, and dispatches notifications
based on per-widget notify config.
"""

import json
import logging
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """Unified event schema for all widgets."""

    timestamp: str
    widget: str
    type: str
    key: Optional[str]
    status: str
    value: Optional[float]
    threshold: Optional[float]
    message: str
    source: str
    details: Optional[dict] = None

    def to_dict(self):
        result = {k: v for k, v in asdict(self).items() if v is not None}
        if self.details:
            result["details"] = self.details
        return result


class EventStore:
    """Append-only event storage."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def append(self, event: Event) -> bool:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(event.to_dict()) + "\n")
        return True

    def read_all(self, widget: Optional[str] = None, limit: int = 1000) -> list:
        if not self.path.exists():
            return []
        events = []
        with self._lock:
            with open(self.path, "r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                        if widget and event.get("widget") != widget:
                            continue
                        events.append(event)
                    except json.JSONDecodeError:
                        continue
        events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
        if limit <= 0:
            return events
        return events[:limit]

    def trim(self, max_age_days: int = 90) -> int:
        """Remove events older than max_age_days. Returns count removed."""
        if not self.path.exists():
            return 0

        from datetime import timedelta

        cutoff_dt = datetime.now() - timedelta(days=max_age_days)
        cutoff = cutoff_dt.isoformat()

        kept = []
        removed = 0
        with self._lock:
            with open(self.path, "r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                        if event.get("timestamp", "") >= cutoff:
                            kept.append(line)
                        else:
                            removed += 1
                    except json.JSONDecodeError:
                        continue

            if removed > 0:
                with open(self.path, "w", encoding="utf-8") as handle:
                    for line in kept:
                        handle.write(line + "\n")

        return removed


# Type for source handlers: (observer) -> list[Event]
SourceHandler = Callable[["Observer"], list]

_registered_sources: dict[str, SourceHandler] = {}


def register_observer_source(name: str, handler: SourceHandler) -> None:
    """
    Register a widget's event source with the observer.

    Args:
        name: Widget name (e.g., "network", "metrics")
        handler: Callable that takes Observer and returns list of Events
    """
    if name in _registered_sources:
        logger.warning(f"Observer source '{name}' already registered, replacing")
    _registered_sources[name] = handler
    logger.info(f"Registered observer source: {name}")


class Observer:
    """
    Generic observer daemon that processes registered sources and emits events.

    On startup, records the current time. Events detected from data
    timestamped before startup are stored but do not trigger notifications.
    """

    def __init__(
        self,
        data_path: Path,
        interval_seconds: int = 300,
    ):
        self.data_path = data_path
        self.interval_seconds = interval_seconds

        self.event_store = EventStore(data_path / "events.jsonl")
        self.startup_time = datetime.now().isoformat()

        self._thread = None
        self._running = False
        self._notify_callback = None

        logger.info(f"Observer initialized, startup_time={self.startup_time}")

    def set_notify_callback(self, callback: Callable[[Event], None]) -> None:
        """Set callback for event notifications."""
        self._notify_callback = callback

    def emit(self, event: Event) -> None:
        """Store event and optionally notify."""
        self.event_store.append(event)

        if event.timestamp >= self.startup_time and self._notify_callback:
            self._notify_callback(event)

    def start(self):
        """Start the observer daemon thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.debug("Observer already running")
            return

        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info(f"Observer daemon started (interval={self.interval_seconds}s)")

    def stop(self):
        """Stop the observer daemon."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Observer daemon stopped")

    def _run(self):
        """Main daemon loop."""
        while self._running:
            try:
                self._tick()
            except Exception as error:
                logger.error(f"Observer tick error: {error}")
            time.sleep(self.interval_seconds)

    def _tick(self):
        """Run all registered sources."""
        for name, handler in _registered_sources.items():
            try:
                events = handler(self)
                if events:
                    logger.debug(f"Source '{name}' produced {len(events)} events")
            except Exception as error:
                logger.error(f"Observer source '{name}' error: {error}")


_observer_instance: Optional[Observer] = None


def get_observer() -> Optional[Observer]:
    """Get the global observer instance."""
    return _observer_instance


def start_observer(
    data_path: Path,
    interval_seconds: int = 300,
) -> Observer:
    """
    Start the global observer daemon.

    Args:
        data_path: Directory for events.jsonl and state
        interval_seconds: Polling interval
    """
    global _observer_instance

    if _observer_instance is not None:
        logger.debug("Observer already started")
        return _observer_instance

    _observer_instance = Observer(
        data_path=data_path,
        interval_seconds=interval_seconds,
    )
    _observer_instance.start()
    return _observer_instance
