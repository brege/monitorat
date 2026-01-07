#!/usr/bin/env python3

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
import shutil
import subprocess

from monitor import config, register_snapshot_provider, get_data_path, is_demo_enabled

logger = logging.getLogger(__name__)

BASE = Path(__file__).parent.parent.parent.parent


def services_items():
    return config["widgets"]["services"]["items"].get(dict)


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
        view = config["widgets"]["services"]
        return app.response_class(
            response=json.dumps({"services": view["items"].get(dict)}),
            status=200,
            mimetype="application/json",
        )

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
