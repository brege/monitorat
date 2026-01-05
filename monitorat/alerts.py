#!/usr/bin/env python3

import logging
import time
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


class AlertHandler(logging.Handler):
    """Custom logging handler that processes alert events"""

    def __init__(self):
        super().__init__()
        self.logger = logging.getLogger(__name__)
        self.alert_states = {}  # Track alert states to prevent spam
        self.last_notification_times = {}  # Track cooldowns

    def emit(self, record):
        """Process log records for alert conditions"""
        try:
            # Only process records with alert_type extra data
            if not hasattr(record, "alert_type"):
                return

            # Check if alerts are configured
            try:
                alerts_config = config["alerts"].get()
                if not alerts_config:
                    return

                rules = alerts_config.get("rules", {})
                if not rules:
                    return

                # Get apprise URLs from shared notifications section
                try:
                    notifications_config = config["notifications"].get()
                    apprise_urls = notifications_config.get("apprise_urls", [])
                except Exception:
                    apprise_urls = []
                cooldown_minutes = alerts_config.get("cooldown_minutes", 30)

            except Exception:
                # Config not available or alerts not configured
                return

            # Extract alert data from log record
            alert_name = getattr(record, "alert_name", "unknown")
            alert_value = getattr(record, "alert_value", None)
            alert_threshold = getattr(record, "alert_threshold", None)

            # Check if this alert is configured
            if alert_name not in rules:
                return

            rule = rules[alert_name]

            # Check cooldown period
            now = time.time()
            last_notification = self.last_notification_times.get(alert_name, 0)
            if now - last_notification < (cooldown_minutes * 60):
                self.logger.debug(f"Alert {alert_name} in cooldown period")
                return

            # Send notification if apprise URLs configured
            if apprise_urls:
                notification_handler = NotificationHandler(apprise_urls)

                priority = rule.get("priority", 0)
                message = rule.get("message", f"Alert: {alert_name}")

                # Format title and body
                title = f"System Alert: {message}"
                body = f"{message}\nCurrent value: {alert_value}\nThreshold: {alert_threshold}"

                if notification_handler.send_notification(title, body, priority):
                    self.last_notification_times[alert_name] = now
                    self.logger.info(f"Alert notification sent for {alert_name}")
                else:
                    self.logger.error(
                        f"Failed to send alert notification for {alert_name}"
                    )
            else:
                self.logger.info(
                    f"Alert triggered: {alert_name} (no notifications configured)"
                )

        except Exception as e:
            self.logger.error(f"Error processing alert: {e}")


_alert_handler = None


def setup_alert_handler():
    """Setup the alert logging handler"""
    global _alert_handler
    if _alert_handler is None:
        _alert_handler = AlertHandler()
        # Add to root logger to catch all alert events
        logging.getLogger().addHandler(_alert_handler)
