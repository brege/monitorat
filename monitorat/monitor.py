#!/usr/bin/env python3
from flask import Flask, send_from_directory, jsonify
from pathlib import Path
from urllib.request import urlretrieve
from datetime import datetime, timedelta, timezone
import importlib
import logging
import csv
from typing import List, Optional, Set
from pytimeparse import parse as parse_duration

try:
    from .config import config, reload_config, register_config_listener
    from .alerts import NotificationHandler, setup_alert_handler
except ImportError:
    from config import config, reload_config, register_config_listener
    from alerts import NotificationHandler, setup_alert_handler

__all__ = [
    "config",
    "reload_config",
    "register_config_listener",
    "NotificationHandler",
    "CSVHandler",
]

BASE = Path(__file__).parent.parent
WWW = BASE / "monitorat"

# Detect flat deployment - if monitorat/ doesn't exist, we're deployed flat
if not WWW.exists():
    BASE = Path(__file__).parent
    WWW = BASE

app = Flask(__name__)

if __name__ != "monitor":
    import sys

    sys.modules.setdefault("monitor", sys.modules[__name__])
    if __package__:
        widgets_pkg = importlib.import_module(f"{__package__}.widgets")
        sys.modules.setdefault("widgets", widgets_pkg)


def get_data_path() -> Path:
    return Path(config["paths"]["data"].as_filename())


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
        self.path = get_data_path() / f"{widget_name}.csv"
        self.columns = columns
        self._migrate_schema_if_needed()

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
    vendors_path = Path(config["paths"]["vendors"].as_filename())
    if not vendors_path.is_absolute():
        vendors_path = Path(__file__).parent / vendors_path
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


@app.route("/data/<path:filename>")
def data_files(filename):
    data_dir = get_data_path()
    return send_from_directory(str(data_dir), filename)


@app.route("/about.md")
def about():
    path = BASE / "about.md"
    if not path.exists():
        path = WWW / "about.md"
    return send_from_directory(str(path.parent), path.name)


@app.route("/README.md")
def readme():
    path = BASE / "README.md"
    if not path.exists():
        path = WWW / "README.md"
    return send_from_directory(str(path.parent), path.name)


@app.route("/api/config", methods=["GET"])
def api_config():
    try:
        widgets_merged = {}
        for key in config["widgets"].keys():
            # {widget}.enabled = list
            if key == "enabled":
                widgets_merged[key] = config["widgets"][key].get()
                continue
            # merge values from all sources
            widgets_merged[key] = config["widgets"][key].flatten()

        payload = {
            "site": config["site"].flatten(),
            "privacy": config["privacy"].flatten(),
            "widgets": widgets_merged,
        }
        return jsonify(payload)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/api/config/reload", methods=["POST"])
def api_config_reload():
    logger = logging.getLogger(__name__)
    try:
        logger.info("Configuration reload requested")
        reload_config()
        logger.info("Configuration reloaded successfully")
        return jsonify({"status": "ok"})
    except Exception as exc:
        logger.error(f"Configuration reload failed: {exc}")
        return jsonify(error=str(exc)), 500


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


@app.route("/img/<path:filename>")
def img_files(filename):
    img_dir = Path(config["paths"]["img"].as_filename())
    return send_from_directory(str(img_dir), filename)


@app.route("/docs/<path:filename>")
def docs_files(filename):
    docs_dir = BASE / "docs"
    if not docs_dir.exists():
        docs_dir = WWW / "docs"
    return send_from_directory(docs_dir, filename)


@app.route("/vendors/<path:filename>")
def vendor_files(filename):
    vendors_path = Path(config["paths"]["vendors"].as_filename())
    if not vendors_path.is_absolute():
        vendors_path = Path(__file__).parent / vendors_path
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
        module_name = f"widgets.{widget_type}.api"

        try:
            module = importlib.import_module(module_name)
        except ImportError:
            logger = logging.getLogger(__name__)
            logger.warning(f"Widget module '{module_name}' not found; skipping")
            continue

        if hasattr(module, "register_routes"):
            # special case: wiki widget supports multiple instances
            if widget_type == "wiki":
                module.register_routes(app, widget_name)
            else:
                module.register_routes(app)
            logging.getLogger(__name__).info(
                f"Loaded {widget_name} widget ({widget_type})"
            )


# Register widget API routes
setup_logging()
logger = logging.getLogger(__name__)
logger.info("Starting monitor@ application")

setup_alert_handler()
logger.info("Alert handler initialized")

register_widgets()

if __name__ == "__main__":
    setup_logging()
    app.run()
