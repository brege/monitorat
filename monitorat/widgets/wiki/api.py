from flask import jsonify, request, send_from_directory
from pathlib import Path

from monitor import BASE, config


def register_routes(app, instance="wiki"):
    """Register wiki widget API routes with Flask app.

    Args:
        app: Flask application instance
        instance: Widget instance name (multiple wiki instances)
    """

    @app.route("/api/wiki/doc", endpoint=f"wiki_doc_{instance}")
    def wiki_doc():
        try:
            widget_name = request.args.get("widget", instance)

            widget_config = config["widgets"][widget_name].get(dict)
            doc_path = widget_config.get("doc")

            if not doc_path:
                return send_from_directory(BASE, "README.md")

            doc_file = Path(doc_path)
            return send_from_directory(doc_file.parent, doc_file.name)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
