#!/usr/bin/env python3

import json
import logging
import os
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
import shutil
import subprocess

from monitor import (
    config,
    register_snapshot_provider,
    get_data_path,
    is_demo_enabled,
    reload_config,
    find_widget_items_source,
    load_widget_items_from_file,
    write_widget_items_to_file,
)

logger = logging.getLogger(__name__)

BASE = Path(__file__).parent.parent.parent.parent


def get_services_view():
    return config["widgets"]["services"]


def services_items():
    view = get_services_view()
    return view["items"].get(dict)


def services_edit_enabled() -> bool:
    try:
        return config["site"]["editing"].get(bool)
    except Exception:
        return False


def serialize_service_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        if not value:
            return "[]"
        return "[" + ", ".join(json.dumps(str(item)) for item in value) + "]"
    return json.dumps(str(value))


def serialize_services_yaml(items: dict) -> str:
    lines = []
    for service_id, service in items.items():
        lines.append(f"{service_id}:")
        if not isinstance(service, dict):
            lines.append(f"  value: {serialize_service_value(service)}")
            continue
        ordered_keys = [
            "name",
            "url",
            "local",
            "icon",
            "containers",
            "services",
            "timers",
            "user",
            "chrome",
        ]
        remaining_keys = [key for key in service.keys() if key not in ordered_keys]
        for key in ordered_keys + sorted(remaining_keys):
            if key not in service:
                continue
            value = service[key]
            if key == "user" and value is False:
                continue
            if key == "chrome" and value is False:
                continue
            if key == "local" and (not value or value == service.get("url")):
                continue
            if key in ("containers", "services", "timers") and not value:
                continue
            lines.append(f"  {key}: {serialize_service_value(value)}")
    return "\n".join(lines) + "\n"


def normalize_service_entry(service_id: str, service: dict) -> dict:
    if not isinstance(service_id, str) or not service_id.strip():
        raise ValueError("Service id must be a non-empty string.")
    if not isinstance(service, dict):
        raise ValueError("Service entry must be a mapping.")

    name = service.get("name") or service_id
    url = service.get("url")
    local = service.get("local")
    icon = service.get("icon")
    containers = service.get("containers")
    services = service.get("services")
    timers = service.get("timers")
    user = service.get("user", False)
    chrome = service.get("chrome", False)

    if url is None:
        url = ""
    if not isinstance(url, str):
        raise ValueError("Service url must be a string.")
    url = url.strip()

    if local is not None:
        if not isinstance(local, str):
            raise ValueError("Service local must be a string.")
        local = local.strip() or None

    if icon is None:
        icon = ""
    if not isinstance(icon, str):
        raise ValueError("Service icon must be a string.")
    icon = icon.strip()

    def normalize_list(value, field_name):
        if value is None:
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            result = []
            for item in value:
                if not isinstance(item, str):
                    raise ValueError(f"Service {field_name} items must be strings.")
                if item.strip():
                    result.append(item.strip())
            return result
        raise ValueError(
            f"Service {field_name} must be a list or comma-separated string."
        )

    containers = normalize_list(containers, "containers")
    services = normalize_list(services, "services")
    timers = normalize_list(timers, "timers")

    if isinstance(user, str):
        lowered = user.strip().lower()
        if lowered in ("true", "false"):
            user = lowered == "true"
        else:
            raise ValueError("Service user must be true or false.")
    elif not isinstance(user, bool):
        raise ValueError("Service user must be true or false.")

    if isinstance(chrome, str):
        lowered = chrome.strip().lower()
        if lowered in ("true", "false"):
            chrome = lowered == "true"
        else:
            raise ValueError("Service chrome must be true or false.")
    elif not isinstance(chrome, bool):
        raise ValueError("Service chrome must be true or false.")

    normalized = dict(service)
    normalized["name"] = name
    normalized["url"] = url
    normalized["local"] = local
    normalized["icon"] = icon
    normalized["containers"] = containers
    normalized["services"] = services
    normalized["timers"] = timers
    normalized["user"] = user
    normalized["chrome"] = chrome
    return normalized


def build_service_template(service_id="new-service"):
    return serialize_services_yaml(
        {
            service_id: {
                "name": "New Service",
                "url": "",
                "icon": "",
            }
        }
    )


def build_service_item(service_id="new-service"):
    return {
        "name": "New Service",
        "url": "",
        "local": "",
        "icon": "",
        "containers": [],
        "services": [],
        "timers": [],
        "user": False,
        "chrome": False,
    }


def sanitize_icon_filename(filename: str) -> str:
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", filename)
    safe_name = safe_name.strip("-._")
    return safe_name


@lru_cache(maxsize=1)
def load_status_schema() -> dict:
    schema_path = Path(__file__).parent / "schema.json"
    return json.loads(schema_path.read_text(encoding="utf-8"))["status"]


def build_status_entry(entry: dict, reason: str | None = None) -> dict:
    status = entry["status"]
    entry_reason = entry.get("reason")
    return {"status": status, "reason": reason if reason is not None else entry_reason}


def get_docker_status(services_config: dict) -> dict:
    """Get status of Docker containers"""
    container_statuses = {}
    configured_containers = []
    for service_info in services_config.values():
        containers = service_info.get("containers")
        if containers:
            configured_containers.extend(containers)

    # Check if docker is available before trying to run commands
    if not configured_containers:
        return container_statuses

    if not shutil.which("docker"):
        logger.debug("Docker not available in PATH, skipping Docker status check")
        status_schema = load_status_schema()
        docker_schema = status_schema["docker"]
        unavailable_entry = docker_schema["unavailable"]
        for container_name in configured_containers:
            container_statuses[container_name] = build_status_entry(unavailable_entry)
        return container_statuses

    try:
        result = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        status_schema = load_status_schema()
        docker_schema = status_schema["docker"]
        running_entry = docker_schema["running"]
        not_running_entry = docker_schema["not_running"]
        missing_entry = docker_schema["missing"]
        unavailable_entry = docker_schema["unavailable"]

        if result.returncode != 0:
            reason = result.stderr.strip() or None
            for container_name in configured_containers:
                container_statuses[container_name] = build_status_entry(
                    unavailable_entry, reason=reason
                )
            return container_statuses

        observed_states = {}
        for line in result.stdout.strip().split("\n"):
            if "\t" in line:
                name, state = line.split("\t", 1)
                observed_states[name] = state.strip().lower()

        for container_name in configured_containers:
            state = observed_states.get(container_name)
            if state is None:
                container_statuses[container_name] = build_status_entry(missing_entry)
            elif "running" in state:
                container_statuses[container_name] = build_status_entry(running_entry)
            else:
                container_statuses[container_name] = build_status_entry(
                    not_running_entry
                )

    except Exception as exception:
        logger.error(f"Docker command exception: {exception}")
        status_schema = load_status_schema()
        docker_schema = status_schema["docker"]
        unavailable_entry = docker_schema["unavailable"]
        for container_name in configured_containers:
            container_statuses[container_name] = build_status_entry(unavailable_entry)

    return container_statuses


def get_systemd_status():
    """Get status of systemd services and timers"""
    service_statuses = {}

    services_config = services_items()
    if not services_config:
        return service_statuses

    status_schema = load_status_schema()
    systemd_schema = status_schema["systemd"]
    returncode_map = systemd_schema["returncodes"]
    stderr_contains = systemd_schema["stderrContains"]
    error_entry = returncode_map["1"]

    user_identifier = config["widgets"]["services"]["uid"].get(int)
    user_environment = {
        "XDG_RUNTIME_DIR": f"/run/user/{user_identifier}",
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path=/run/user/{user_identifier}/bus",
    }

    for service_info in services_config.values():
        is_user_service = service_info.get("user", False)
        if not isinstance(is_user_service, bool):
            raise ValueError("Service entry user flag must be a boolean.")
        if "services" in service_info:
            for service in service_info["services"]:
                try:
                    environment = os.environ.copy()
                    command = ["systemctl"]
                    if is_user_service:
                        command.append("--user")
                        environment.update(user_environment)
                    command.extend(["is-active", service])
                    result = subprocess.run(
                        command,
                        env=environment,
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    returncode_key = str(result.returncode)
                    entry = returncode_map.get(returncode_key)
                    stderr_text = result.stderr.strip()
                    stderr_lower = stderr_text.lower()
                    override_entry = None
                    for needle, mapping_entry in stderr_contains.items():
                        if needle in stderr_lower:
                            override_entry = mapping_entry
                            break
                    if override_entry is not None:
                        entry = override_entry
                    reason = stderr_text or None
                    service_statuses[service] = build_status_entry(
                        entry or error_entry, reason=reason
                    )
                except Exception as exception:
                    logger.error(f"Error checking service {service}: {exception}")
                    service_statuses[service] = build_status_entry(
                        error_entry, reason=str(exception)
                    )
        if "timers" in service_info:
            for timer in service_info["timers"]:
                try:
                    timer_name = timer if timer.endswith(".timer") else f"{timer}.timer"
                    environment = os.environ.copy()
                    command = ["systemctl"]
                    if is_user_service:
                        command.append("--user")
                        environment.update(user_environment)
                    command.extend(["is-active", timer_name])
                    result = subprocess.run(
                        command,
                        env=environment,
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    returncode_key = str(result.returncode)
                    entry = returncode_map.get(returncode_key)
                    stderr_text = result.stderr.strip()
                    stderr_lower = stderr_text.lower()
                    override_entry = None
                    for needle, mapping_entry in stderr_contains.items():
                        if needle in stderr_lower:
                            override_entry = mapping_entry
                            break
                    if override_entry is not None:
                        entry = override_entry
                    reason = stderr_text or None
                    service_statuses[timer] = build_status_entry(
                        entry or error_entry, reason=reason
                    )
                except Exception as exception:
                    logger.error(f"Error checking timer {timer}: {exception}")
                    service_statuses[timer] = build_status_entry(
                        error_entry, reason=str(exception)
                    )

    return service_statuses


def get_service_status():
    """Get combined status of all services"""
    if is_demo_enabled():
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
        entry = json.loads(last_line)
        if "snapshot" not in entry:
            raise KeyError("Missing snapshot payload")
        snapshot_payload = entry["snapshot"]
        if "services" not in snapshot_payload:
            raise KeyError("Missing services snapshot")
        return snapshot_payload["services"]

    services_config = services_items()
    docker_status = get_docker_status(services_config)
    systemd_status = get_systemd_status()

    # Combine both status dictionaries
    all_status = {**docker_status, **systemd_status}

    return all_status


def register_routes(app):
    """Register services API routes with Flask app"""

    def services_snapshot():
        return get_service_status()

    register_snapshot_provider("services", services_snapshot)

    @app.route("/api/services", methods=["GET"])
    def api_services():
        from flask import jsonify

        items = services_items()
        return jsonify({"services": items})

    @app.route("/api/services/status", methods=["GET"])
    def api_services_status():
        status = get_service_status()
        return app.response_class(
            response=json.dumps(status), status=200, mimetype="application/json"
        )

    @app.route("/api/services/schema", methods=["GET"])
    def api_services_schema():
        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        return app.response_class(
            response=json.dumps(schema), status=200, mimetype="application/json"
        )

    @app.route("/api/services/source", methods=["GET"])
    def api_services_source():
        from flask import jsonify, request

        if not services_edit_enabled():
            return jsonify({"error": "Services editing is disabled"}), 403

        try:
            edit_path = find_widget_items_source("services")
        except Exception as error:
            return jsonify({"error": str(error)}), 500

        service_key = request.args.get("service")
        all_services = services_items()
        if service_key:
            service_entry = all_services.get(service_key)
            item = service_entry or build_service_item(service_key)
        else:
            service_key = "new-service"
            item = build_service_item(service_key)

        img_root = Path(config["paths"]["img"].as_filename())
        return jsonify(
            {
                "item": item,
                "path": str(edit_path),
                "service": service_key,
                "img_root": str(img_root),
            }
        )

    @app.route("/api/services/source", methods=["PUT"])
    def api_services_source_put():
        from flask import jsonify, request

        if not services_edit_enabled():
            return jsonify({"error": "Services editing is disabled"}), 403

        try:
            edit_path = find_widget_items_source("services")
        except Exception as error:
            return jsonify({"error": str(error)}), 500

        payload = request.get_json()
        if not payload or "item" not in payload:
            return jsonify({"error": "Missing service item"}), 400

        service_key = request.args.get("service")
        target_key = payload.get("id") or service_key
        if not target_key:
            return jsonify({"error": "Missing service id"}), 400

        service_entry = payload["item"]

        try:
            normalized_entry = normalize_service_entry(target_key, service_entry)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        existing_items = load_widget_items_from_file(edit_path, "services")
        updated_items = dict(existing_items)
        updated_items[target_key] = normalized_entry

        write_widget_items_to_file(edit_path, "services", updated_items)
        reload_config()

        return jsonify({"status": "ok", "service": target_key})

    @app.route("/api/services/source", methods=["DELETE"])
    def api_services_source_delete():
        from flask import jsonify, request

        if not services_edit_enabled():
            return jsonify({"error": "Services editing is disabled"}), 403

        try:
            edit_path = find_widget_items_source("services")
        except Exception as error:
            return jsonify({"error": str(error)}), 500

        service_key = request.args.get("service")
        if not service_key:
            return jsonify({"error": "Missing service key"}), 400

        existing_items = load_widget_items_from_file(edit_path, "services")
        if service_key not in existing_items:
            return jsonify({"error": "Service not found"}), 404

        updated_items = dict(existing_items)
        del updated_items[service_key]

        write_widget_items_to_file(edit_path, "services", updated_items)
        reload_config()

        return jsonify({"status": "ok", "service": service_key})

    @app.route("/api/services/icon", methods=["POST"])
    def api_services_icon_upload():
        from flask import jsonify, request

        if not services_edit_enabled():
            return jsonify({"error": "Services editing is disabled"}), 403

        if "file" not in request.files:
            return jsonify({"error": "Missing file"}), 400

        upload = request.files["file"]
        if not upload or not upload.filename:
            return jsonify({"error": "Missing filename"}), 400

        allowed_extensions = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
        original_name = Path(upload.filename).name
        extension = Path(original_name).suffix.lower()
        if extension not in allowed_extensions:
            return jsonify({"error": "Unsupported file type"}), 400

        filename = sanitize_icon_filename(Path(original_name).stem)
        if not filename:
            filename = f"service-{int(datetime.now().timestamp())}"
        filename = f"{filename}{extension}"

        img_root = Path(config["paths"]["img"].as_filename())
        upload_dir = img_root / "services"
        upload_dir.mkdir(parents=True, exist_ok=True)

        target_path = upload_dir / filename
        if target_path.exists():
            filename = (
                f"{target_path.stem}-{int(datetime.now().timestamp())}{extension}"
            )
            target_path = upload_dir / filename

        upload.save(target_path)
        return jsonify({"path": f"services/{filename}", "full_path": str(target_path)})
