from flask import request, jsonify, send_file
from subprocess import run, PIPE, TimeoutExpired
from json import loads
from datetime import datetime
import logging
from typing import List

from monitor import CSVHandler, parse_iso_timestamp, resolve_period_cutoff

SPEEDTEST = "speedtest-cli"
logger = logging.getLogger(__name__)

SPEEDTEST_COLUMNS: List[str] = ["timestamp", "download", "upload", "ping", "server"]
csv_handler = CSVHandler("speedtest", SPEEDTEST_COLUMNS)


def speedtest_run():
    logger.info("Starting speedtest run")

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
            row = {
                "timestamp": parsed["timestamp"],
                "download": str(parsed["download"]),
                "upload": str(parsed["upload"]),
                "ping": str(parsed["ping"]),
                "server": parsed["server"]["sponsor"].replace(",", " "),
            }
            csv_handler.append(row)
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

    try:
        all_rows = csv_handler.read_all()
        recent = all_rows[-limit:]
        entries = [row for row in reversed(recent)]
        return jsonify(entries=entries)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


def speedtest_chart():
    now = datetime.now()

    period = request.args.get("period", default="all", type=str)
    period_cutoff = resolve_period_cutoff(period, now=now)

    try:
        all_rows = csv_handler.read_all()

        labels = []
        download_data = []
        upload_data = []
        ping_data = []

        for row in all_rows:
            timestamp = row.get("timestamp", "")
            download = row.get("download", "")
            upload = row.get("upload", "")
            ping = row.get("ping", "")

            dt = parse_iso_timestamp(timestamp)
            if not dt:
                continue

            if period_cutoff is not None and dt < period_cutoff:
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
        if not csv_handler.path.exists():
            return "No speedtest data available", 404

        return send_file(
            csv_handler.path,
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
