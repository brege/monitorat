#!/usr/bin/env python3

import json
import shutil
import subprocess
from pathlib import Path
import logging

from monitor import config, register_snapshot_provider, get_data_path, is_demo_enabled

logger = logging.getLogger(__name__)

BASE = Path(__file__).parent.parent.parent.parent


def services_items():
    return config["widgets"]["services"]["items"].get(dict)


def get_docker_status():
    """Get status of Docker containers"""
    container_statuses = {}

    # Check if docker is available before trying to run commands

    if not shutil.which("docker"):
        logger.debug("Docker not available in PATH, skipping Docker status check")
        return container_statuses

    try:
        result = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{.Names}}\t{{.State}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if "\t" in line:
                    name, state = line.split("\t", 1)
                    container_statuses[name] = (
                        "ok" if "running" in state.lower() else "down"
                    )

    except Exception as e:
        logger.error(f"Docker command exception: {e}")

    return container_statuses


def get_systemd_status():
    """Get status of systemd services and timers"""
    service_statuses = {}

    services_config = services_items()
    if not services_config:
        return service_statuses

    # Collect all unique services and timers from YAML
    all_services = set()
    all_timers = set()

    for service_info in services_config.values():
        if "services" in service_info:
            all_services.update(service_info["services"])

        if "timers" in service_info:
            all_timers.update(service_info["timers"])

    # Check services
    for service in all_services:
        try:
            result = subprocess.run(
                ["systemctl", "is-active", service],
                capture_output=True,
                text=True,
                timeout=5,
            )
            status = result.stdout.strip()
            service_statuses[service] = "ok" if status == "active" else "down"
        except Exception as e:
            logger.error(f"Error checking service {service}: {e}")
            service_statuses[service] = "unknown"

    # Check timers
    for timer in all_timers:
        try:
            timer_name = timer if timer.endswith(".timer") else f"{timer}.timer"
            result = subprocess.run(
                ["systemctl", "is-active", timer_name],
                capture_output=True,
                text=True,
                timeout=5,
            )
            status = result.stdout.strip()
            service_statuses[timer] = "ok" if status == "active" else "down"
        except Exception as e:
            logger.error(f"Error checking timer {timer}: {e}")
            service_statuses[timer] = "unknown"

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

    docker_status = get_docker_status()
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
