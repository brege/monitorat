from flask import jsonify, request, send_from_directory
from pathlib import Path
import logging

from monitor import BASE, config


def register_routes(app, instance="wiki"):
    """Register wiki widget API routes with Flask app.

    Args:
        app: Flask application instance
        instance: Widget instance name (multiple wiki instances)
    """

    @app.route("/api/wiki/doc", endpoint=f"wiki_doc_{instance}")
    def wiki_doc():
        widget_name = request.args.get("widget", instance)
        doc_view = config["widgets"][widget_name]["doc"]
        if not doc_view.exists():
            return send_from_directory(BASE, "README.md")

        doc_path = doc_view.get(str)
        doc_file = Path(doc_view.as_filename())
        if not doc_file.exists():
            logging.getLogger(__name__).error(
                "Wiki doc path missing (widget=%s, doc=%s, resolved=%s)",
                widget_name,
                doc_path,
                doc_file,
            )
            return jsonify({"error": "Wiki doc not found"}), 404

        return send_from_directory(doc_file.parent, doc_file.name)
