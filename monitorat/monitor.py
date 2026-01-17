#!/usr/bin/env python3
from flask import Flask, send_from_directory, jsonify, request, Response, redirect
from pathlib import Path
from urllib.request import urlretrieve
from datetime import datetime, timedelta, timezone
import importlib
import importlib.metadata
import logging
import csv
import json
from typing import List, Optional, Set
from pytimeparse import parse as parse_duration

try:
    from .config import (
        config,
        reload_config,
        register_config_listener,
        get_project_config_dir,
    )
    from .alerts import NotificationHandler, setup_alert_handler
    from .auth import require_auth_for_api
    from .federation import federation_client
except ImportError:
    from config import (
        config,
        reload_config,
        register_config_listener,
        get_project_config_dir,
    )
    from alerts import NotificationHandler, setup_alert_handler
    from auth import require_auth_for_api
    from federation import federation_client

__all__ = [
    "config",
    "reload_config",
    "register_config_listener",
    "NotificationHandler",
    "CSVHandler",
    "is_demo_enabled",
    "register_snapshot_provider",
    "get_project_config_dir",
]

BASE = Path(__file__).parent.parent
WWW = BASE / "monitorat"

app = Flask(__name__)
require_auth_for_api(app)

if __name__ != "monitor":
    import sys

    sys.modules.setdefault("monitor", sys.modules[__name__])
    if __package__:
        widgets_pkg = importlib.import_module(f"{__package__}.widgets")
        sys.modules.setdefault("widgets", widgets_pkg)


def get_data_path() -> Path:
    return Path(config["paths"]["data"].as_filename())


def is_demo_enabled() -> bool:
    return config["demo"].get(bool)


def get_package_version() -> str:
    """Get monitorat version from package metadata."""
    try:
        return importlib.metadata.version("monitorat")
    except importlib.metadata.PackageNotFoundError:
        return "dev"


_snapshot_providers = {}


def register_snapshot_provider(name: str, provider) -> None:
    if name in _snapshot_providers:
        raise ValueError(f"Snapshot provider already registered: {name}")
    _snapshot_providers[name] = provider


def get_widgets_paths() -> List[Path]:
    """Return list of widget search paths from config."""
    widgets_cfg = config["paths"]["widgets"].get(list)
    return [Path(p).expanduser() for p in widgets_cfg]


def setup_logging():
    """Setup basic logging configuration"""
    try:
        log_file = get_data_path() / "monitor.log"
        log_file.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Fallback if config not loaded yet
        log_file = BASE / "monitor.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(),  # Keep console output
        ],
        force=True,  # Override any existing logging config
    )


def resolve_period_cutoff(period_str: Optional[str], now: Optional[datetime] = None):
    """Return the datetime cutoff for a natural-language period."""
    if not period_str or period_str.lower() == "all":
        return None
    try:
        seconds = parse_duration(period_str)
        if not seconds:
            return None
        reference = now or datetime.now()
        return reference - timedelta(seconds=seconds)
    except Exception:
        return None


def parse_iso_timestamp(value: Optional[str]):
    """Parse ISO timestamps with optional trailing Z and normalize to naive UTC."""
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        return None


class CSVHandler:
    """Handles CSV storage for widget data with DictWriter/DictReader"""

    def __init__(self, widget_name: str, columns: List[str]):
        self.filename = f"{widget_name}.csv"
        self.columns = columns
        self._migrate_schema_if_needed()

    @property
    def path(self) -> Path:
        return get_data_path() / self.filename

    def _migrate_schema_if_needed(self) -> None:
        """Migrate CSV to canonical schema if headers differ"""
        if not self.path.exists():
            return

        with self.path.open("r", newline="") as f:
            reader = csv.DictReader(f)
            existing_headers = reader.fieldnames or []
            existing_rows = list(reader)

        if not existing_headers or set(existing_headers) == set(self.columns):
            return

        canonical_set = set(self.columns)
        existing_set = set(existing_headers)
        extra = existing_set - canonical_set

        final_headers = self.columns + [col for col in existing_headers if col in extra]

        with self.path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=final_headers)
            writer.writeheader()
            for row in existing_rows:
                writer.writerow(row)

        self.columns = final_headers

    def append(self, row: dict) -> None:
        """Append row to CSV, creating file with header if needed"""
        file_exists = self.path.exists()
        if not file_exists:
            self.path.parent.mkdir(parents=True, exist_ok=True)

        with self.path.open("a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=self.columns)
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)

    def read_all(self) -> List[dict]:
        """Read all rows as dicts"""
        if not self.path.exists():
            return []

        with self.path.open("r", newline="") as f:
            return list(csv.DictReader(f))


VENDOR_URLS = {
    "github-markdown.min.css": "https://cdn.jsdelivr.net/npm/github-markdown-css@5.6.1/github-markdown.min.css",
    "markdown-it.min.js": "https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js",
    "markdown-it-anchor.min.js": "https://cdn.jsdelivr.net/npm/markdown-it-anchor@9/dist/markdownItAnchor.umd.min.js",
    "markdown-it-toc-done-right.min.js": "https://cdn.jsdelivr.net/npm/markdown-it-toc-done-right@4/dist/markdownItTocDoneRight.umd.min.js",
    "mermaid.js": "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.js",
    "chart.min.js": "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js",
}


def strip_source_map_reference(path: Path) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return
    if "sourceMappingURL" not in text:
        return
    cleaned = []
    for line in text.splitlines():
        if "sourceMappingURL" in line:
            continue
        cleaned.append(line)
    path.write_text("\n".join(cleaned), encoding="utf-8")


def ensure_vendors():
    vendors_config = config["paths"]["vendors"].get()
    if vendors_config is None:
        return
    vendors_path = Path(vendors_config) if vendors_config else Path("vendors/")
    if not vendors_path.is_absolute():
        vendors_path = Path(config.config_dir()) / vendors_path
    vendors_path.mkdir(exist_ok=True, parents=True)
    for filename, url in VENDOR_URLS.items():
        filepath = vendors_path / filename
        if not filepath.exists():
            print(f"Downloading {filename}...")
            urlretrieve(url, filepath)
            print(f"Downloaded {filename}")
        strip_source_map_reference(filepath)


ensure_vendors()


@app.route("/")
def index():
    return send_from_directory(WWW / "static", "index.html")


@app.route("/api/config", methods=["GET"])
def api_config():
    try:
        widgets_merged = {}
        sections_config = {}
        default_columns = (
            config["widgets"]["columns"].get(int)
            if "columns" in config["widgets"].keys()
            else 1
        )
        if "sections" in config.keys():
            sections_config = config["sections"].flatten()
            if sections_config is None:
                sections_config = {}
            if not isinstance(sections_config, dict):
                raise ValueError("sections config must be a mapping")
        for key in config["widgets"].keys():
            # {widget}.enabled = list
            if key == "enabled":
                enabled = config["widgets"][key].get()
                widgets_merged[key] = enabled
                continue
            # skip widget-level defaults
            if key == "columns":
                continue
            # merge values from all sources
            widget_config = config["widgets"][key].flatten()
            # inject default columns if not set
            if isinstance(widget_config, dict) and "columns" not in widget_config:
                widget_config["columns"] = default_columns
            widgets_merged[key] = widget_config

        payload = {
            "version": get_package_version(),
            "site": config["site"].flatten(),
            "privacy": config["privacy"].flatten(),
            "demo": is_demo_enabled(),
            "sections": sections_config,
            "widgets": widgets_merged,
        }
        return jsonify(payload)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/api/config/reload", methods=["POST"])
def api_config_reload():
    logger = logging.getLogger(__name__)
    if is_demo_enabled():
        return jsonify(error="Config reload disabled in demo mode"), 403
    try:
        logger.info("Configuration reload requested")
        reload_config()
        logger.info("Configuration reloaded successfully")
        return jsonify({"status": "ok"})
    except Exception as exc:
        logger.error(f"Configuration reload failed: {exc}")
        return jsonify(error=str(exc)), 500


@app.route("/api/info", methods=["GET"])
def api_info():
    try:
        version = importlib.metadata.version("monitorat")
    except importlib.metadata.PackageNotFoundError:
        version = "dev"

    themes_dir = WWW / "static" / "themes"
    themes = []
    if themes_dir.exists():
        for css_file in sorted(themes_dir.glob("*.css")):
            if css_file.name != "default.css":
                themes.append(css_file.stem)
        themes.insert(0, "default")

    return jsonify(
        {
            "version": version,
            "github": "https://github.com/brege/monitorat",
            "themes": themes,
        }
    )


def append_snapshot(payload: dict) -> None:
    snapshot_path = get_data_path() / "snapshot.jsonl"
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    with snapshot_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload))
        handle.write("\n")


@app.route("/api/snapshot", methods=["POST"])
def api_snapshot():
    if is_demo_enabled():
        return jsonify(error="Snapshot disabled in demo mode"), 403

    snapshot_payload = {
        name: provider() for name, provider in _snapshot_providers.items()
    }
    append_snapshot(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "snapshot": snapshot_payload,
        }
    )
    return jsonify({"status": "ok"})


@app.route("/api/federation/status", methods=["GET"])
def api_federation_status():
    """Return health status for all configured remotes."""
    local_version = get_package_version()

    if not federation_client.enabled:
        return jsonify({"enabled": False, "version": local_version, "remotes": {}})

    remotes_status = {}
    for remote_name in federation_client.list_remotes():
        health = federation_client.health_check(remote_name)
        if health.get("ok"):
            try:
                config_response = federation_client.fetch(remote_name, "/api/config")
                if config_response.status_code == 200:
                    remote_config = config_response.json()
                    health["version"] = remote_config.get("version", "unknown")
            except Exception:
                health["version"] = "unknown"
        remotes_status[remote_name] = health

    return jsonify(
        {"enabled": True, "version": local_version, "remotes": remotes_status}
    )


@app.route("/api/proxy/<remote_name>/img/<path:subpath>")
def api_proxy_img(remote_name, subpath):
    """Proxy image requests to a federated remote."""
    if not federation_client.enabled:
        return jsonify({"error": "Federation not enabled"}), 404

    remote = federation_client.get_remote(remote_name)
    if not remote:
        return jsonify({"error": f"Remote '{remote_name}' not found"}), 404

    try:
        response = federation_client.fetch(remote_name, f"/img/{subpath}")

        excluded_headers = {
            "content-encoding",
            "content-length",
            "transfer-encoding",
            "connection",
        }
        headers = [
            (name, value)
            for name, value in response.headers.items()
            if name.lower() not in excluded_headers
        ]

        return Response(
            response.content,
            status=response.status_code,
            headers=headers,
        )
    except Exception as exc:
        logging.getLogger(__name__).error(f"Image proxy error for {remote_name}: {exc}")
        return jsonify({"error": str(exc)}), 502


@app.route("/favicon.ico")
def favicon():
    try:
        configured = Path(config["paths"]["favicon"].as_filename())
        if configured.exists():
            return send_from_directory(str(configured.parent), configured.name)
    except Exception:
        pass

    path = WWW / "static" / "favicon.ico"
    if not path.exists():
        path = WWW / "favicon.ico"
    return send_from_directory(str(path.parent), path.name)


@app.route("/themes/<path:filename>")
def theme_files(filename):
    """Serve factory themes from static/themes/."""
    themes_dir = WWW / "static" / "themes"
    return send_from_directory(str(themes_dir), filename)


@app.route("/theme-overlay.css")
def theme_overlay_css():
    """Serve theme overlay (non-default themes) based on site.theme config."""
    theme_name = config["site"]["theme"].get(str)
    if not theme_name or theme_name == "default":
        return "", 404
    themes_dir = WWW / "static" / "themes"
    theme_path = themes_dir / f"{theme_name}.css"
    if theme_path.exists():
        return send_from_directory(str(themes_dir), f"{theme_name}.css")
    return "", 404


@app.route("/theme.css")
def theme_css():
    """Serve user theme override from paths.theme config."""
    theme_config = config["paths"]["theme"].get()
    if theme_config is None:
        return "", 404
    theme_path = Path(theme_config)
    if not theme_path.is_absolute():
        config_dir = Path(config.config_dir())
        theme_path = config_dir / theme_path
    if theme_path.exists():
        return send_from_directory(str(theme_path.parent), theme_path.name)
    return "", 404


@app.route("/img/<path:filename>")
def img_files(filename):
    img_dir = Path(config["paths"]["img"].as_filename())
    return send_from_directory(str(img_dir), filename)


@app.route("/vendors/<path:filename>")
def vendor_files(filename):
    vendors_config = config["paths"]["vendors"].get()
    if vendors_config is None:
        url = VENDOR_URLS.get(filename)
        if url:
            return redirect(url, code=307)
        return jsonify({"error": f"Vendor '{filename}' not found"}), 404
    vendors_path = Path(vendors_config) if vendors_config else Path("vendors/")
    if not vendors_path.is_absolute():
        vendors_path = Path(config.config_dir()) / vendors_path
    return send_from_directory(str(vendors_path), filename)


def resolve_custom_widget_asset(filename: str) -> Optional[Path]:
    requested = Path(filename)
    if not requested.parts or requested.parts[0] != "widgets":
        return None

    safe_parts = []
    for part in requested.parts[1:]:
        if part in ("", ".", ".."):
            return None
        safe_parts.append(part)

    if not safe_parts:
        return None

    for base_path in get_widgets_paths():
        candidate = base_path.joinpath(*safe_parts)
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


@app.route("/<path:filename>")
def static_files(filename):
    custom_asset = resolve_custom_widget_asset(filename)
    if custom_asset:
        return send_from_directory(str(custom_asset.parent), custom_asset.name)
    if filename.startswith("widgets/"):
        return send_from_directory(WWW, filename)
    return send_from_directory(WWW / "static", filename)


_CUSTOM_WIDGET_PATHS: Set[str] = set()


def extend_widget_package_path():
    """Add configured widget directories to the widgets package search path."""
    try:
        import widgets
    except ImportError:
        logging.getLogger(__name__).warning("Widgets package not available")
        return

    package_path = getattr(widgets, "__path__", None)
    if package_path is None:
        return

    for widget_path in get_widgets_paths():
        custom_path = str(widget_path)
        if custom_path in _CUSTOM_WIDGET_PATHS or custom_path in package_path:
            continue

        package_path.append(custom_path)
        _CUSTOM_WIDGET_PATHS.add(custom_path)
        logging.getLogger(__name__).debug(f"Added custom widget path: {custom_path}")


_REGISTERED_PROXY_ROUTES = set()


def register_remote_widget_proxy(widget_name: str, widget_type: str, remote_name: str):
    """
    Register proxy routes for a remote widget.

    Routes like /api/{widget_name}/* proxy to the remote's /api/{widget_type}/*
    """
    logger = logging.getLogger(__name__)

    if widget_name in _REGISTERED_PROXY_ROUTES:
        return
    _REGISTERED_PROXY_ROUTES.add(widget_name)

    remote = federation_client.get_remote(remote_name)
    if not remote:
        logger.error(f"Remote '{remote_name}' not found for widget '{widget_name}'")
        return

    def make_proxy_handler(widget_name: str, widget_type: str, remote_name: str):
        def proxy_handler(subpath=""):
            try:
                remote_path = f"/api/{widget_type}"
                if subpath:
                    remote_path = f"{remote_path}/{subpath}"

                query_string = request.query_string.decode("utf-8")
                if query_string:
                    remote_path = f"{remote_path}?{query_string}"

                response = federation_client.fetch(remote_name, remote_path)

                excluded_headers = {
                    "content-encoding",
                    "content-length",
                    "transfer-encoding",
                    "connection",
                }
                headers = [
                    (name, value)
                    for name, value in response.headers.items()
                    if name.lower() not in excluded_headers
                ]

                return Response(
                    response.content,
                    status=response.status_code,
                    headers=headers,
                )
            except Exception as exc:
                logger.error(f"Proxy error for {widget_name}: {exc}")
                return jsonify({"error": str(exc)}), 502

        return proxy_handler

    handler = make_proxy_handler(widget_name, widget_type, remote_name)

    app.add_url_rule(
        f"/api/{widget_name}",
        endpoint=f"proxy_{widget_name}",
        view_func=handler,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{widget_name}/<path:subpath>",
        endpoint=f"proxy_{widget_name}_subpath",
        view_func=handler,
        methods=["GET"],
    )

    logger.info(f"Registered proxy for {widget_name} -> {remote_name}:{widget_type}")


def register_merged_widget_proxy(
    widget_name: str, widget_type: str, merge_sources: list
):
    """
    Register proxy routes for a merged widget that combines data from multiple remotes.

    Registers:
    - /api/{widget_name} for merged operations
    - /api/{widget_type}-{source} for each source (enables frontend per-source fetches)
    """
    logger = logging.getLogger(__name__)
    import concurrent.futures

    valid_sources = []
    for source_name in merge_sources:
        remote = federation_client.get_remote(source_name)
        if remote:
            valid_sources.append(source_name)
        else:
            logger.warning(f"Merge source '{source_name}' not found; skipping")

    if not valid_sources:
        logger.error(f"No valid sources for merged widget '{widget_name}'")
        return

    for source_name in valid_sources:
        per_source_name = f"{widget_type}-{source_name}"
        register_remote_widget_proxy(per_source_name, widget_type, source_name)

    def fetch_with_source(source_name: str, path: str) -> tuple:
        """Fetch from remote and return (source_name, response_data)."""
        try:
            response = federation_client.fetch(source_name, path)
            if response.status_code == 200:
                return (source_name, response.json())
        except Exception as exc:
            logger.warning(f"Merge fetch from {source_name} failed: {exc}")
        return (source_name, None)

    def merged_schema_handler():
        """Return first available schema (all sources should have same schema)."""
        for source_name in valid_sources:
            try:
                response = federation_client.fetch(
                    source_name, f"/api/{widget_type}/schema"
                )
                if response.status_code == 200:
                    return Response(
                        response.content,
                        status=200,
                        mimetype="application/json",
                    )
            except Exception:
                continue
        return jsonify({"error": "No sources available"}), 502

    def merged_current_handler():
        """Return current metrics from first available source."""
        for source_name in valid_sources:
            try:
                response = federation_client.fetch(source_name, f"/api/{widget_type}")
                if response.status_code == 200:
                    return Response(
                        response.content,
                        status=200,
                        mimetype="application/json",
                    )
            except Exception:
                continue
        return jsonify({"error": "No sources available"}), 502

    def merged_history_handler():
        """Fetch history from all sources, tag with source, merge by timestamp."""
        query_string = request.query_string.decode("utf-8")
        path = f"/api/{widget_type}/history"
        if query_string:
            path = f"{path}?{query_string}"

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=len(valid_sources)
        ) as executor:
            futures = {
                executor.submit(fetch_with_source, src, path): src
                for src in valid_sources
            }
            results = {}
            for future in concurrent.futures.as_completed(futures):
                source_name, data = future.result()
                if data:
                    results[source_name] = data

        if not results:
            return jsonify({"error": "No sources available"}), 502

        merged_data = []
        for source_name, payload in results.items():
            rows = payload.get("data", [])
            for row in rows:
                row["_source"] = source_name
                merged_data.append(row)

        merged_data.sort(key=lambda r: r.get("timestamp", ""))

        return jsonify({"data": merged_data, "sources": list(results.keys())})

    def merged_proxy_handler(subpath=""):
        """Route to appropriate merged handler based on subpath."""
        if subpath == "schema":
            return merged_schema_handler()
        elif subpath == "history":
            return merged_history_handler()
        elif subpath == "" or subpath is None:
            return merged_current_handler()
        else:
            return jsonify({"error": f"Unknown subpath: {subpath}"}), 404

    app.add_url_rule(
        f"/api/{widget_name}",
        endpoint=f"merge_{widget_name}",
        view_func=merged_proxy_handler,
        methods=["GET"],
    )
    app.add_url_rule(
        f"/api/{widget_name}/<path:subpath>",
        endpoint=f"merge_{widget_name}_subpath",
        view_func=merged_proxy_handler,
        methods=["GET"],
    )

    logger.info(
        f"Registered merge proxy for {widget_name} -> [{', '.join(valid_sources)}]"
    )


def register_widgets():
    """Register widgets based on configured order."""
    extend_widget_package_path()

    try:
        widgets_cfg = config["widgets"]
        enabled = widgets_cfg["enabled"].get(list)
    except Exception as exc:
        logger = logging.getLogger(__name__)
        logger.error(f"Unable to resolve widget configuration: {exc}")
        return

    registered_widget_types: Set[str] = set()

    for widget_name in enabled:
        try:
            widget_cfg = widgets_cfg[widget_name].get(dict)
        except Exception:
            logger = logging.getLogger(__name__)
            logger.warning(
                f"Widget '{widget_name}' has no configuration block; skipping"
            )
            continue

        widget_type = widget_cfg.get("type", widget_name)
        remote_name = widget_cfg.get("remote")
        federation_cfg = widget_cfg.get("federation", {})
        node_sources = federation_cfg.get("nodes") if federation_cfg else None

        if node_sources and isinstance(node_sources, list):
            register_merged_widget_proxy(widget_name, widget_type, node_sources)
            continue

        if remote_name:
            register_remote_widget_proxy(widget_name, widget_type, remote_name)
            continue

        module_name = f"widgets.{widget_type}.api"

        try:
            module = importlib.import_module(module_name)
        except ImportError:
            logger = logging.getLogger(__name__)
            logger.warning(f"Widget module '{module_name}' not found; skipping")
            continue

        if hasattr(module, "register_routes"):
            if widget_type == "wiki":
                module.register_routes(app, widget_name)
                logging.getLogger(__name__).info(
                    f"Loaded {widget_name} widget ({widget_type})"
                )
                continue

            if widget_type in registered_widget_types:
                logging.getLogger(__name__).info(
                    f"Skipped {widget_name} widget ({widget_type}) duplicate routes"
                )
                continue

            module.register_routes(app)
            registered_widget_types.add(widget_type)
            logging.getLogger(__name__).info(
                f"Loaded {widget_name} widget ({widget_type})"
            )


# Register widget API routes
setup_logging()
logger = logging.getLogger(__name__)
logger.info("Starting monitorat application (demo=%s)", is_demo_enabled())

if not is_demo_enabled():
    setup_alert_handler()
    logger.info("Alert handler initialized")

register_widgets()

if __name__ == "__main__":
    setup_logging()
    app.run(threaded=True)
