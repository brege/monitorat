import json
import logging
import threading
import time
from datetime import datetime, timedelta

import confuse
import psutil
import yaml
from flask import jsonify, request, send_file

from monitorat.monitor import (
    CSVHandler,
    config,
    find_widget_items_source,
    get_data_path,
    is_demo_enabled,
    parse_iso_timestamp,
    register_snapshot_provider,
    reload_config,
    resolve_period_cutoff,
)

from .registry import (
    METRIC_REGISTRY,
    MetricContext,
    MetricValue,
    MetricValueType,
    build_metric_context,
)

logger = logging.getLogger(__name__)


def metrics_config():
    return config["widgets"]["metrics"]


def get_api_prefix():
    try:
        return metrics_config()["api_prefix"].get(str) or "metrics"
    except confuse.ConfigError:
        return "metrics"


def get_history_columns() -> list[str]:
    columns = metrics_config()["history"]["table"]["columns"].get(list)
    for key in columns:
        METRIC_REGISTRY.get_quantity(key)
    return columns


def get_csv_columns() -> list[str]:
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
    except confuse.ConfigError:
        interval = metrics_config()["daemon"]["interval"].get(int)
    return interval if interval > 0 else 60


def is_snapshots_enabled() -> bool:
    return metrics_config()["snapshots"]["enabled"].get(bool)


def get_snapshot_keys() -> list[str]:
    keys = metrics_config()["snapshots"]["quantities"].get(list)
    for key in keys:
        METRIC_REGISTRY.get_quantity(key)
    return keys


def get_chart_quantities() -> list[str]:
    chart_node = metrics_config()["history"]["chart"]["quantities"]
    if chart_node.exists():
        return chart_node.get(list)

    computed_groups = metrics_config()["history"]["computed"].get(list)
    computed_sources = {
        field["source"]
        for group in computed_groups
        if isinstance(group, dict)
        for field in group.get("fields", [])
        if isinstance(field, dict) and isinstance(field.get("source"), str)
    }

    chart_quantities = [
        key for key in get_history_columns() if key not in computed_sources
    ]
    for group in computed_groups:
        group_name = group.get("group") if isinstance(group, dict) else None
        if isinstance(group_name, str):
            chart_quantities.append(group_name)
    return chart_quantities


def get_storage_mounts() -> list[str]:
    return metrics_config()["snapshots"]["storage"]["mounts"].get(list)


def get_threshold_settings() -> dict[str, dict[str, float]]:
    return metrics_config()["thresholds"].get(dict)


def downsample_lttb(
    data: list[dict], target_points: int, value_key: str = "cpu_percent"
) -> list[dict]:
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
        bucket_end = min(bucket_end, n - 1)

        avg_x = 0
        avg_y = 0
        next_start = int((i + 2) * bucket_size) + 1
        next_end = int((i + 3) * bucket_size) + 1
        next_end = min(next_end, n - 1)
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
    metric_key: str, value: float, thresholds: dict[str, float]
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
    values: dict[str, MetricValue],
    thresholds: dict[str, dict[str, float]],
) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for key, rules in thresholds.items():
        value = values[key].value
        if not isinstance(value, (int, float)):
            continue
        statuses[key] = get_metric_status(key, float(value), rules)
    return statuses


def collect_metrics() -> tuple[
    MetricContext,
    dict[str, MetricValue],
    dict[str, str],
    list[str],
    list[str],
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

    collection_keys: list[str] = []
    for key in history_keys + snapshot_keys + threshold_keys + alert_keys:
        if key not in collection_keys:
            collection_keys.append(key)

    context = build_metric_context(get_storage_mounts())
    values = METRIC_REGISTRY.collect_values(collection_keys, context)
    statuses = build_metric_statuses(values, get_threshold_settings())
    return context, values, statuses, history_keys, snapshot_keys


def log_metrics_to_csv(
    values: dict[str, MetricValue],
    timestamp: datetime,
    source: str,
) -> None:
    columns = get_history_columns()
    row: dict[str, object] = {"timestamp": timestamp.isoformat(), "source": source}
    row.update(METRIC_REGISTRY.build_csv_row(columns, values))
    csv_handler.append(row)


def get_demo_metrics() -> dict[str, object]:
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
    api_prefix = get_api_prefix()
    metrics_snapshot = None
    for key in [api_prefix, "metrics"]:
        candidate = snapshot_payload.get(key)
        if isinstance(candidate, dict):
            metrics_snapshot = candidate
            break
    if metrics_snapshot is None:
        raise KeyError("Missing metrics snapshot")
    for key in ["timestamp", "values", "statuses"]:
        if key not in metrics_snapshot:
            raise KeyError(f"Missing metrics snapshot key: {key}")
    return {
        "timestamp": metrics_snapshot["timestamp"],
        "values": metrics_snapshot["values"],
        "statuses": metrics_snapshot["statuses"],
    }


def serialize_metric_values(
    values: dict[str, MetricValue], keys: list[str]
) -> dict[str, dict[str, MetricValueType]]:
    serialized: dict[str, dict[str, MetricValueType]] = {}
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
        except (
            OSError,
            KeyError,
            TypeError,
            ValueError,
            confuse.ConfigError,
            psutil.Error,
        ) as error:
            logger.error(f"Metrics daemon error: {error}")
        time.sleep(interval)


def check_metric_alerts(values: dict[str, MetricValue]) -> None:
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
    except confuse.NotFoundError:
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
    api_prefix = get_api_prefix()

    if not is_demo_enabled():
        start_metrics_daemon()
        from .events import register_metrics_observer

        register_metrics_observer()

    def metrics_snapshot():
        context, values, statuses, _, snapshot_keys = collect_metrics()
        return {
            "timestamp": context.timestamp.isoformat(),
            "values": serialize_metric_values(values, snapshot_keys),
            "statuses": statuses,
        }

    register_snapshot_provider("metrics", metrics_snapshot)

    def api_metrics_schema():
        import json
        from pathlib import Path

        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        schema.pop("metrics", None)
        schema.pop("computed", None)
        schema["quantities"] = METRIC_REGISTRY.serialize_quantities()
        schema["chart_quantities"] = get_chart_quantities()
        schema["api_prefix"] = api_prefix
        schema["endpoints"] = {
            "current": f"api/{api_prefix}",
            "history": f"api/{api_prefix}/history",
            "csv": f"api/{api_prefix}/csv",
            "schema": f"api/{api_prefix}/schema",
            "events": f"api/{api_prefix}/events",
        }
        return app.response_class(
            response=json.dumps(schema),
            status=200,
            mimetype="application/json",
        )

    def api_metrics():
        if is_demo_enabled():
            try:
                payload = get_demo_metrics()
            except (OSError, KeyError, ValueError) as error:
                logger.warning("Failed to read demo metrics snapshot: %s", error)
                context, values, statuses, _, snapshot_keys = collect_metrics()
                payload = {
                    "timestamp": context.timestamp.isoformat(),
                    "values": serialize_metric_values(values, snapshot_keys),
                    "statuses": statuses,
                }
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

    def build_metrics_events_payload(limit: int) -> dict:
        if is_demo_enabled():
            from .events import get_metrics_events_for_demo

            return {"events": get_metrics_events_for_demo(limit=limit)}

        from monitorat.observer import get_observer

        observer = get_observer()
        if observer is None:
            return {"events": [], "error": "Observer not running"}

        events = observer.event_store.read_all(widget="metrics", limit=limit)
        events = [event for event in events if event.get("type") != "checkpoint"]
        return {"events": events}

    def api_metrics_events():
        from flask import request

        limit = request.args.get("limit", 100, type=int)
        payload = build_metrics_events_payload(limit)
        return app.response_class(
            response=json.dumps(payload),
            status=200,
            mimetype="application/json",
        )

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
        except (OSError, KeyError, ValueError, confuse.ConfigError) as e:
            return app.response_class(
                response=json.dumps({"error": str(e)}),
                status=500,
                mimetype="application/json",
            )

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
        except (OSError, confuse.ConfigError) as e:
            return app.response_class(
                response=f"Error downloading CSV: {e!s}",
                status=500,
                mimetype="text/plain",
            )

    def is_editing_enabled():
        return config["site"]["editing"].get(bool)

    def _get_widget_config(widget_key):
        try:
            return config["widgets"][widget_key]
        except confuse.NotFoundError:
            return None

    def _get_config_list(widget_config, *keys):
        node = widget_config
        try:
            for key in keys:
                node = node[key]
            return node.get(list)
        except (confuse.NotFoundError, confuse.ConfigError):
            return []

    def api_metrics_source_get():
        if not is_editing_enabled():
            return jsonify({"error": "Editing is disabled"}), 403
        widget_key = request.args.get("widget", "metrics")
        widget_config = _get_widget_config(widget_key)
        source_path = find_widget_items_source(widget_key, key="snapshots")
        available = [
            {"key": quantity.key, "label": quantity.label}
            for quantity in METRIC_REGISTRY.list_quantities()
        ]
        quantities = (
            _get_config_list(widget_config, "snapshots", "quantities")
            if widget_config
            else []
        )
        return jsonify(
            {
                "quantities": quantities,
                "available": available,
                "path": str(source_path),
            }
        )

    def api_metrics_source_put():
        if not is_editing_enabled():
            return jsonify({"error": "Editing is disabled"}), 403
        widget_key = request.args.get("widget", "metrics")
        source_path = find_widget_items_source(widget_key, key="snapshots")
        payload = request.get_json()
        if not payload or not isinstance(payload.get("quantities"), list):
            return jsonify({"error": "quantities must be a list"}), 400
        quantities = payload["quantities"]
        for key in quantities:
            if not isinstance(key, str):
                return jsonify({"error": f"Invalid quantity key: {key}"}), 400
            try:
                METRIC_REGISTRY.get_quantity(key)
            except KeyError:
                return jsonify({"error": f"Unknown quantity: {key}"}), 400
        data = yaml.safe_load(source_path.read_text(encoding="utf-8")) or {}
        widget_block = data.setdefault("widgets", {}).setdefault(widget_key, {})
        snapshots = widget_block.setdefault("snapshots", {})
        snapshots["quantities"] = quantities
        source_path.write_text(
            yaml.safe_dump(data, sort_keys=False, default_flow_style=False),
            encoding="utf-8",
        )
        reload_config()
        return jsonify({"status": "ok"})

    app.add_url_rule(
        f"/api/{api_prefix}/schema",
        endpoint="api_metrics_schema",
        view_func=api_metrics_schema,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}",
        endpoint="api_metrics",
        view_func=api_metrics,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}/events",
        endpoint="api_metrics_events",
        view_func=api_metrics_events,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}/history",
        endpoint="api_metrics_history",
        view_func=api_metrics_history,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}/csv",
        endpoint="api_metrics_csv",
        view_func=api_metrics_csv,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}/source",
        endpoint="api_metrics_source_get",
        view_func=api_metrics_source_get,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{api_prefix}/source",
        endpoint="api_metrics_source_put",
        view_func=api_metrics_source_put,
        methods=["PUT"],
    )

    if api_prefix != "metrics":
        app.add_url_rule(
            "/api/metrics/schema",
            endpoint="api_metrics_schema_alias",
            view_func=api_metrics_schema,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics",
            endpoint="api_metrics_alias",
            view_func=api_metrics,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics/events",
            endpoint="api_metrics_events_alias",
            view_func=api_metrics_events,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics/history",
            endpoint="api_metrics_history_alias",
            view_func=api_metrics_history,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics/csv",
            endpoint="api_metrics_csv_alias",
            view_func=api_metrics_csv,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics/source",
            endpoint="api_metrics_source_get_alias",
            view_func=api_metrics_source_get,
            methods=["GET"],
        )
        app.add_url_rule(
            "/api/metrics/source",
            endpoint="api_metrics_source_put_alias",
            view_func=api_metrics_source_put,
            methods=["PUT"],
        )
        logger.info("Metrics alias routes registered at /api/metrics")

    logger.info(f"Metrics routes registered at /api/{api_prefix}")
