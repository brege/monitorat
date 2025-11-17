#!/usr/bin/env python3

import json
import logging
import schedule
import threading
import time as time_module
from datetime import datetime
from pathlib import Path
import sys

from confuse import ConfigError

sys.path.append(str(Path(__file__).parent.parent))
from monitor import (  # noqa: E402
    NotificationHandler,
    config,
    get_data_path,
    register_config_listener,
)

_scheduler_thread = None
_config_listener_registered = False
logger = logging.getLogger(__name__)


def reminders_enabled() -> bool:
    try:
        enabled_widgets = config["widgets"]["enabled"].get(list)
        if enabled_widgets:
            return "reminders" in enabled_widgets
    except ConfigError:
        pass

    try:
        return "reminders" in config["widgets"].keys()
    except Exception:
        return False


def get_reminders_json_path() -> Path:
    filename = config["widgets"]["reminders"]["state_file"].get(str)
    path = Path(filename)
    if not path.is_absolute():
        path = get_data_path() / path
    return path


def load_reminder_data():
    reminders_json = get_reminders_json_path()
    reminders_json.parent.mkdir(parents=True, exist_ok=True)
    if not reminders_json.exists():
        return {}
    try:
        with reminders_json.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        logger.warning("Reminder state file is corrupt; resetting data")
        return {}


def save_reminder_data(data):
    reminders_json = get_reminders_json_path()
    reminders_json.parent.mkdir(parents=True, exist_ok=True)
    with reminders_json.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, sort_keys=True)


def touch_reminder(reminder_id):
    data = load_reminder_data()
    data[reminder_id] = datetime.now().isoformat()
    save_reminder_data(data)
    return True


def cleanup_orphaned_reminders():
    """Remove reminder data for entries no longer in config"""
    data = load_reminder_data()

    reminders_items = config["widgets"]["reminders"]["items"].get(dict)
    if not reminders_items:
        return

    config_ids = set(reminders_items.keys())
    data_ids = set(data.keys())
    orphaned = data_ids - config_ids

    if orphaned:
        logger.info(f"Cleaning up orphaned reminder data: {orphaned}")
        for orphan_id in orphaned:
            del data[orphan_id]
        save_reminder_data(data)


def get_reminder_status():
    reminders_view = config["widgets"]["reminders"]
    reminder_items = reminders_view["items"].get(dict)
    if not reminder_items:
        return []

    # Clean up orphaned entries
    cleanup_orphaned_reminders()

    # Reload data after cleanup
    data = load_reminder_data()

    nudges = reminders_view["nudges"].get(list)
    urgents = reminders_view["urgents"].get(list)
    now = datetime.now()

    orange_min = min(urgents) if urgents else 0
    orange_max = max(nudges) if nudges else orange_min

    results = []
    for reminder_id, reminder_config in reminder_items.items():
        last_touch = data.get(reminder_id)
        if last_touch:
            last_touch_dt = datetime.fromisoformat(last_touch)
            days_since = (now - last_touch_dt).days
        else:
            days_since = None

        expiry_days = reminder_config.get("expiry_days", 90)

        if days_since is None:
            status = "never"
            days_remaining = None
        else:
            days_remaining = expiry_days - days_since
            if days_remaining <= 0:
                status = "expired"
            elif orange_min < days_remaining <= orange_max:
                status = "warning"
            else:
                status = "ok"

        results.append(
            {
                "id": reminder_id,
                "name": reminder_config.get("name") or reminder_id,
                "url": reminder_config["url"],
                "icon": reminder_config["icon"],
                "reason": reminder_config["reason"],
                "last_touch": last_touch,
                "days_since": days_since,
                "days_remaining": days_remaining,
                "status": status,
            }
        )

    return results


def _refresh_notification_schedule(log_prefix="[schedule] refreshed") -> None:
    """Rebuild the daily reminder schedule using the latest config."""
    schedule.clear("reminders")

    if not reminders_enabled():
        logger.info(f"{log_prefix} - reminders disabled; no schedule created")
        return

    check_time = config["widgets"]["reminders"]["time"].get(str)

    schedule.every().day.at(check_time).do(scheduled_notification_check).tag(
        "reminders"
    )
    logger.info(f"{log_prefix} - daily check at {check_time}")
    logger.info("Scheduled reminder jobs: %s", len(schedule.get_jobs("reminders")))


def _get_apprise_urls():
    reminders_view = config["widgets"]["reminders"]
    try:
        urls = reminders_view["apprise_urls"].get(list)
        if urls:
            return urls
    except ConfigError:
        pass

    try:
        return config["notifications"]["apprise_urls"].get(list)
    except ConfigError:
        return []


def send_notifications():
    if not reminders_enabled():
        return False

    reminders_view = config["widgets"]["reminders"]
    reminder_items = reminders_view["items"].get(dict)
    if not reminder_items:
        return False

    apprise_urls = _get_apprise_urls()
    if not apprise_urls:
        return False

    nudges = reminders_view["nudges"].get(list)
    urgents = reminders_view["urgents"].get(list)
    base_url = config["site"]["base_url"].get(str)

    # Create notification handler
    notification_handler = NotificationHandler(apprise_urls)

    reminders = get_reminder_status()
    notifications_sent = 0

    for reminder in reminders:
        days_remaining = reminder.get("days_remaining")
        if days_remaining is None:
            continue

        is_nudge = days_remaining in nudges
        is_urgent = days_remaining in urgents

        if is_urgent or is_nudge:
            if days_remaining <= 0:
                title = f"{reminder['name']} - EXPIRED"
                body = f"Your reminder expired {abs(days_remaining)} days ago"
                priority = 1  # high priority for all overdue items
            elif is_urgent:
                title = f"{reminder['name']} - {days_remaining} days left"
                body = f"Login expires in {days_remaining} days"
                priority = 1  # urgent
            else:  # nudge
                title = f"{reminder['name']} - {days_remaining} days remaining"
                body = f"Friendly reminder: reminder expires in {days_remaining} days"
                priority = 0  # normal

            body += (
                f"\n\nTouch to refresh: {base_url}/api/reminders/{reminder['id']}/touch"
            )

            logger.info(
                f"Sending notification for {reminder['name']}: {days_remaining} days remaining (priority: {priority})"
            )

            if notification_handler.send_notification(title, body, priority):
                notifications_sent += 1

    return notifications_sent


def send_test_notification(priority=0):
    """Send test notification with optional priority level

    Args:
        priority (int): Priority level (-1=low, 0=normal, 1=high)
    """
    apprise_urls = _get_apprise_urls()
    if not apprise_urls:
        return False

    notification_handler = NotificationHandler(apprise_urls)

    return notification_handler.send_test_notification(priority, "monitor@ reminder")


def scheduled_notification_check():
    """Function called by the scheduler"""
    if not reminders_enabled():
        logger.info("Skipping notification check because reminders are disabled")
        return

    logger.info("=== DAEMON NOTIFICATION CHECK START ===")

    # Debug: show all reminder statuses first
    reminders = get_reminder_status()
    logger.info(f"Found {len(reminders)} reminders:")
    for reminder in reminders:
        logger.info(
            f"  {reminder['id']}: {reminder['name']} - {reminder['days_remaining']} days remaining"
        )

    logger.info("Calling send_notifications()...")
    count = send_notifications()
    logger.info(f"=== DAEMON NOTIFICATION CHECK END - Sent {count} notifications ===")


def on_config_reloaded(_new_config):
    """Callback invoked when the global config reloads."""
    _refresh_notification_schedule("Updated reminder schedule")


def start_notification_daemon():
    """Start the background notification scheduler"""

    def run_scheduler():
        while True:
            schedule.run_pending()
            time_module.sleep(60)  # Check every minute

    global _scheduler_thread

    _refresh_notification_schedule("Starting notification daemon")

    if _scheduler_thread and _scheduler_thread.is_alive():
        return _scheduler_thread

    _scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    _scheduler_thread.start()

    return _scheduler_thread


def _ensure_scheduler_initialized():
    """Attach config listener and start scheduler once."""
    global _config_listener_registered
    if not _config_listener_registered:
        register_config_listener(on_config_reloaded)
        _config_listener_registered = True
    start_notification_daemon()


def register_routes(app):
    """Register reminder API routes with Flask app"""

    @app.route("/api/reminders", methods=["GET"])
    def api_reminders():
        reminders = get_reminder_status()
        from flask import jsonify

        return jsonify(reminders)

    @app.route("/api/reminders/<reminder_id>/touch", methods=["GET", "POST"])
    def api_reminder_touch(reminder_id):
        from flask import jsonify, redirect

        reminders_items = config["widgets"]["reminders"]["items"].get(dict)
        if reminder_id not in reminders_items:
            return jsonify({"error": "reminder not found"}), 404

        touch_reminder(reminder_id)
        reminder_url = reminders_items[reminder_id]["url"] or "/"
        return redirect(reminder_url)

    @app.route("/api/reminders/test-notification", methods=["POST"])
    def api_reminder_test_notification():
        from flask import jsonify

        result = send_test_notification()
        return jsonify({"success": result})

    _ensure_scheduler_initialized()
