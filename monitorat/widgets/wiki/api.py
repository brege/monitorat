from flask import Response, abort, jsonify, request, send_from_directory
import html
from pathlib import Path
import logging
import re
import shutil
from datetime import datetime

from monitor import BASE, config, get_project_config_dir

INCLUDE_CODE_PATTERN = re.compile(
    r"\{\{\s*include:code\s+path=\"([^\"]+)\"\s+lang=\"([^\"]+)\"\s*\}\}"
)
FILE_SHORTCODE_PATTERN = re.compile(r"\{\{\s*file:([^\}]+)\s*\}\}")


def render_markdown_with_includes(markdown_text: str, documentation_root: Path) -> str:
    output_parts = []
    last_index = 0
    matches = []
    for include_match in INCLUDE_CODE_PATTERN.finditer(markdown_text):
        matches.append(("code", include_match))
    for include_match in FILE_SHORTCODE_PATTERN.finditer(markdown_text):
        matches.append(("file", include_match))
    matches.sort(key=lambda item: item[1].start())

    for include_type, include_match in matches:
        output_parts.append(markdown_text[last_index : include_match.start()])
        include_path_text = include_match.group(1).strip()
        language = ""
        if include_type == "code":
            language = include_match.group(2)

        include_path = (documentation_root / include_path_text).resolve()
        if not include_path.is_relative_to(documentation_root):
            abort(400, description="Include path escapes documentation root.")
        if not include_path.exists():
            abort(404, description="Included file not found.")
        include_contents = include_path.read_text(encoding="utf-8")
        if include_type == "file":
            output_parts.append(include_contents)
        else:
            code_class = f' class="language-{language}"' if language else ""
            escaped_contents = html.escape(include_contents)
            code_block = f"<pre><code{code_class}>{escaped_contents}</code></pre>"
            output_parts.append(code_block)
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
        if not doc_path:
            return send_from_directory(BASE, "README.md")

        doc_file = Path(doc_view.as_filename())
        if not doc_file.exists() or doc_file.is_dir():
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

    @app.route("/api/wiki/schema", endpoint=f"wiki_schema_{instance}")
    def wiki_schema():
        import json

        schema_path = Path(__file__).parent / "schema.json"
        with open(schema_path) as f:
            schema = json.load(f)
        return jsonify(schema)

    @app.route("/api/wiki/source", endpoint=f"wiki_source_{instance}")
    def wiki_source():
        """Get raw markdown source for editing."""
        widget_name = request.args.get("widget", instance)
        widget_config = config["widgets"][widget_name]

        if not widget_config["edit"].exists() or not widget_config["edit"].get(bool):
            return jsonify({"error": "Editing not enabled for this widget"}), 403

        doc_view = widget_config["doc"]
        if not doc_view.exists():
            return jsonify({"error": "No doc configured"}), 404

        doc_file = Path(doc_view.as_filename())
        if not doc_file.exists():
            return jsonify({"error": "Document not found"}), 404

        content = doc_file.read_text(encoding="utf-8")
        return jsonify(
            {"content": content, "path": str(doc_file), "widget": widget_name}
        )

    @app.route(
        "/api/wiki/source", methods=["PUT"], endpoint=f"wiki_source_put_{instance}"
    )
    def wiki_source_put():
        """Save markdown source with versioning."""
        widget_name = request.args.get("widget", instance)
        widget_config = config["widgets"][widget_name]

        if not widget_config["edit"].exists() or not widget_config["edit"].get(bool):
            return jsonify({"error": "Editing not enabled for this widget"}), 403

        doc_view = widget_config["doc"]
        if not doc_view.exists():
            return jsonify({"error": "No doc configured"}), 404

        doc_file = Path(doc_view.as_filename())

        data = request.get_json()
        if not data or "content" not in data:
            return jsonify({"error": "Missing content"}), 400

        new_content = data["content"]

        if doc_file.exists():
            backup_dir = doc_file.parent / ".versions"
            backup_dir.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{doc_file.stem}_{timestamp}{doc_file.suffix}"
            shutil.copy2(doc_file, backup_dir / backup_name)

            old_backups = sorted(backup_dir.glob(f"{doc_file.stem}_*{doc_file.suffix}"))
            max_versions = 10
            for old_backup in old_backups[:-max_versions]:
                old_backup.unlink()

        doc_file.write_text(new_content, encoding="utf-8")

        logging.getLogger(__name__).info(
            "Wiki saved (widget=%s, path=%s)", widget_name, doc_file
        )

        return jsonify({"status": "ok", "path": str(doc_file)})

    @app.route("/api/wiki/versions", endpoint=f"wiki_versions_{instance}")
    def wiki_versions():
        """List available backup versions for a document."""
        from flask import request
        from datetime import datetime

        file_path = request.args.get("path")
        if not file_path:
            return jsonify({"error": "Missing path parameter"}), 400

        doc_file = Path(file_path)
        versions_dir = doc_file.parent / ".versions"

        if not versions_dir.exists():
            return jsonify({"versions": []})

        versions = []
        pattern = f"{doc_file.stem}_*{doc_file.suffix}"
        for backup in sorted(versions_dir.glob(pattern), reverse=True):
            timestamp_str = backup.stem.replace(doc_file.stem + "_", "")
            try:
                dt = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                label = dt.strftime("%Y-%m-%d %H:%M:%S")
            except ValueError:
                label = timestamp_str

            versions.append({"filename": backup.name, "label": label})

        return jsonify({"versions": versions})

    @app.route("/api/wiki/restore", endpoint=f"wiki_restore_{instance}")
    def wiki_restore():
        """Restore a document from a backup version."""
        from flask import request

        file_path = request.args.get("path")
        version = request.args.get("version")

        if not file_path or not version:
            return jsonify({"error": "Missing path or version parameter"}), 400

        doc_file = Path(file_path)
        versions_dir = doc_file.parent / ".versions"
        backup_file = versions_dir / version

        if not backup_file.exists():
            return jsonify({"error": "Version not found"}), 404

        content = backup_file.read_text(encoding="utf-8")
        return jsonify({"content": content})
