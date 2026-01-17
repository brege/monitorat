#!/usr/bin/env python3

import json
import logging
import schedule
import tempfile
import threading
import time as time_module
from datetime import datetime
from pathlib import Path
import sys

import confuse
from confuse import ConfigError

sys.path.append(str(Path(__file__).parent.parent))
from monitor import (  # noqa: E402
    NotificationHandler,
    config,
    get_data_path,
    is_demo_enabled,
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


def get_reminders_view():
    return config["widgets"]["reminders"]


def reminders_edit_enabled() -> bool:
    try:
        edit_view = get_reminders_view()["edit"]
        return edit_view.exists() and edit_view.get(bool)
    except Exception:
        return False


def get_reminders_edit_path() -> Path | None:
    view = get_reminders_view()
    if not view["edit_file"].exists():
        return None
    edit_file_value = view["edit_file"].get()
    if edit_file_value is None or edit_file_value == "":
        return None
    edit_path = Path(view["edit_file"].as_filename())
    return edit_path if edit_path.exists() else None


def parse_reminders_yaml(content: str) -> dict:
    with tempfile.NamedTemporaryFile("w+", suffix=".yaml", delete=True) as handle:
        handle.write(content)
        handle.flush()
        data = confuse.load_yaml(handle.name, loader=config.loader)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError("Reminders YAML must be a mapping.")
    if "items" in data:
        items = data["items"]
        if not isinstance(items, dict):
            raise ValueError("Reminders items must be a mapping.")
        return items
    return data


def load_reminders_from_file(path: Path) -> dict:
    data = confuse.load_yaml(str(path), loader=config.loader)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError("Reminders YAML must be a mapping.")
    if "items" in data:
        items = data["items"]
        if not isinstance(items, dict):
            raise ValueError("Reminders items must be a mapping.")
        return items
    return data


def serialize_reminders_yaml(items: dict) -> str:
    def serialize_value(value):
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        return json.dumps(str(value))

    lines = []
    for reminder_id, reminder in items.items():
        lines.append(f"{reminder_id}:")
        if not isinstance(reminder, dict):
            lines.append(f"  value: {serialize_value(reminder)}")
            continue
        ordered_keys = ["name", "url", "icon", "expiry_days", "reason"]
        remaining_keys = [key for key in reminder.keys() if key not in ordered_keys]
        for key in ordered_keys + sorted(remaining_keys):
            if key not in reminder:
                continue
            value = reminder[key]
            lines.append(f"  {key}: {serialize_value(value)}")
    return "\n".join(lines) + "\n"


def get_reminders_items():
    view = get_reminders_view()
    edit_path = get_reminders_edit_path()
    if edit_path and edit_path.exists():
        return load_reminders_from_file(edit_path)
    items = view["items"].get(dict)
    return items or {}


def normalize_reminder_entry(reminder_id, reminder):
    if not isinstance(reminder_id, str) or not reminder_id.strip():
        raise ValueError("Reminder id must be a non-empty string.")
    if not isinstance(reminder, dict):
        raise ValueError("Reminder entry must be a mapping.")

    name = reminder.get("name") or reminder_id
    url = reminder.get("url")
    icon = reminder.get("icon")
    reason = reminder.get("reason")
    expiry_days = reminder.get("expiry_days")

    if not isinstance(url, str) or not url.strip():
        raise ValueError("Reminder url is required.")
    if not isinstance(icon, str) or not icon.strip():
        raise ValueError("Reminder icon is required.")
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError("Reminder reason is required.")

    if isinstance(expiry_days, str):
        if not expiry_days.strip().isdigit():
            raise ValueError("Reminder expiry_days must be a number.")
        expiry_days = int(expiry_days.strip())
    elif isinstance(expiry_days, (int, float)):
        expiry_days = int(expiry_days)
    else:
        raise ValueError("Reminder expiry_days must be a number.")

    if expiry_days <= 0:
        raise ValueError("Reminder expiry_days must be greater than zero.")

    normalized = dict(reminder)
    normalized["name"] = name
    normalized["url"] = url
    normalized["icon"] = icon
    normalized["reason"] = reason
    normalized["expiry_days"] = expiry_days
    return normalized


def build_preview_entry(reminder_id, reminder):
    normalized = normalize_reminder_entry(reminder_id, reminder)
    expiry_days = normalized["expiry_days"]
    return {
        "id": reminder_id,
        "name": normalized["name"],
        "url": normalized["url"],
        "icon": normalized["icon"],
        "reason": normalized["reason"],
        "last_touch": None,
        "days_since": None,
        "days_remaining": expiry_days,
        "status": "ok",
    }


def build_reminder_template(reminder_id="new-reminder"):
    return serialize_reminders_yaml(
        {
            reminder_id: {
                "name": "New Reminder",
                "url": "https://example.com",
                "icon": "favicon.svg",
                "expiry_days": 30,
                "reason": "Describe why you need to check this.",
            }
        }
    )


def get_reminders_json_path() -> Path:
    filename = get_reminders_view()["state_file"].get(str)
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

    reminders_items = get_reminders_items()
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
    reminders_view = get_reminders_view()
    reminder_items = get_reminders_items()
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

    check_time = get_reminders_view()["time"].get(str)

    schedule.every().day.at(check_time).do(scheduled_notification_check).tag(
        "reminders"
    )
    logger.info(f"{log_prefix} - daily check at {check_time}")
    logger.info("Scheduled reminder jobs: %s", len(schedule.get_jobs("reminders")))


def _get_apprise_urls():
    reminders_view = get_reminders_view()
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
    if is_demo_enabled():
        return False
    if not reminders_enabled():
        return False

    reminders_view = get_reminders_view()
    reminder_items = get_reminders_items()
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
    if is_demo_enabled():
        return False
    apprise_urls = _get_apprise_urls()
    if not apprise_urls:
        return False

    notification_handler = NotificationHandler(apprise_urls)

    return notification_handler.send_test_notification(priority, "monitorat reminder")


def scheduled_notification_check():
    """Function called by the scheduler"""
    if is_demo_enabled():
        logger.info("Skipping notification check in demo mode")
        return
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
    if is_demo_enabled():
        return
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

        if is_demo_enabled():
            return jsonify({"error": "reminders disabled in demo mode"}), 403
        reminders_items = get_reminders_items()
        if reminder_id not in reminders_items:
            return jsonify({"error": "reminder not found"}), 404

        touch_reminder(reminder_id)
        reminder_url = reminders_items[reminder_id]["url"] or "/"
        return redirect(reminder_url)

    @app.route("/api/reminders/test-notification", methods=["POST"])
    def api_reminder_test_notification():
        from flask import jsonify

        if is_demo_enabled():
            return jsonify({"error": "reminders disabled in demo mode"}), 403
        result = send_test_notification()
        return jsonify({"success": result})

    @app.route("/api/reminders/schema", methods=["GET"])
    def api_reminders_schema():
        import json

        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        from flask import jsonify

        return jsonify(schema)

    @app.route("/api/reminders/source", methods=["GET"])
    def api_reminders_source():
        from flask import jsonify, request

        if not reminders_edit_enabled():
            return jsonify({"error": "Reminders editing is disabled"}), 403

        edit_path = get_reminders_edit_path()
        if not edit_path:
            return jsonify({"error": "Reminders edit_file not configured"}), 404

        reminder_id = request.args.get("reminder")
        reminders_items = get_reminders_items()
        if reminder_id:
            reminder_entry = reminders_items.get(reminder_id)
            if reminder_entry:
                content = serialize_reminders_yaml({reminder_id: reminder_entry})
            else:
                content = build_reminder_template(reminder_id)
        else:
            content = build_reminder_template()

        return jsonify(
            {
                "content": content,
                "path": str(edit_path),
                "reminder": reminder_id,
            }
        )

    @app.route("/api/reminders/source", methods=["PUT"])
    def api_reminders_source_put():
        from flask import jsonify, request

        if not reminders_edit_enabled():
            return jsonify({"error": "Reminders editing is disabled"}), 403

        edit_path = get_reminders_edit_path()
        if not edit_path:
            return jsonify({"error": "Reminders edit_file not configured"}), 404

        payload = request.get_json()
        if not payload or "content" not in payload:
            return jsonify({"error": "Missing content"}), 400

        content = payload["content"]
        reminder_id = request.args.get("reminder")

        try:
            parsed_items = parse_reminders_yaml(content)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        if not parsed_items:
            return jsonify({"error": "Reminder YAML is empty"}), 400

        if reminder_id:
            if reminder_id not in parsed_items or len(parsed_items) != 1:
                return jsonify({"error": "Reminder id mismatch"}), 400
            target_id = reminder_id
            reminder_entry = parsed_items[reminder_id]
        else:
            if len(parsed_items) != 1:
                return jsonify({"error": "Reminder YAML must contain one entry"}), 400
            target_id = next(iter(parsed_items.keys()))
            reminder_entry = parsed_items[target_id]

        try:
            normalized_entry = normalize_reminder_entry(target_id, reminder_entry)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        existing_items = get_reminders_items()
        updated_items = dict(existing_items)
        updated_items[target_id] = normalized_entry

        edit_path.parent.mkdir(parents=True, exist_ok=True)
        edit_path.write_text(serialize_reminders_yaml(updated_items), encoding="utf-8")

        return jsonify({"status": "ok", "reminder": target_id})

    @app.route("/api/reminders/source", methods=["DELETE"])
    def api_reminders_source_delete():
        from flask import jsonify, request

        if not reminders_edit_enabled():
            return jsonify({"error": "Reminders editing is disabled"}), 403

        edit_path = get_reminders_edit_path()
        if not edit_path:
            return jsonify({"error": "Reminders edit_file not configured"}), 404

        reminder_id = request.args.get("reminder")
        if not reminder_id:
            return jsonify({"error": "Missing reminder id"}), 400

        existing_items = get_reminders_items()
        if reminder_id not in existing_items:
            return jsonify({"error": "Reminder not found"}), 404

        updated_items = dict(existing_items)
        del updated_items[reminder_id]

        edit_path.parent.mkdir(parents=True, exist_ok=True)
        edit_path.write_text(serialize_reminders_yaml(updated_items), encoding="utf-8")

        return jsonify({"status": "ok", "reminder": reminder_id})

    @app.route("/api/reminders/preview", methods=["POST"])
    def api_reminders_preview():
        from flask import jsonify, request

        if not reminders_edit_enabled():
            return jsonify({"error": "Reminders editing is disabled"}), 403

        payload = request.get_json()
        if not payload or "content" not in payload:
            return jsonify({"error": "Missing content"}), 400

        content = payload["content"]
        try:
            parsed_items = parse_reminders_yaml(content)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        if len(parsed_items) != 1:
            return jsonify({"error": "Reminder YAML must contain one entry"}), 400

        reminder_id = next(iter(parsed_items.keys()))
        reminder_entry = parsed_items[reminder_id]
        try:
            preview_entry = build_preview_entry(reminder_id, reminder_entry)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        return jsonify({"reminder": preview_entry})

    _ensure_scheduler_initialized()
