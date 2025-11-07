#!/usr/bin/env python3
from flask import jsonify, Response
from pathlib import Path
from monitor import config
import logging

logger = logging.getLogger(__name__)


def register_routes(app):
    """Register network widget API routes"""

    @app.route("/api/network/log", methods=["GET"])
    def network_log():
        """Serve the network monitoring log file from configured path"""
        try:
            # Get the log file path from config
            network_config = config["widgets"]["network"].get(dict)
            log_file_path = network_config.get("log_file")

            if not log_file_path:
                logger.warning("Network log requested but no log file configured")
                return jsonify({"error": "No log file configured"}), 404

            log_path = Path(log_file_path)

            if not log_path.exists():
                logger.error(f"Network log file not found: {log_file_path}")
                return jsonify({"error": f"Log file not found: {log_file_path}"}), 404

            if not log_path.is_file():
                logger.error(f"Network log path is not a file: {log_file_path}")
                return jsonify({"error": f"Path is not a file: {log_file_path}"}), 400

            # Read and return the log file contents
            try:
                with open(log_path, "r") as f:
                    content = f.read()
                logger.info(
                    f"Served network log file: {log_file_path} ({len(content)} bytes)"
                )
                return Response(content, mimetype="text/plain")
            except PermissionError:
                logger.error(f"Permission denied reading log file: {log_file_path}")
                return jsonify(
                    {"error": f"Permission denied reading log file: {log_file_path}"}
                ), 403
            except Exception as e:
                logger.error(f"Error reading log file {log_file_path}: {e}")
                return jsonify({"error": f"Error reading log file: {str(e)}"}), 500

        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
