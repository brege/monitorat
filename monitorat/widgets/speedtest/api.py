from flask import request, jsonify, send_file
from subprocess import run, PIPE, TimeoutExpired
from json import loads
from datetime import datetime
import logging
from typing import List
from pathlib import Path
import json

from monitor import (
    CSVHandler,
    parse_iso_timestamp,
    resolve_period_cutoff,
    config,
    is_demo_enabled,
)

SPEEDTEST = "speedtest-cli"
logger = logging.getLogger(__name__)

SPEEDTEST_COLUMNS: List[str] = [
    "timestamp",
    "download",
    "upload",
    "ping",
    "server",
    "ip_address",
]
csv_handler = CSVHandler("speedtest", SPEEDTEST_COLUMNS)
_SPEEDTEST_SCHEMA = None


def get_speedtest_schema():
    global _SPEEDTEST_SCHEMA
    if _SPEEDTEST_SCHEMA is None:
        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path, encoding="utf-8") as f:
            _SPEEDTEST_SCHEMA = json.load(f)
    return _SPEEDTEST_SCHEMA


def get_enabled_metrics():
    try:
        enabled = config["widgets"]["speedtest"]["enabled"].get(list)
        return enabled if enabled else None
    except Exception:
        return None


def is_metric_enabled(metric):
    enabled = get_enabled_metrics()
    if enabled is None:
        return True
    return metric in enabled


def speedtest_run():
    if is_demo_enabled():
        return jsonify(success=False, error="Speedtest disabled in demo mode"), 403

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
            }
            if is_metric_enabled("server"):
                row["server"] = parsed["server"]["sponsor"]
            if is_metric_enabled("download"):
                row["download"] = str(parsed["download"])
            if is_metric_enabled("upload"):
                row["upload"] = str(parsed["upload"])
            if is_metric_enabled("ping"):
                row["ping"] = str(parsed["ping"])
            if is_metric_enabled("ip_address"):
                row["ip_address"] = parsed.get("client", {}).get("ip")
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
                ip_address=parsed.get("client", {}).get("ip"),
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
        return jsonify(entries=[row for row in reversed(recent)])
    except Exception as exc:
        return jsonify(error=str(exc)), 500


def speedtest_chart():
    now = datetime.now()

    period = request.args.get("period", default="all", type=str)
    period_cutoff = resolve_period_cutoff(period, now=now)
    schema = get_speedtest_schema()
    available_fields = [
        entry["field"] for entry in schema.get("metrics", []) if "field" in entry
    ]
    enabled = get_enabled_metrics()
    if enabled is None:
        metrics_to_include = set(available_fields)
    else:
        metrics_to_include = {field for field in enabled if field in available_fields}

    try:
        all_rows = csv_handler.read_all()

        entries = []

        for row in all_rows:
            timestamp = row.get("timestamp", "")
            download = row.get("download") if is_metric_enabled("download") else None
            upload = row.get("upload") if is_metric_enabled("upload") else None
            ping = row.get("ping") if is_metric_enabled("ping") else None
            server = row.get("server", "") if is_metric_enabled("server") else ""
            ip_address = (
                row.get("ip_address", "") if is_metric_enabled("ip_address") else ""
            )

            dt = parse_iso_timestamp(timestamp)
            if not dt:
                continue

            if period_cutoff is not None and dt < period_cutoff:
                continue

            entries.append(
                {
                    "timestamp": dt.isoformat(),
                    **(
                        {"download": download}
                        if "download" in metrics_to_include
                        else {}
                    ),
                    **({"upload": upload} if "upload" in metrics_to_include else {}),
                    **({"ping": ping} if "ping" in metrics_to_include else {}),
                    **({"server": server} if is_metric_enabled("server") else {}),
                    **(
                        {"ip_address": ip_address}
                        if is_metric_enabled("ip_address")
                        else {}
                    ),
                }
            )

        return jsonify({"entries": entries})
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

    @app.route("/api/speedtest/schema", methods=["GET"])
    def speedtest_schema():
        import json
        from pathlib import Path

        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        return app.response_class(
            response=json.dumps(schema),
            status=200,
            mimetype="application/json",
        )

    app.add_url_rule("/api/speedtest/run", view_func=speedtest_run, methods=["POST"])
    app.add_url_rule(
        "/api/speedtest/history", view_func=speedtest_history, methods=["GET"]
    )
    app.add_url_rule("/api/speedtest/chart", view_func=speedtest_chart, methods=["GET"])
    app.add_url_rule("/api/speedtest/csv", view_func=speedtest_csv, methods=["GET"])
