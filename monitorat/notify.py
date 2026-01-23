#!/usr/bin/env python3

import json
import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from apprise import Apprise, common as apprise_common

try:
    from .config import config
except ImportError:
    from config import config


class NotificationHandler:
    """Shared notification handler for sending messages via apprise"""

    def __init__(self, apprise_urls=None):
        """Initialize notification handler

        Args:
            apprise_urls (list): List of apprise URLs to send notifications to
        """
        self.apprise_urls = apprise_urls or []
        self.logger = logging.getLogger(__name__)

    def add_priority_to_url(self, url, priority):
        """Add priority parameter to apprise URL"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)

        # Map numeric priority to pushover priority values
        priority_map = {
            -1: "-1",  # low
            0: "0",  # normal
            1: "1",  # high
        }

        query_params["priority"] = [priority_map.get(priority, "0")]

        new_query = urlencode(query_params, doseq=True)
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                new_query,
                parsed.fragment,
            )
        )

    def send_notification(self, title, body, priority=0):
        """Send notification with specified title, body and priority

        Args:
            title (str): Notification title
            body (str): Notification body
            priority (int): Priority level (-1=low, 0=normal, 1=high)

        Returns:
            bool: True if notification was sent successfully
        """
        if not self.apprise_urls:
            self.logger.warning("No apprise URLs configured, notification not sent")
            return False

        apobj = Apprise()

        # Add apprise URLs with priority
        for url in self.apprise_urls:
            priority_url = self.add_priority_to_url(url, priority)
            apobj.add(priority_url)

        if len(apobj) == 0:
            self.logger.error("Failed to add any notification services")
            return False

        priority_names = {-1: "low", 0: "normal", 1: "high"}
        priority_name = priority_names.get(priority, "unknown")

        self.logger.info(f"Sending notification (priority={priority_name}): {title}")

        try:
            result = self._notify_sequential(apobj, title, body)
            if result:
                self.logger.info("Notification sent successfully")
            else:
                self.logger.error("Notification failed to send")
            return result
        except Exception as e:
            self.logger.error(f"Notification error: {e}")
            return False

    def send_test_notification(self, priority=0, service_name="monitorat"):
        """Send test notification with optional priority level

        Args:
            priority (int): Priority level (-1=low, 0=normal, 1=high)
            service_name (str): Name of service sending the test

        Returns:
            bool: True if notification was sent successfully
        """
        if not self.apprise_urls:
            self.logger.warning(
                "No apprise URLs configured, test notification not sent"
            )
            return False

        priority_names = {-1: "Low", 0: "Normal", 1: "High"}
        priority_name = priority_names.get(priority, "Unknown")

        title = f"{service_name} Test ({priority_name} Priority)"
        body = f"Test notification from {service_name} with {priority_name.lower()} priority level"

        self.logger.info(f"Sending test notification from {service_name}")
        return self.send_notification(title, body, priority)

    def send_test_notification_detailed(self, priority=0, service_name="monitorat"):
        """Send test notification and return detailed results per service

        Args:
            priority (int): Priority level (-1=low, 0=normal, 1=high)
            service_name (str): Name of service sending the test

        Returns:
            list: List of dicts with 'service' and 'success' keys for each apprise URL
        """
        if not self.apprise_urls:
            self.logger.warning(
                "No apprise URLs configured, test notification not sent"
            )
            return []

        priority_names = {-1: "Low", 0: "Normal", 1: "High"}
        priority_name = priority_names.get(priority, "Unknown")

        title = f"{service_name} Test ({priority_name} Priority)"
        body = f"Test notification from {service_name} with {priority_name.lower()} priority level"

        results = []
        apobj = Apprise()

        for url in self.apprise_urls:
            priority_url = self.add_priority_to_url(url, priority)
            apobj.add(priority_url)

        if len(apobj) == 0:
            self.logger.error("Failed to add any notification services")
            return []

        for server in apobj.servers:
            service_name = getattr(server, "service_name", None)
            if not service_name:
                service_name = type(server).__name__.replace("Notify", "").lower()

            try:
                result = server.notify(
                    body=body,
                    title=title,
                    notify_type=apprise_common.NotifyType.INFO,
                )
                success = bool(result)
                results.append({"service": service_name, "success": success})
                if success:
                    self.logger.info(f"Test notification sent to {service_name}")
                else:
                    self.logger.error(f"Test notification failed for {service_name}")
            except Exception as exc:
                self.logger.error(f"Test notification error for {service_name}: {exc}")
                results.append({"service": service_name, "success": False})

        return results

    def _notify_sequential(self, apobj, title, body):
        if len(apobj.servers) == 0:
            return False

        success = True
        for server in apobj.servers:
            try:
                result = server.notify(
                    body=body,
                    title=title,
                    notify_type=apprise_common.NotifyType.INFO,
                )
                success = success and bool(result)
            except Exception as exc:
                server_name = getattr(server, "name", repr(server))
                self.logger.error(f"Notification error via {server_name}: {exc}")
                success = False
        return success


@dataclass
class PendingNotification:
    widget: str
    event_type: str
    key: str | None
    source: str | None
    first_timestamp: str
    last_timestamp: str
    last_seen_epoch: float
    count: int
    message: str | None = None
    details: dict | None = None
    open: bool = False


def should_notify_event(event) -> bool:
    try:
        widget_cfg = config["widgets"][event.widget].get(dict)
    except Exception:
        return False

    notify_cfg = widget_cfg.get("notify")
    if not isinstance(notify_cfg, dict):
        return False

    event_type = getattr(event, "type", getattr(event, "event_type", None))
    if event_type is None:
        return False
    event_cfg = notify_cfg.get(event_type)
    if not isinstance(event_cfg, dict):
        return False
    return bool(event_cfg.get("enabled", False))


def build_event_notification(event) -> tuple[str, str]:
    title = f"{event.widget} event: {event.type}"
    lines = []
    if event.message:
        lines.append(event.message)
    lines.append(f"Timestamp: {event.timestamp}")
    if event.source:
        lines.append(f"Source: {event.source}")
    if event.details:
        lines.append(f"Details: {json.dumps(event.details, sort_keys=True)}")
    return title, "\n".join(lines)


def get_notify_priority(event) -> int:
    try:
        widget_cfg = config["widgets"][event.widget].get(dict)
    except Exception:
        return 0
    notify_cfg = widget_cfg.get("notify")
    if isinstance(notify_cfg, dict):
        event_type = getattr(event, "type", getattr(event, "event_type", None))
        if event_type is None:
            return 0
        event_cfg = notify_cfg.get(event_type)
        if isinstance(event_cfg, dict):
            priority = event_cfg.get("priority", 0)
            if isinstance(priority, int):
                return priority
    return 0


def get_event_notify_config(event) -> dict:
    try:
        widget_cfg = config["widgets"][event.widget].get(dict)
    except Exception:
        return {}
    notify_cfg = widget_cfg.get("notify")
    if isinstance(notify_cfg, dict):
        event_type = getattr(event, "type", getattr(event, "event_type", None))
        if event_type is None:
            return {}
        event_cfg = notify_cfg.get(event_type)
        if isinstance(event_cfg, dict):
            return event_cfg
    return {}


def get_widget_notify_config(event) -> dict:
    try:
        widget_cfg = config["widgets"][event.widget].get(dict)
    except Exception:
        return {}
    notify_cfg = widget_cfg.get("notify")
    if isinstance(notify_cfg, dict):
        return notify_cfg
    return {}


def get_notification_interval() -> int:
    try:
        return config["notifications"]["interval"].get(int)
    except Exception:
        try:
            return config["notifications"]["interval_seconds"].get(int)
        except Exception:
            return 300


def format_range_label(first_ts: str, last_ts: str) -> str:
    try:
        start = datetime.fromisoformat(first_ts)
        end = datetime.fromisoformat(last_ts)
    except ValueError:
        return f"{first_ts} to {last_ts}"
    if start == end:
        return start.strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"{start.strftime('%Y-%m-%d %H:%M:%S')} to {end.strftime('%Y-%m-%d %H:%M:%S')}"
    )


def build_pending_notification(pending: PendingNotification) -> tuple[str, str]:
    title = f"{pending.widget} {pending.event_type}"
    lines = []
    if pending.message:
        lines.append(pending.message)
    if pending.count > 1:
        lines.append(f"Count: {pending.count}")
    lines.append(
        f"Range: {format_range_label(pending.first_timestamp, pending.last_timestamp)}"
    )
    if pending.source:
        lines.append(f"Source: {pending.source}")
    if pending.details:
        lines.append(f"Details: {json.dumps(pending.details, sort_keys=True)}")
    return title, "\n".join(lines)


class NotificationQueue:
    def __init__(self, handler: NotificationHandler, logger: logging.Logger):
        self.handler = handler
        self.logger = logger
        self._lock = threading.Lock()
        self._pending: dict[tuple, PendingNotification] = {}
        self._thread = None
        self._running = False

    def start(self):
        if self._thread is not None and self._thread.is_alive():
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _run(self):
        while self._running:
            try:
                self.flush()
            except Exception as exc:
                self.logger.error(f"Notification queue error: {exc}")
            time.sleep(get_notification_interval())

    def add(self, event):
        widget_cfg = get_widget_notify_config(event)
        queue_enabled = bool(widget_cfg.get("queue", True))

        key = (event.widget, event.type, event.key, event.source)
        now_epoch = time.time()

        if not queue_enabled:
            title, body = build_event_notification(event)
            priority = get_notify_priority(event)
            self.handler.send_notification(title, body, priority)
            return

        with self._lock:
            pending = self._pending.get(key)
            if pending is None:
                pending = PendingNotification(
                    widget=event.widget,
                    event_type=event.type,
                    key=event.key,
                    source=event.source,
                    first_timestamp=event.timestamp,
                    last_timestamp=event.timestamp,
                    last_seen_epoch=now_epoch,
                    count=1,
                    message=event.message,
                    details=event.details,
                )
                self._pending[key] = pending
            else:
                pending.count += 1
                pending.last_timestamp = max(pending.last_timestamp, event.timestamp)
                pending.last_seen_epoch = now_epoch
                pending.message = event.message or pending.message
                pending.details = event.details or pending.details

            if event.type == "outage":
                is_open = bool((event.details or {}).get("open", False))
                pending.open = is_open
                if not is_open:
                    self._send_pending(key, pending)

    def _send_pending(self, key, pending: PendingNotification):
        title, body = build_pending_notification(pending)
        priority = get_notify_priority(pending)
        self.handler.send_notification(title, body, priority)
        self._pending.pop(key, None)

    def flush(self):
        now_epoch = time.time()
        to_send = []
        with self._lock:
            for key, pending in list(self._pending.items()):
                if pending.event_type == "outage" and pending.open:
                    continue
                if now_epoch - pending.last_seen_epoch >= get_notification_interval():
                    to_send.append((key, pending))

        for key, pending in to_send:
            self._send_pending(key, pending)


def setup_observer_notifications(observer, logger) -> None:
    try:
        apprise_urls = config["notifications"]["apprise_urls"].get(list)
    except Exception:
        apprise_urls = []

    if not apprise_urls:
        return

    notification_handler = NotificationHandler(apprise_urls)
    queue = NotificationQueue(notification_handler, logger)
    queue.start()

    def notify_event(event):
        try:
            if not should_notify_event(event):
                return
            queue.add(event)
        except Exception as exc:
            logger.error(f"Observer notification error: {exc}")

    observer.set_notify_callback(notify_event)
