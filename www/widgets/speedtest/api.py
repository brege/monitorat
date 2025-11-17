from flask import request, jsonify, send_file
from subprocess import run, PIPE, TimeoutExpired
from json import loads
from datetime import datetime
import logging

from monitor import get_csv_path, parse_iso_timestamp, resolve_period_cutoff

SPEEDTEST = "speedtest-cli"
logger = logging.getLogger(__name__)


def speedtest_run():
    logger.info("Starting speedtest run")
    csv_path = get_csv_path()
    if not csv_path.exists():
        csv_path.write_text("timestamp,download,upload,ping,server\n")

    try:
        proc = run(
            [SPEEDTEST, "--json"], stdout=PIPE, stderr=PIPE, text=True, timeout=100
        )
    except TimeoutExpired:
        logger.error("Speedtest timed out after 100 seconds")
        return jsonify(
            success=False, error="Speedtest timed out after 100 seconds"
        ), 500

    if proc.returncode:
        error_msg = proc.stderr.strip() or "speedtest-cli failed"
        logger.error(f"Speedtest failed: {error_msg}")
        return jsonify(success=False, error=error_msg), 500

    data = proc.stdout.strip()
    if data:
        try:
            parsed = loads(data)
            line = "{},{},{},{},{}\n".format(
                parsed["timestamp"],
                parsed["download"],
                parsed["upload"],
                parsed["ping"],
                parsed["server"]["sponsor"].replace(",", " "),
            )
            with csv_path.open("a") as f:
                f.write(line)
            download_mbps = parsed["download"] / 1_000_000
            upload_mbps = parsed["upload"] / 1_000_000
            logger.info(
                f"Speedtest completed: ↓{download_mbps:.1f} Mbps ↑{upload_mbps:.1f} Mbps {parsed['ping']:.1f}ms"
            )
            return jsonify(
                success=True,
                timestamp=parsed["timestamp"],
                download=parsed["download"],
                upload=parsed["upload"],
                ping=parsed["ping"],
                server=parsed["server"].get("sponsor"),
            )
        except Exception as e:
            logger.error(f"Error parsing speedtest results: {e}")
            return jsonify(success=False, error=str(e)), 500

    logger.error("Speedtest completed but returned no data")
    return jsonify(success=False, error="No data returned"), 500


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
            entries.append(
                {
                    "timestamp": timestamp,
                    "download": download,
                    "upload": upload,
                    "ping": ping,
                    "server": server,
                }
            )

        return jsonify(entries=entries)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


def speedtest_chart():
    now = datetime.now()

    period = request.args.get("period", default="all", type=str)
    period_cutoff = resolve_period_cutoff(period, now=now)

    csv_path = get_csv_path()
    if not csv_path.exists():
        return jsonify(labels=[], datasets=[])

    try:
        with csv_path.open("r") as f:
            lines = [line.strip() for line in f.readlines()[1:] if line.strip()]

        effective_cutoff = period_cutoff

        labels = []
        download_data = []
        upload_data = []
        ping_data = []

        for row in lines:
            parts = row.split(",", 4)
            if len(parts) < 5:
                continue
            timestamp, download, upload, ping, server = parts

            dt = parse_iso_timestamp(timestamp)
            if not dt:
                continue

            if effective_cutoff is not None and dt < effective_cutoff:
                continue

            try:
                download_mbps = float(download) / 1_000_000
                upload_mbps = float(upload) / 1_000_000
                ping_ms = float(ping)
            except (ValueError, TypeError):
                continue

            labels.append(dt.strftime("%m/%d %H:%M"))
            download_data.append(round(download_mbps, 2))
            upload_data.append(round(upload_mbps, 2))
            ping_data.append(round(ping_ms, 1))

        return jsonify(
            {
                "labels": labels,
                "datasets": [
                    {
                        "label": "Download (Mbps)",
                        "data": download_data,
                        "borderColor": "#3b82f6",
                        "backgroundColor": "rgba(59, 130, 246, 0.1)",
                        "tension": 0.1,
                        "yAxisID": "speed",
                    },
                    {
                        "label": "Upload (Mbps)",
                        "data": upload_data,
                        "borderColor": "#ef4444",
                        "backgroundColor": "rgba(239, 68, 68, 0.1)",
                        "tension": 0.1,
                        "yAxisID": "speed",
                    },
                    {
                        "label": "Ping (ms)",
                        "data": ping_data,
                        "borderColor": "#10b981",
                        "backgroundColor": "rgba(16, 185, 129, 0.1)",
                        "tension": 0.1,
                        "yAxisID": "ping",
                    },
                ],
            }
        )
    except Exception as exc:
        return jsonify(error=str(exc)), 500


def speedtest_csv():
    """Download the raw speedtest CSV file"""
    try:
        csv_path = get_csv_path()
        if not csv_path.exists():
            return "No speedtest data available", 404

        return send_file(
            csv_path,
            as_attachment=True,
            download_name="speedtest.csv",
            mimetype="text/csv",
        )
    except Exception as e:
        return f"Error downloading CSV: {str(e)}", 500


def register_routes(app):
    """Register speedtest API routes with Flask app."""

    app.add_url_rule("/api/speedtest/run", view_func=speedtest_run, methods=["POST"])
    app.add_url_rule(
        "/api/speedtest/history", view_func=speedtest_history, methods=["GET"]
    )
    app.add_url_rule("/api/speedtest/chart", view_func=speedtest_chart, methods=["GET"])
    app.add_url_rule("/api/speedtest/csv", view_func=speedtest_csv, methods=["GET"])
