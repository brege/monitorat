#!/usr/bin/env python3

import json
import os
import psutil
import threading
import time
import logging
from datetime import datetime, timedelta
from typing import List

from monitor import (
    config,
    parse_iso_timestamp,
    resolve_period_cutoff,
    CSVHandler,
    is_demo_enabled,
    register_snapshot_provider,
    get_data_path,
)
from flask import request, send_file

logger = logging.getLogger(__name__)

METRICS_COLUMNS: List[str] = [
    "timestamp",
    "cpu_percent",
    "memory_percent",
    "disk_read_mb",
    "disk_write_mb",
    "net_rx_mb",
    "net_tx_mb",
    "load_1min",
    "temp_c",
    "battery_percent",
    "source",
]

csv_handler = CSVHandler("metrics", METRICS_COLUMNS)


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


def downsample_lttb(
    data: List[dict], target_points: int, value_key: str = "cpu_percent"
) -> List[dict]:
    """
    Downsample time series data using Largest Triangle Three Buckets (LTTB).
    Preserves visual shape while reducing point count.
    """
    n = len(data)
    if n <= target_points:
        return data

    sampled = [data[0]]
    bucket_size = (n - 2) / (target_points - 2)

    for i in range(target_points - 2):
        bucket_start = int((i + 1) * bucket_size) + 1
        bucket_end = int((i + 2) * bucket_size) + 1
        if bucket_end > n - 1:
            bucket_end = n - 1

        avg_x = 0
        avg_y = 0
        next_start = int((i + 2) * bucket_size) + 1
        next_end = int((i + 3) * bucket_size) + 1
        if next_end > n - 1:
            next_end = n - 1
        count = next_end - next_start
        if count > 0:
            for j in range(next_start, next_end):
                avg_x += j
                try:
                    avg_y += float(data[j].get(value_key, 0) or 0)
                except (ValueError, TypeError):
                    pass
            avg_x /= count
            avg_y /= count

        max_area = -1
        max_idx = bucket_start
        prev_x = len(sampled) - 1
        try:
            prev_y = float(sampled[-1].get(value_key, 0) or 0)
        except (ValueError, TypeError):
            prev_y = 0

        for j in range(bucket_start, bucket_end):
            try:
                curr_y = float(data[j].get(value_key, 0) or 0)
            except (ValueError, TypeError):
                curr_y = 0
            area = abs(
                (prev_x - avg_x) * (curr_y - prev_y) - (prev_x - j) * (avg_y - prev_y)
            )
            if area > max_area:
                max_area = area
                max_idx = j

        sampled.append(data[max_idx])

    sampled.append(data[-1])
    return sampled


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


def get_enabled_metrics():
    """Get list of enabled metrics from config (None = all enabled)"""
    try:
        enabled = metrics_config()["enabled"].get(list)
        return enabled if enabled else None
    except Exception:
        return None


def is_metric_enabled(metric_name):
    """Check if a metric should be collected and recorded"""
    enabled = get_enabled_metrics()
    if enabled is None:
        return True
    return metric_name in enabled


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


def log_metrics_to_csv(metrics_data, source="refresh"):
    """Log metrics data to CSV file"""

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

    # CPU percentage
    cpu_percent = psutil.cpu_percent(interval=0.1)

    # Battery percentage
    battery_percent = 0.0
    try:
        battery = psutil.sensors_battery()
        if battery:
            battery_percent = battery.percent
    except Exception:
        battery_percent = 0.0

    # Get I/O counters (always needed for CSV)
    try:
        disk_io = psutil.disk_io_counters()
        disk_read_mb = disk_io.read_bytes / (1024**2) if disk_io else 0.0
        disk_write_mb = disk_io.write_bytes / (1024**2) if disk_io else 0.0

        net_io = psutil.net_io_counters()
        net_rx_mb = net_io.bytes_recv / (1024**2) if net_io else 0.0
        net_tx_mb = net_io.bytes_sent / (1024**2) if net_io else 0.0
    except Exception:
        disk_read_mb = disk_write_mb = net_rx_mb = net_tx_mb = 0.0

    row = {
        "timestamp": datetime.now().isoformat(),
        "source": source,
    }

    if is_metric_enabled("cpu_percent"):
        row["cpu_percent"] = f"{cpu_percent:.1f}"
    if is_metric_enabled("memory_percent"):
        row["memory_percent"] = f"{memory_percent:.1f}"
    if is_metric_enabled("disk_read_mb"):
        row["disk_read_mb"] = f"{disk_read_mb:.1f}"
    if is_metric_enabled("disk_write_mb"):
        row["disk_write_mb"] = f"{disk_write_mb:.1f}"
    if is_metric_enabled("net_rx_mb"):
        row["net_rx_mb"] = f"{net_rx_mb:.1f}"
    if is_metric_enabled("net_tx_mb"):
        row["net_tx_mb"] = f"{net_tx_mb:.1f}"
    if is_metric_enabled("load_1min"):
        row["load_1min"] = f"{load_1min:.2f}"
    if is_metric_enabled("temp_c"):
        row["temp_c"] = f"{temp_c:.1f}"
    if is_metric_enabled("battery_percent"):
        row["battery_percent"] = f"{battery_percent:.1f}"

    csv_handler.append(row)


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

        return metrics, statuses, list(metrics.keys())

    except Exception as e:
        logger.error(f"Error getting system metrics: {e}")
        return {}, {}, []


def get_demo_metrics():
    snapshot_path = get_data_path() / "snapshot.jsonl"
    if snapshot_path.exists():
        with snapshot_path.open("r", encoding="utf-8") as handle:
            last_line = None
            for line in handle:
                if line.strip():
                    last_line = line
            if last_line is None:
                raise FileNotFoundError("snapshot.jsonl is empty")

        snapshot_entry = json.loads(last_line)
        if "snapshot" not in snapshot_entry:
            raise KeyError("Missing snapshot payload")
        snapshot_payload = snapshot_entry["snapshot"]
        if "metrics" not in snapshot_payload:
            raise KeyError("Missing metrics snapshot")
        metrics_snapshot = snapshot_payload["metrics"]
        for key in ["metrics", "metric_statuses", "metric_keys"]:
            if key not in metrics_snapshot:
                raise KeyError(f"Missing metrics snapshot key: {key}")
        return (
            metrics_snapshot["metrics"],
            metrics_snapshot["metric_statuses"],
            metrics_snapshot["metric_keys"],
        )

    return {}, {}, []


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

            metrics, statuses, _ = get_system_metrics()
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


def filter_data_by_period(data, period_str, now_override=None):
    """Filter data by natural time period (e.g., '1 hour', '30 days', '1 week')"""
    cutoff = resolve_period_cutoff(period_str, now_override)
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
    if not is_demo_enabled():
        start_metrics_daemon()

    def metrics_snapshot():
        metrics, statuses, keys = get_system_metrics()
        return {
            "metrics": metrics,
            "metric_statuses": statuses,
            "metric_keys": keys,
        }

    register_snapshot_provider("metrics", metrics_snapshot)

    @app.route("/api/metrics/schema", methods=["GET"])
    def api_metrics_schema():
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

    @app.route("/api/metrics", methods=["GET"])
    def api_metrics():
        if is_demo_enabled():
            metrics, statuses, keys = get_demo_metrics()
        else:
            metrics, statuses, keys = get_system_metrics()

        # Log this refresh to CSV
        if metrics and not is_demo_enabled():
            try:
                log_metrics_to_csv(metrics, source="refresh")
            except Exception as e:
                logger.error(f"Error logging metrics: {e}")

        return app.response_class(
            response=json.dumps(
                {"metrics": metrics, "metric_statuses": statuses, "keys": keys}
            ),
            status=200,
            mimetype="application/json",
        )

    @app.route("/api/metrics/history", methods=["GET"])
    def api_metrics_history():
        """Get historical metrics data with optional period filtering and downsampling."""
        try:
            data = csv_handler.read_all()
            period = request.args.get("period")
            if period and period.lower() != "all":
                now_override = None
                if is_demo_enabled() and data:
                    last_timestamp = parse_iso_timestamp(data[-1].get("timestamp"))
                    if last_timestamp:
                        now_override = last_timestamp + timedelta(minutes=1)
                data = filter_data_by_period(data, period, now_override)

            max_points_param = request.args.get("max_points")
            max_points = int(max_points_param) if max_points_param else 1500
            if len(data) > max_points:
                data = downsample_lttb(data, max_points)

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
            if not csv_handler.path.exists():
                return app.response_class(
                    response="No metrics data available",
                    status=404,
                    mimetype="text/plain",
                )

            return send_file(
                csv_handler.path,
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
