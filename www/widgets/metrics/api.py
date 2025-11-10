#!/usr/bin/env python3

import csv
import json
import os
import psutil
import threading
import time
import logging
from pathlib import Path
from datetime import datetime

from monitor import config, get_data_path, parse_iso_timestamp, resolve_period_cutoff
from flask import request, send_file

logger = logging.getLogger(__name__)


def metrics_config():
    return config["widgets"]["metrics"]


def is_daemon_enabled():
    return metrics_config()["daemon"]["enabled"].get(bool)


def get_collection_interval():
    interval = metrics_config()["daemon"]["interval_seconds"].get(int)
    return interval if interval > 0 else 60


def get_history_file():
    return metrics_config()["history"]["file"].get(str)


def get_history_max_rows():
    limit = metrics_config()["history"]["max_rows"].get(int)
    return limit if limit > 0 else 1000


def get_storage_mounts():
    return metrics_config()["storage"]["mounts"].get(list)


def get_threshold_settings():
    return metrics_config()["thresholds"].get(dict)


def get_uptime():
    """Get system uptime as formatted string"""
    try:
        with open("/proc/uptime", "r") as f:
            uptime_seconds = float(f.read().split()[0])

        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)

        if days > 0:
            return f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h {minutes}m"
        else:
            return f"{minutes}m"
    except Exception:
        return "Unknown"


def get_load_average():
    """Get 1min, 5min, 15min load averages"""
    try:
        return list(os.getloadavg())
    except Exception:
        return [0.0, 0.0, 0.0]


def get_metric_status(metric_type, value, thresholds=None):
    """Determine status (ok/caution/critical) for a metric"""
    thresholds = thresholds or {}
    metric_thresholds = thresholds.get(metric_type, {})

    comparator = value
    if metric_type == "load" and metric_thresholds.get("normalize_per_cpu", True):
        cpu_count = psutil.cpu_count()
        comparator = value / cpu_count if cpu_count else value

    caution = metric_thresholds.get("caution")
    critical = metric_thresholds.get("critical")

    if critical is not None and comparator > critical:
        return "critical"
    if caution is not None and comparator > caution:
        return "caution"
    return "ok"


def get_metrics_csv_path():
    """Get path to metrics CSV file"""
    filename = get_history_file()
    path = Path(filename)
    if path.is_absolute():
        return path
    return get_data_path() / path


def log_metrics_to_csv(metrics_data, source="refresh"):
    """Log metrics data to CSV file"""
    csv_path = get_metrics_csv_path()

    # Ensure directory exists
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    # Extract numeric values from metrics
    load_parts = metrics_data["load"].split()
    load_1min = float(load_parts[0]) if load_parts else 0.0

    # Parse memory usage
    memory_parts = metrics_data["memory"].split("/")
    memory_used_gb = (
        float(memory_parts[0].replace("GB", "").strip()) if memory_parts else 0.0
    )
    memory_total_gb = (
        float(memory_parts[1].replace("GB", "").strip())
        if len(memory_parts) > 1
        else 0.0
    )
    memory_percent = (
        (memory_used_gb / memory_total_gb * 100) if memory_total_gb > 0 else 0.0
    )

    # Parse temperature
    temp_c = (
        float(metrics_data["temp"].replace("°C", "").strip())
        if "Unknown" not in metrics_data["temp"]
        else 0.0
    )

    # Get I/O counters
    try:
        disk_io = psutil.disk_io_counters()
        disk_read_mb = disk_io.read_bytes / (1024**2) if disk_io else 0.0
        disk_write_mb = disk_io.write_bytes / (1024**2) if disk_io else 0.0

        net_io = psutil.net_io_counters()
        net_rx_mb = net_io.bytes_recv / (1024**2) if net_io else 0.0
        net_tx_mb = net_io.bytes_sent / (1024**2) if net_io else 0.0
    except Exception:
        disk_read_mb = disk_write_mb = net_rx_mb = net_tx_mb = 0.0

    # CPU percentage
    cpu_percent = psutil.cpu_percent(interval=0.1)

    row = [
        datetime.now().isoformat(),
        f"{cpu_percent:.1f}",
        f"{memory_percent:.1f}",
        f"{disk_read_mb:.1f}",
        f"{disk_write_mb:.1f}",
        f"{net_rx_mb:.1f}",
        f"{net_tx_mb:.1f}",
        f"{load_1min:.2f}",
        f"{temp_c:.1f}",
        source,
    ]

    # Write header if file doesn't exist
    file_exists = csv_path.exists()
    with open(csv_path, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(
                [
                    "timestamp",
                    "cpu_percent",
                    "memory_percent",
                    "disk_read_mb",
                    "disk_write_mb",
                    "net_rx_mb",
                    "net_tx_mb",
                    "load_1min",
                    "temp_c",
                    "source",
                ]
            )
        writer.writerow(row)


def resolve_storage_usage():
    mounts = get_storage_mounts()
    for path in mounts:
        try:
            if os.path.exists(path):
                usage = psutil.disk_usage(path)
                text = (
                    f"{usage.used / (1024**4):.1f}TB / "
                    f"{usage.total / (1024**4):.1f}TB ({usage.percent:.0f}%)"
                )
                return text, usage.percent
        except Exception:
            continue
    return "Not mounted", 0.0


def get_system_metrics():
    """Get all system metrics and their statuses"""
    try:
        # Get basic metrics
        uptime = get_uptime()
        load = get_load_average()
        load_str = f"{load[0]:.2f} {load[1]:.2f} {load[2]:.2f}"

        # Memory info
        memory = psutil.virtual_memory()
        memory_str = (
            f"{memory.used / (1024**3):.1f}GB / {memory.total / (1024**3):.1f}GB"
        )

        # Temperature
        try:
            sensors = psutil.sensors_temperatures()
            temp = 0
            if "coretemp" in sensors:
                temps = [s.current for s in sensors["coretemp"]]
                temp = max(temps) if temps else 0
            elif "cpu_thermal" in sensors:
                temp = sensors["cpu_thermal"][0].current
            elif "k10temp" in sensors:
                temps = [s.current for s in sensors["k10temp"]]
                temp = max(temps) if temps else 0
            else:
                # fallback: first available sensor group with plausible temps
                for entries in sensors.values():
                    for s in entries:
                        if 10 < s.current < 120:
                            temp = s.current
                            break
                    if temp:
                        break

            temp_str = f"{temp:.1f}°C"
        except Exception:
            temp = 0
            temp_str = "Unknown"

        # Disk usage
        disk = psutil.disk_usage("/")
        disk_str = f"{disk.used / (1024**3):.1f}GB / {disk.total / (1024**3):.1f}GB ({disk.percent:.0f}%)"

        storage_str, storage_percent = resolve_storage_usage()

        metrics = {
            "uptime": uptime,
            "load": load_str,
            "memory": memory_str,
            "temp": temp_str,
            "disk": disk_str,
            "storage": storage_str,
            "status": "Running",
            "lastUpdated": datetime.now().isoformat(),
        }

        thresholds = get_threshold_settings()
        statuses = {
            "load": get_metric_status("load", load[0], thresholds),
            "memory": get_metric_status("memory", memory.percent, thresholds),
            "temp": get_metric_status("temp", temp, thresholds),
            "disk": get_metric_status("disk", disk.percent, thresholds),
            "storage": get_metric_status("storage", storage_percent, thresholds),
        }

        return metrics, statuses

    except Exception as e:
        logger.error(f"Error getting system metrics: {e}")
        return {}, {}


_metrics_thread = None


def start_metrics_daemon():
    """Start background metrics collection thread"""
    global _metrics_thread
    if _metrics_thread is None or not _metrics_thread.is_alive():
        logger.info(
            "Starting metrics collection daemon (interval=%ss)",
            get_collection_interval(),
        )
        _metrics_thread = threading.Thread(target=_metrics_collector, daemon=True)
        _metrics_thread.start()
    else:
        logger.info("Metrics daemon already running")


def _metrics_collector():
    """Background thread for continuous metrics collection"""
    logger.info("Metrics collection thread started")
    while True:
        interval = get_collection_interval()
        try:
            if not is_daemon_enabled():
                time.sleep(interval)
                continue

            metrics, statuses = get_system_metrics()
            if metrics:
                log_metrics_to_csv(metrics, source="daemon")
                check_metric_alerts(metrics, statuses)
        except Exception as e:
            logger.error(f"Metrics daemon error: {e}")
        time.sleep(interval)


def check_metric_alerts(metrics, statuses):
    """Check metric values against alert thresholds and log alert events"""
    try:
        # Extract current metric values for alert checking
        load_parts = metrics["load"].split()
        load_1min = float(load_parts[0]) if load_parts else 0.0

        # Parse memory usage
        memory_parts = metrics["memory"].split("/")
        memory_used_gb = (
            float(memory_parts[0].replace("GB", "").strip()) if memory_parts else 0.0
        )
        memory_total_gb = (
            float(memory_parts[1].replace("GB", "").strip())
            if len(memory_parts) > 1
            else 0.0
        )
        memory_percent = (
            (memory_used_gb / memory_total_gb * 100) if memory_total_gb > 0 else 0.0
        )

        # Parse temperature
        temp_c = (
            float(metrics["temp"].replace("°C", "").strip())
            if "Unknown" not in metrics["temp"]
            else 0.0
        )

        # Parse disk usage
        disk_parts = metrics["disk"].split("(")
        disk_percent = (
            float(disk_parts[1].replace("%)", "").strip())
            if len(disk_parts) > 1
            else 0.0
        )

        # Parse storage usage
        if "Not mounted" not in metrics["storage"]:
            storage_parts = metrics["storage"].split("(")
            storage_percent = (
                float(storage_parts[1].replace("%)", "").strip())
                if len(storage_parts) > 1
                else 0.0
            )
        else:
            storage_percent = 0.0

        # Define metric checks - maps alert names to values and thresholds
        metric_checks = {
            "high_load": {
                "value": load_1min,
                "description": f"CPU load: {load_1min:.2f}",
            },
            "high_memory": {
                "value": memory_percent,
                "description": f"Memory usage: {memory_percent:.1f}%",
            },
            "high_temp": {
                "value": temp_c,
                "description": f"Temperature: {temp_c:.1f}°C",
            },
            "low_disk": {
                "value": disk_percent,
                "description": f"Disk usage: {disk_percent:.1f}%",
            },
            "low_storage": {
                "value": storage_percent,
                "description": f"Storage usage: {storage_percent:.1f}%",
            },
        }

        # Import here to avoid circular imports
        from monitor import config

        # Check if alerts are configured
        try:
            alerts_config = config["alerts"].get()
        except Exception:
            logger.debug("Alerts configuration not available; skipping metric checks")
            return
        rules = alerts_config.get("rules", {})
        if not rules:
            return

        # Check each configured alert rule
        for alert_name, rule in rules.items():
            if alert_name in metric_checks:
                threshold = rule.get("threshold")
                if threshold is None:
                    continue

                current_value = metric_checks[alert_name]["value"]
                description = metric_checks[alert_name]["description"]

                # Check if threshold exceeded
                if current_value > threshold:
                    # Log structured alert event
                    logger.warning(
                        f"Alert threshold exceeded: {description} > {threshold}",
                        extra={
                            "alert_type": "metric_threshold",
                            "alert_name": alert_name,
                            "alert_value": current_value,
                            "alert_threshold": threshold,
                        },
                    )

    except Exception as e:
        logger.error(f"Error checking metric alerts: {e}")
        import traceback

        logger.error(f"Alert check traceback: {traceback.format_exc()}")


def filter_data_by_period(data, period_str):
    """Filter data by natural time period (e.g., '1 hour', '30 days', '1 week')"""
    cutoff = resolve_period_cutoff(period_str)
    if cutoff is None:
        return data

    filtered_data = []
    for row in data:
        row_time = parse_iso_timestamp(row.get("timestamp"))
        if row_time and row_time >= cutoff:
            filtered_data.append(row)
    return filtered_data


def register_routes(app):
    """Register metrics API routes with Flask app"""

    # Start background metrics collection
    start_metrics_daemon()

    @app.route("/api/metrics", methods=["GET"])
    def api_metrics():
        metrics, statuses = get_system_metrics()

        # Log this refresh to CSV
        if metrics:
            try:
                log_metrics_to_csv(metrics, source="refresh")
            except Exception as e:
                logger.error(f"Error logging metrics: {e}")

        return app.response_class(
            response=json.dumps({"metrics": metrics, "metric_statuses": statuses}),
            status=200,
            mimetype="application/json",
        )

    @app.route("/api/metrics/history", methods=["GET"])
    def api_metrics_history():
        """Get historical metrics data from CSV with optional period filtering"""
        try:
            csv_path = get_metrics_csv_path()
            if not csv_path.exists():
                return app.response_class(
                    response=json.dumps({"data": []}),
                    status=200,
                    mimetype="application/json",
                )

            data = []
            with open(csv_path, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    data.append(row)

            # Apply period filtering if specified
            period = request.args.get("period")
            if period and period.lower() != "all":
                data = filter_data_by_period(data, period)

            # Return all filtered data
            return app.response_class(
                response=json.dumps({"data": data}),
                status=200,
                mimetype="application/json",
            )
        except Exception as e:
            return app.response_class(
                response=json.dumps({"error": str(e)}),
                status=500,
                mimetype="application/json",
            )

    @app.route("/api/metrics/csv", methods=["GET"])
    def api_metrics_csv():
        """Download the raw metrics CSV file"""
        try:
            csv_path = get_metrics_csv_path()
            if not csv_path.exists():
                return app.response_class(
                    response="No metrics data available",
                    status=404,
                    mimetype="text/plain",
                )

            return send_file(
                csv_path,
                as_attachment=True,
                download_name="metrics.csv",
                mimetype="text/csv",
            )
        except Exception as e:
            return app.response_class(
                response=f"Error downloading CSV: {str(e)}",
                status=500,
                mimetype="text/plain",
            )
