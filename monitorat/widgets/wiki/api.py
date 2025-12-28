from flask import Response, abort, jsonify, request, send_from_directory
from pathlib import Path
import logging
import re

from monitor import BASE, config, get_project_config_dir

INCLUDE_CODE_PATTERN = re.compile(
    r"\{\{\s*include:code\s+path=\"([^\"]+)\"\s+lang=\"([^\"]+)\"\s*\}\}"
)


def render_markdown_with_includes(markdown_text: str, documentation_root: Path) -> str:
    output_parts = []
    last_index = 0
    for include_match in INCLUDE_CODE_PATTERN.finditer(markdown_text):
        output_parts.append(markdown_text[last_index : include_match.start()])
        include_path_text = include_match.group(1)
        language = include_match.group(2)
        include_path = (documentation_root / include_path_text).resolve()
        if not include_path.is_relative_to(documentation_root):
            abort(400, description="Include path escapes documentation root.")
        if not include_path.exists():
            abort(404, description="Included file not found.")
        include_contents = include_path.read_text(encoding="utf-8")
        fenced_block = f"```{language}\n{include_contents}\n```"
        output_parts.append(fenced_block)
        last_index = include_match.end()
    output_parts.append(markdown_text[last_index:])
    return "".join(output_parts)


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

        config_root = get_project_config_dir()
        documentation_root = (
            config_root.resolve() if config_root else doc_file.parent.resolve()
        )
        markdown_text = doc_file.read_text(encoding="utf-8")
        rendered_text = render_markdown_with_includes(markdown_text, documentation_root)
        return Response(rendered_text, mimetype="text/markdown")
