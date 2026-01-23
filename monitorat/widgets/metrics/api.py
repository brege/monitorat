#!/usr/bin/env python3

import json
import logging
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

import psutil
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

from .registry import METRIC_REGISTRY, MetricContext, MetricValue, build_metric_context

logger = logging.getLogger(__name__)


def metrics_config():
    return config["widgets"]["metrics"]


def get_history_columns() -> List[str]:
    columns = metrics_config()["history"]["table"]["columns"].get(list)
    for key in columns:
        METRIC_REGISTRY.get_quantity(key)
    return columns


def get_csv_columns() -> List[str]:
    return ["timestamp", *get_history_columns(), "source"]


csv_handler = CSVHandler("metrics", get_csv_columns())


def is_daemon_enabled():
    return metrics_config()["daemon"]["enabled"].get(bool)


def get_collection_interval():
    try:
        legacy = metrics_config()["daemon"]["interval_seconds"]
        if legacy.exists():
            interval = legacy.get(int)
        else:
            interval = metrics_config()["daemon"]["interval"].get(int)
    except Exception:
        interval = metrics_config()["daemon"]["interval"].get(int)
    return interval if interval > 0 else 60


def is_snapshots_enabled() -> bool:
    return metrics_config()["snapshots"]["enabled"].get(bool)


def get_snapshot_keys() -> List[str]:
    keys = metrics_config()["snapshots"]["quantities"].get(list)
    for key in keys:
        METRIC_REGISTRY.get_quantity(key)
    return keys


def get_storage_mounts() -> List[str]:
    return metrics_config()["snapshots"]["storage"]["mounts"].get(list)


def get_threshold_settings() -> Dict[str, Dict[str, float]]:
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


def get_metric_status(
    metric_key: str, value: float, thresholds: Dict[str, float]
) -> str:
    comparator = value
    if metric_key == "load_1min" and thresholds.get("normalize_per_cpu", True):
        cpu_count = psutil.cpu_count() or 1
        comparator = value / cpu_count

    caution = thresholds.get("caution")
    critical = thresholds.get("critical")

    if critical is not None and comparator > critical:
        return "critical"
    if caution is not None and comparator > caution:
        return "caution"
    return "ok"


def build_metric_statuses(
    values: Dict[str, MetricValue],
    thresholds: Dict[str, Dict[str, float]],
) -> Dict[str, str]:
    statuses: Dict[str, str] = {}
    for key, rules in thresholds.items():
        value = values[key].value
        if value is None:
            continue
        statuses[key] = get_metric_status(key, value, rules)
    return statuses


def collect_metrics() -> Tuple[
    MetricContext,
    Dict[str, MetricValue],
    Dict[str, str],
    List[str],
    List[str],
]:
    history_keys = get_history_columns()
    snapshot_keys = get_snapshot_keys() if is_snapshots_enabled() else []
    threshold_keys = list(get_threshold_settings().keys())
    alert_keys = [
        "load_1min",
        "memory_percent",
        "temp_c",
        "disk_percent",
        "storage_percent",
    ]

    collection_keys: List[str] = []
    for key in history_keys + snapshot_keys + threshold_keys + alert_keys:
        if key not in collection_keys:
            collection_keys.append(key)

    context = build_metric_context(get_storage_mounts())
    values = METRIC_REGISTRY.collect_values(collection_keys, context)
    statuses = build_metric_statuses(values, get_threshold_settings())
    return context, values, statuses, history_keys, snapshot_keys


def log_metrics_to_csv(
    values: Dict[str, MetricValue],
    timestamp: datetime,
    source: str,
) -> None:
    columns = get_history_columns()
    row = {"timestamp": timestamp.isoformat(), "source": source}
    row.update(METRIC_REGISTRY.build_csv_row(columns, values))
    csv_handler.append(row)


def get_demo_metrics() -> Dict[str, object]:
    snapshot_path = get_data_path() / "snapshot.jsonl"
    if not snapshot_path.exists():
        raise FileNotFoundError("snapshot.jsonl not found")

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
    for key in ["timestamp", "values", "statuses"]:
        if key not in metrics_snapshot:
            raise KeyError(f"Missing metrics snapshot key: {key}")
    return {
        "timestamp": metrics_snapshot["timestamp"],
        "values": metrics_snapshot["values"],
        "statuses": metrics_snapshot["statuses"],
    }


def serialize_metric_values(
    values: Dict[str, MetricValue], keys: List[str]
) -> Dict[str, Dict[str, Optional[float]]]:
    serialized: Dict[str, Dict[str, Optional[float]]] = {}
    for key in keys:
        value = values[key]
        serialized[key] = {
            "key": value.key,
            "label": value.label,
            "unit": value.unit,
            "value": value.value,
        }
    return serialized


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

            context, values, _, history_keys, _ = collect_metrics()
            if history_keys:
                log_metrics_to_csv(values, context.timestamp, source="daemon")
            check_metric_alerts(values)
        except Exception as error:
            logger.error(f"Metrics daemon error: {error}")
        time.sleep(interval)


def check_metric_alerts(values: Dict[str, MetricValue]) -> None:
    metric_checks = {
        "high_load": {
            "key": "load_1min",
            "label": "CPU load",
        },
        "high_memory": {
            "key": "memory_percent",
            "label": "Memory usage",
        },
        "high_temp": {
            "key": "temp_c",
            "label": "Temperature",
        },
        "low_disk": {
            "key": "disk_percent",
            "label": "Disk usage",
        },
        "low_storage": {
            "key": "storage_percent",
            "label": "Storage usage",
        },
    }

    try:
        alerts_config = config["alerts"].get()
    except Exception:
        return
    if not alerts_config:
        return
    rules = alerts_config.get("rules", {})
    if not rules:
        return

    for alert_name, rule in rules.items():
        if alert_name not in metric_checks:
            continue

        threshold = rule.get("threshold")
        if threshold is None:
            continue

        metric_key = metric_checks[alert_name]["key"]
        value = values[metric_key].value
        if value is None:
            continue

        label = metric_checks[alert_name]["label"]
        if value > threshold:
            logger.warning(
                f"Alert threshold exceeded: {label} {value} > {threshold}",
                extra={
                    "alert_type": "metric_threshold",
                    "alert_name": alert_name,
                    "alert_value": value,
                    "alert_threshold": threshold,
                },
            )


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
        context, values, statuses, _, snapshot_keys = collect_metrics()
        return {
            "timestamp": context.timestamp.isoformat(),
            "values": serialize_metric_values(values, snapshot_keys),
            "statuses": statuses,
        }

    register_snapshot_provider("metrics", metrics_snapshot)

    @app.route("/api/metrics/schema", methods=["GET"])
    def api_metrics_schema():
        import json
        from pathlib import Path

        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        schema.pop("metrics", None)
        schema.pop("computed", None)
        schema["quantities"] = METRIC_REGISTRY.serialize_quantities()
        return app.response_class(
            response=json.dumps(schema),
            status=200,
            mimetype="application/json",
        )

    @app.route("/api/metrics", methods=["GET"])
    def api_metrics():
        if is_demo_enabled():
            payload = get_demo_metrics()
        else:
            context, values, statuses, history_keys, snapshot_keys = collect_metrics()
            if history_keys:
                log_metrics_to_csv(values, context.timestamp, source="refresh")
            payload = {
                "timestamp": context.timestamp.isoformat(),
                "values": serialize_metric_values(values, snapshot_keys),
                "statuses": statuses,
            }

        return app.response_class(
            response=json.dumps(payload),
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
                value_key = request.args.get("value_key")
                if not value_key:
                    history_columns = get_history_columns()
                    value_key = history_columns[0] if history_columns else None
                if value_key:
                    data = downsample_lttb(data, max_points, value_key=value_key)

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
