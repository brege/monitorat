#!/usr/bin/env python3

import json
import shutil
import subprocess
from pathlib import Path
import logging

from monitor import config

logger = logging.getLogger(__name__)

BASE = Path(__file__).parent.parent.parent.parent
SYSTEMCTL = shutil.which("systemctl")


def services_items():
    return config["widgets"]["services"]["items"].get(dict)


def get_docker_status():
    """Get status of Docker containers"""
    container_statuses = {}

    # Check if docker is available before trying to run commands
    import shutil

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

    if not SYSTEMCTL:
        logger.debug("systemctl not found in PATH; skipping systemd checks")
        return service_statuses

    # Check services
    for service in all_services:
        try:
            result = subprocess.run(
                [SYSTEMCTL, "is-active", service],
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
            result = subprocess.run(
                [SYSTEMCTL, "is-active", f"{timer}.timer"],
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
    docker_status = get_docker_status()
    systemd_status = get_systemd_status()

    # Combine both status dictionaries
    all_status = {**docker_status, **systemd_status}

    return all_status


def register_routes(app):
    """Register services API routes with Flask app"""

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
