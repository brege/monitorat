#!/usr/bin/env python3
from flask import jsonify, Response
from pathlib import Path
from monitor import config, get_data_path
import logging
import threading
import time
import socket
import urllib.request
import urllib.error
from datetime import datetime

logger = logging.getLogger(__name__)


def network_config():
    return config["widgets"]["network"]


def is_chirper_enabled():
    try:
        external = network_config()["external"].get()
        # Chirper is enabled when external is False (use internal chirper)
        if external is False:
            return network_config()["chirper"]["enabled"].get(bool)
        # Chirper is disabled when external is a string (use external source)
        return False
    except Exception:
        return False


def get_chirper_interval():
    try:
        interval = network_config()["chirper"]["interval_seconds"].get(int)
        return interval if interval > 0 else 300
    except Exception:
        return 300


def get_ip_source_url():
    try:
        mode = network_config()["chirper"]["mode"].get(str)
        if mode == "ipv6":
            return "https://ipv6.icanhazip.com"
        return "https://ipv4.icanhazip.com"
    except Exception:
        return "https://ipv4.icanhazip.com"


def get_log_file_path():
    """Get the network log file path, resolved relative to data directory if needed"""
    try:
        log_file = network_config()["log_file"].get(str)
        log_path = Path(log_file)
        if not log_path.is_absolute():
            log_path = get_data_path() / log_path
        return log_path
    except Exception:
        return None


def fetch_external_ip():
    """Fetch external IP address from configured source"""
    try:
        url = get_ip_source_url()
        request = urllib.request.Request(url)
        request.add_header("User-Agent", "monitor@/chirper")
        with urllib.request.urlopen(request, timeout=5) as response:
            ip = response.read().decode("utf-8").strip()
            return ip if ip else None
    except Exception as e:
        logger.debug(f"Failed to fetch IP from {get_ip_source_url()}: {e}")
        return None


def append_log_entry(ip_address):
    """Append a log entry in syslog format matching Porkbun log format"""
    try:
        log_path = get_log_file_path()
        if not log_path:
            logger.warning("Chirper: no log file configured")
            return False

        log_path.parent.mkdir(parents=True, exist_ok=True)

        # Format timestamp like syslog: "Nov 19 14:35:42"
        now = datetime.now()
        timestamp = now.strftime("%b %d %H:%M:%S")
        hostname = socket.gethostname()
        service_name = "monitor-network"

        # Log line format: "Nov 19 14:35:42 hostname service: INFO:    detected IPv4 address X.X.X.X"
        log_line = f"{timestamp} {hostname} {service_name}: INFO:    detected IPv4 address {ip_address}\n"

        with open(log_path, "a") as f:
            f.write(log_line)

        logger.debug(f"Chirper logged IP {ip_address}")
        return True
    except Exception as e:
        logger.error(f"Failed to append log entry: {e}")
        return False


def register_routes(app):
    """Register network widget API routes"""

    start_chirper_daemon()

    @app.route("/api/network/log", methods=["GET"])
    def network_log():
        """Serve the network monitoring log file from configured path"""
        try:
            log_path = get_log_file_path()

            if not log_path:
                logger.warning("Network log requested but no log file configured")
                return jsonify({"error": "No log file configured"}), 404

            if not log_path.exists():
                logger.debug(f"Network log file not yet created: {log_path}")
                return Response("", mimetype="text/plain")

            if not log_path.is_file():
                logger.error(f"Network log path is not a file: {log_path}")
                return jsonify({"error": f"Path is not a file: {log_path}"}), 400

            try:
                with open(log_path, "r") as f:
                    content = f.read()
                logger.info(f"Served network log file ({len(content)} bytes)")
                return Response(content, mimetype="text/plain")
            except PermissionError:
                logger.error(f"Permission denied reading log file: {log_path}")
                return jsonify({"error": "Permission denied reading log file"}), 403
            except Exception as e:
                logger.error(f"Error reading log file {log_path}: {e}")
                return jsonify({"error": f"Error reading log file: {str(e)}"}), 500

        except Exception as exc:
            return jsonify({"error": str(exc)}), 500


_chirper_thread = None


def start_chirper_daemon():
    """Start background IP chirper thread"""
    global _chirper_thread
    if _chirper_thread is None or not _chirper_thread.is_alive():
        logger.info(
            "Starting network chirper daemon (interval=%ss)", get_chirper_interval()
        )
        _chirper_thread = threading.Thread(target=_chirper_worker, daemon=True)
        _chirper_thread.start()
    else:
        logger.debug("Chirper daemon already running")


def _chirper_worker():
    """Background thread for IP chirping"""
    logger.info("Chirper daemon started")
    while True:
        interval = get_chirper_interval()
        try:
            if not is_chirper_enabled():
                time.sleep(interval)
                continue

            ip = fetch_external_ip()
            if ip:
                append_log_entry(ip)
        except Exception as e:
            logger.error(f"Chirper daemon error: {e}")
        time.sleep(interval)
