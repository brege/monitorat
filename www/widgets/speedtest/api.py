from flask import Blueprint, request, jsonify
from subprocess import run, PIPE, TimeoutExpired
from json import loads
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Import from main monitor module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from monitor import get_csv_path, config

SPEEDTEST = "speedtest-cli"

api = Blueprint('speedtest', __name__)

@api.route("/run", methods=["POST"])
def speedtest_run():
    csv_path = get_csv_path()
    if not csv_path.exists():
        csv_path.write_text("timestamp,download,upload,ping,server\n")

    try:
        proc = run([SPEEDTEST, "--json"], stdout=PIPE, stderr=PIPE, text=True, timeout=100)
    except TimeoutExpired:
        return jsonify(success=False, error="Speedtest timed out after 100 seconds"), 500

    if proc.returncode:
        return jsonify(success=False, error=proc.stderr.strip() or "speedtest-cli failed"), 500

    data = proc.stdout.strip()
    if data:
        try:
            parsed = loads(data)
            line = "{},{},{},{},{}\n".format(
                parsed["timestamp"],
                parsed["download"],
                parsed["upload"],
                parsed["ping"],
                parsed["server"]["sponsor"].replace(",", " ")
            )
            with csv_path.open("a") as f:
                f.write(line)
            return jsonify(
                success=True,
                timestamp=parsed["timestamp"],
                download=parsed["download"],
                upload=parsed["upload"],
                ping=parsed["ping"],
                server=parsed["server"].get("sponsor")
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500

    return jsonify(success=False, error="No data returned"), 500


@api.route("/history", methods=["GET"])
def speedtest_history():
    limit = request.args.get("limit", default=200, type=int)
    limit = max(1, min(limit or 200, 1000))

    csv_path = get_csv_path()
    if not csv_path.exists():
        return jsonify(entries=[])

    try:
        with csv_path.open("r") as f:
            lines = [line.strip() for line in f.readlines()[1:] if line.strip()]

        recent = lines[-limit:]
        entries = []
        for row in reversed(recent):
            parts = row.split(",", 4)
            if len(parts) < 5:
                continue
            timestamp, download, upload, ping, server = parts
            entries.append({
                "timestamp": timestamp,
                "download": download,
                "upload": upload,
                "ping": ping,
                "server": server
            })

        return jsonify(entries=entries)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@api.route("/chart", methods=["GET"])
def speedtest_chart():
    days = request.args.get("days", default=30, type=int)
    if days == -1:
        days = None
    else:
        days = max(1, min(days or 30, 365))
    
    csv_path = get_csv_path()
    if not csv_path.exists():
        return jsonify(labels=[], datasets=[])

    try:
        with csv_path.open("r") as f:
            lines = [line.strip() for line in f.readlines()[1:] if line.strip()]

        if days is not None:
            cutoff_date = datetime.now() - timedelta(days=days)
        else:
            cutoff_date = None
        
        labels = []
        download_data = []
        upload_data = []
        ping_data = []
        
        for row in lines:
            parts = row.split(",", 4)
            if len(parts) < 5:
                continue
            timestamp, download, upload, ping, server = parts
            
            try:
                if timestamp.endswith('Z'):
                    dt = datetime.fromisoformat(timestamp[:-1]).replace(tzinfo=timezone.utc)
                else:
                    dt = datetime.fromisoformat(timestamp)
                
                if dt.tzinfo:
                    dt = dt.replace(tzinfo=None)
                    
                if cutoff_date is not None and dt < cutoff_date:
                    continue
                    
                download_mbps = float(download) / 1_000_000
                upload_mbps = float(upload) / 1_000_000
                ping_ms = float(ping)
                
                labels.append(dt.strftime('%m/%d %H:%M'))
                download_data.append(round(download_mbps, 2))
                upload_data.append(round(upload_mbps, 2))
                ping_data.append(round(ping_ms, 1))
                
            except (ValueError, TypeError):
                continue

        return jsonify({
            "labels": labels,
            "datasets": [
                {
                    "label": "Download (Mbps)",
                    "data": download_data,
                    "borderColor": "#3b82f6",
                    "backgroundColor": "rgba(59, 130, 246, 0.1)",
                    "tension": 0.1,
                    "yAxisID": "speed"
                },
                {
                    "label": "Upload (Mbps)", 
                    "data": upload_data,
                    "borderColor": "#ef4444",
                    "backgroundColor": "rgba(239, 68, 68, 0.1)",
                    "tension": 0.1,
                    "yAxisID": "speed"
                },
                {
                    "label": "Ping (ms)",
                    "data": ping_data,
                    "borderColor": "#10b981",
                    "backgroundColor": "rgba(16, 185, 129, 0.1)",
                    "tension": 0.1,
                    "yAxisID": "ping"
                }
            ]
        })
    except Exception as exc:
        return jsonify(error=str(exc)), 500