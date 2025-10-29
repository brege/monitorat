#!/usr/bin/env python3

import json
import yaml
import apprise
import schedule
import threading
import time as time_module
from datetime import datetime, timedelta
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))
from monitor import config

BASE = Path(__file__).parent.parent.parent.parent

def get_reminders_json_path():
    data_dir = config['paths']['data'].get(str)
    if data_dir.startswith('/'):
        return Path(data_dir) / "reminders.json"
    else:
        return BASE / data_dir / "reminders.json"

def load_config():
    return config

def load_reminder_data():
    reminders_json = get_reminders_json_path()
    reminders_json.parent.mkdir(exist_ok=True)
    if not reminders_json.exists():
        return {}
    with open(reminders_json, 'r') as f:
        return json.load(f)

def save_reminder_data(data):
    reminders_json = get_reminders_json_path()
    reminders_json.parent.mkdir(exist_ok=True)
    with open(reminders_json, 'w') as f:
        json.dump(data, f, indent=2)

def touch_reminder(reminder_id):
    data = load_reminder_data()
    data[reminder_id] = datetime.now().isoformat()
    save_reminder_data(data)
    return True

def cleanup_orphaned_reminders():
    """Remove reminder data for entries no longer in config"""
    data = load_reminder_data()
    
    reminders_config = config['reminders'].get(dict)
    if not reminders_config:
        return
    
    config_ids = set(reminders_config.keys())
    data_ids = set(data.keys())
    orphaned = data_ids - config_ids
    
    if orphaned:
        print(f"Cleaning up orphaned reminder data: {orphaned}")
        for orphan_id in orphaned:
            del data[orphan_id]
        save_reminder_data(data)

def get_reminder_status():
    reminders_config = config['reminders'].get(dict)
    if not reminders_config:
        return []
    
    # Clean up orphaned entries
    cleanup_orphaned_reminders()
    
    # Reload data after cleanup
    data = load_reminder_data()
    
    nudges = config['reminders']['nudges'].get(list)
    urgents = config['reminders']['urgents'].get(list)
    
    # Calculate orange range: from min nudge to max urgent
    if nudges and urgents:
        orange_min = min(urgents) if urgents else 0
        orange_max = max(nudges) if nudges else 14
    else:
        orange_min, orange_max = 0, 14
    
    results = []
    # Skip config keys (nudges, urgents, time) and only process reminder items
    for reminder_id, reminder_config in reminders_config.items():
        if reminder_id in ['nudges', 'urgents', 'time']:
            continue
        last_touch = data.get(reminder_id)
        if last_touch:
            last_touch_dt = datetime.fromisoformat(last_touch)
            days_since = (datetime.now() - last_touch_dt).days
        else:
            days_since = None
        
        expiry_days = reminder_config.get('expiry_days', 90)
        
        if days_since is None:
            status = 'never'
            days_remaining = None
        else:
            days_remaining = expiry_days - days_since
            if days_remaining <= 0:
                status = 'expired'
            elif orange_min < days_remaining <= orange_max:
                status = 'warning'
            else:
                status = 'ok'
        
        results.append({
            'id': reminder_id,
            'name': reminder_config.get('name', reminder_id),
            'url': reminder_config.get('url', ''),
            'icon': reminder_config.get('icon', 'default.png'),
            'reason': reminder_config.get('reason', ''),
            'last_touch': last_touch,
            'days_since': days_since,
            'days_remaining': days_remaining,
            'status': status
        })
    
    return results

def send_notifications():
    pushover_config = config['reminders'].get(dict, {}).get('pushover', {})
    if not pushover_config:
        return False
    
    pushover_key = pushover_config.get('key')
    pushover_token = pushover_config.get('token')
    
    if not pushover_key or not pushover_token:
        return False
    
    apobj = apprise.Apprise()
    apobj.add(f"pover://{pushover_token}@{pushover_key}")
    
    nudges = config['reminders']['nudges'].get(list)
    urgents = config['reminders']['urgents'].get(list)
    base_url = config['site']['base_url'].get(str)
    
    reminders = get_reminder_status()
    notifications_sent = 0
    
    for reminder in reminders:
        days_remaining = reminder.get('days_remaining')
        if days_remaining is None:
            continue
            
        is_nudge = days_remaining in nudges
        is_urgent = days_remaining in urgents
        
        if is_urgent or is_nudge:
            if days_remaining <= 0:
                title = f"{reminder['name']} - EXPIRED"
                body = f"Your reminder expired {abs(days_remaining)} days ago"
                priority = 1  # urgent
            elif is_urgent:
                title = f"{reminder['name']} - {days_remaining} days left"
                body = f"Login expires in {days_remaining} days"
                priority = 1  # urgent
            else:  # nudge
                title = f"{reminder['name']} - {days_remaining} days remaining"
                body = f"Friendly reminder: reminder expires in {days_remaining} days"
                priority = 0  # normal
            
            body += f"\n\nTouch to refresh: {base_url}/api/reminders/{reminder['id']}/touch"
            
            print(f"  Sending notification for {reminder['name']}: {days_remaining} days remaining")
            apobj.notify(title=title, body=body)
            notifications_sent += 1
    
    return notifications_sent

def send_test_notification():
    pushover_config = config['reminders'].get(dict, {}).get('pushover', {})
    if not pushover_config:
        return False
    
    pushover_key = pushover_config.get('key')
    pushover_token = pushover_config.get('token')
    
    if not pushover_key or not pushover_token:
        return False
    
    apobj = apprise.Apprise()
    apobj.add(f"pover://{pushover_token}@{pushover_key}")
    
    return apobj.notify(
        title="beehiver reminder Test",
        body="Bzzz.. Test notification from beehinver"
    )

def scheduled_notification_check():
    """Function called by the scheduler"""
    print(f"[{datetime.now()}] === DAEMON NOTIFICATION CHECK START ===")
    
    # Debug: show all reminder statuses first
    reminders = get_reminder_status()
    print(f"  Found {len(reminders)} entries:")
    for reminder in reminders:
        print(f"    {reminder['id']}: {reminder['name']} - {reminder['days_remaining']} days remaining")
    
    print(f"[{datetime.now()}] Calling send_notifications() once...")
    count = send_notifications()
    print(f"[{datetime.now()}] === DAEMON NOTIFICATION CHECK END - Sent {count} notifications ===")

def start_notification_daemon():
    """Start the background notification scheduler"""
    def run_scheduler():
        while True:
            schedule.run_pending()
            time_module.sleep(60)  # Check every minute
    
    check_time = config['reminders']['time'].get(str)
    
    # Clear existing jobs first
    schedule.clear()
    schedule.every().day.at(check_time).do(scheduled_notification_check)
    
    print(f"[{datetime.now()}] Starting notification daemon - daily check at {check_time}")
    print(f"[{datetime.now()}] Scheduled jobs: {len(schedule.get_jobs())}")
    
    scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    
    return scheduler_thread

def register_routes(app):
    """Register reminder API routes with Flask app"""
    
    @app.route("/api/reminders", methods=["GET"])
    def api_reminders():
        reminders = get_reminder_status()
        return app.response_class(
            response=json.dumps(reminders),
            status=200,
            mimetype='application/json'
        )

    @app.route("/api/reminders/<reminder_id>/touch", methods=["GET", "POST"])
    def api_reminder_touch(reminder_id):
        from flask import jsonify, redirect
        reminders_config = config['reminders'].get(dict)
        if not reminders_config or reminder_id not in reminders_config:
            return jsonify({"error": "reminder not found"}), 404
        
        touch_reminder(reminder_id)
        reminder_url = reminders_config[reminder_id].get('url', '/')
        return redirect(reminder_url)

    @app.route("/api/reminders/test-notification", methods=["POST"])
    def api_reminder_test_notification():
        from flask import jsonify
        result = send_test_notification()
        return jsonify({"success": result})
