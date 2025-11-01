#!/usr/bin/env python3
from flask import jsonify, Response
from pathlib import Path
import confuse

config = confuse.Configuration('monitor@', __name__)

def register_routes(app):
    """Register network widget API routes"""

    @app.route("/api/network/log", methods=["GET"])
    def network_log():
        """Serve the network monitoring log file from configured path"""
        try:
            # Get the log file path from config
            network_config = config['widgets']['network'].get(dict)
            log_file_path = network_config.get('log_file')

            if not log_file_path:
                return jsonify({"error": "No log file configured"}), 404

            log_path = Path(log_file_path)

            if not log_path.exists():
                return jsonify({"error": f"Log file not found: {log_file_path}"}), 404

            if not log_path.is_file():
                return jsonify({"error": f"Path is not a file: {log_file_path}"}), 400

            # Read and return the log file contents
            try:
                with open(log_path, 'r') as f:
                    content = f.read()
                return Response(content, mimetype='text/plain')
            except PermissionError:
                return jsonify({"error": f"Permission denied reading log file: {log_file_path}"}), 403
            except Exception as e:
                return jsonify({"error": f"Error reading log file: {str(e)}"}), 500

        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
