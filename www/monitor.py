#!/usr/bin/env python3
from flask import Flask, send_from_directory, jsonify
from pathlib import Path
from urllib.request import urlretrieve
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from datetime import datetime, timedelta, timezone
import threading
import importlib
import confuse
from apprise import Apprise, common as apprise_common
import logging
import time
from typing import Callable, List, Optional, Set
from pytimeparse import parse as parse_duration

app = Flask(__name__)
BASE = Path(__file__).parent.parent
WWW = BASE / "www"

# Detect flat deployment - if www/ doesn't exist, we're deployed flat
if not WWW.exists():
    BASE = Path(__file__).parent
    WWW = BASE

if __name__ != "monitor":
    import sys

    sys.modules.setdefault("monitor", sys.modules[__name__])
    if __package__:
        widgets_pkg = importlib.import_module(f"{__package__}.widgets")
        sys.modules.setdefault("widgets", widgets_pkg)


class ConfigManager:
    """Own the confuse.Configuration instance and provide reload hooks."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self._project_config = config_path
        self._lock = threading.Lock()
        self._callbacks: List[Callable[[confuse.Configuration], None]] = []
        self._config = self._build_config()

    def _build_config(self) -> confuse.Configuration:
        config_obj = confuse.Configuration("monitor@", __name__)

        # Load defaults from config_default.yaml and user configs from Confuse's
        # standard search paths (~/.config/monitor@/config.yaml, etc.).
        config_obj.clear()
        config_obj.read(user=True, defaults=True)

        # Load additional config files { includes: [ file1.yml, file2.yml ] }
        try:
            includes = config_obj["includes"].get(list)
            config_dir = Path(config_obj.config_dir())
            for include in includes:
                filepath = config_dir / include
                if filepath.exists():
                    config_obj.set_file(filepath)
        except Exception:
            # No includes defined or error reading them - continue without
            pass

        # Allow an explicit override file (e.g., via MONITOR_CONFIG_PATH).
        if self._project_config:
            candidate = self._project_config.expanduser()
            if candidate.exists():
                config_obj.set_file(candidate, base_for_paths=True)

        # Mark sensitive fields for redaction
        config_obj["notifications"]["apprise_urls"].redact = True
        return config_obj

    def get(self) -> confuse.Configuration:
        return self._config

    def reload(self) -> confuse.Configuration:
        with self._lock:
            reloaded = self._build_config()
            self._config = reloaded
            for callback in list(self._callbacks):
                try:
                    callback(reloaded)
                except Exception as exc:
                    print(f"Config reload callback failed: {exc}")
            return reloaded

    def register_callback(
        self, callback: Callable[[confuse.Configuration], None]
    ) -> None:
        self._callbacks.append(callback)


class ConfigProxy:
    """Lightweight proxy so existing code can keep using `config[...]`."""

    def __init__(self, manager: ConfigManager) -> None:
        self._manager = manager

    def __getitem__(self, key):
        return self._manager.get()[key]

    def __getattr__(self, item):
        return getattr(self._manager.get(), item)

    def get(self, *args, **kwargs):
        return self._manager.get().get(*args, **kwargs)

    def __repr__(self) -> str:
        return repr(self._manager.get())


config_manager = ConfigManager()
config = ConfigProxy(config_manager)


def get_config() -> confuse.Configuration:
    return config_manager.get()


def reload_config() -> confuse.Configuration:
    return config_manager.reload()


def register_config_listener(callback: Callable[[confuse.Configuration], None]) -> None:
    config_manager.register_callback(callback)


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


class NotificationHandler:
    """Shared notification handler for sending messages via apprise"""

    def __init__(self, apprise_urls=None):
        """Initialize notification handler

        Args:
            apprise_urls (list): List of apprise URLs to send notifications to
        """
        self.apprise_urls = apprise_urls or []
        self.logger = logging.getLogger(__name__)

    def add_priority_to_url(self, url, priority):
        """Add priority parameter to apprise URL"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)

        # Map numeric priority to pushover priority values
        priority_map = {
            -1: "-1",  # low
            0: "0",  # normal
            1: "1",  # high
        }

        query_params["priority"] = [priority_map.get(priority, "0")]

        new_query = urlencode(query_params, doseq=True)
        return urlunparse(
            (
                parsed.scheme,
                parsed.netloc,
                parsed.path,
                parsed.params,
                new_query,
                parsed.fragment,
            )
        )

    def send_notification(self, title, body, priority=0):
        """Send notification with specified title, body and priority

        Args:
            title (str): Notification title
            body (str): Notification body
            priority (int): Priority level (-1=low, 0=normal, 1=high)

        Returns:
            bool: True if notification was sent successfully
        """
        if not self.apprise_urls:
            self.logger.warning("No apprise URLs configured, notification not sent")
            return False

        apobj = Apprise()

        # Add apprise URLs with priority
        for url in self.apprise_urls:
            priority_url = self.add_priority_to_url(url, priority)
            apobj.add(priority_url)

        if len(apobj) == 0:
            self.logger.error("Failed to add any notification services")
            return False

        priority_names = {-1: "low", 0: "normal", 1: "high"}
        priority_name = priority_names.get(priority, "unknown")

        self.logger.info(f"Sending notification (priority={priority_name}): {title}")

        try:
            result = self._notify_sequential(apobj, title, body)
            if result:
                self.logger.info("Notification sent successfully")
            else:
                self.logger.error("Notification failed to send")
            return result
        except Exception as e:
            self.logger.error(f"Notification error: {e}")
            return False

    def send_test_notification(self, priority=0, service_name="monitor@"):
        """Send test notification with optional priority level

        Args:
            priority (int): Priority level (-1=low, 0=normal, 1=high)
            service_name (str): Name of service sending the test

        Returns:
            bool: True if notification was sent successfully
        """
        if not self.apprise_urls:
            self.logger.warning(
                "No apprise URLs configured, test notification not sent"
            )
            return False

        priority_names = {-1: "Low", 0: "Normal", 1: "High"}
        priority_name = priority_names.get(priority, "Unknown")

        title = f"{service_name} Test ({priority_name} Priority)"
        body = f"Test notification from {service_name} with {priority_name.lower()} priority level"

        self.logger.info(f"Sending test notification from {service_name}")
        return self.send_notification(title, body, priority)

    def _notify_sequential(self, apobj, title, body):
        if len(apobj.servers) == 0:
            return False

        success = True
        for server in apobj.servers:
            try:
                result = server.notify(
                    body=body,
                    title=title,
                    notify_type=apprise_common.NotifyType.INFO,
                )
                success = success and bool(result)
            except Exception as exc:
                server_name = getattr(server, "name", repr(server))
                self.logger.error(f"Notification error via {server_name}: {exc}")
                success = False
        return success


class AlertHandler(logging.Handler):
    """Custom logging handler that processes alert events"""

    def __init__(self):
        super().__init__()
        self.logger = logging.getLogger(__name__)
        self.alert_states = {}  # Track alert states to prevent spam
        self.last_notification_times = {}  # Track cooldowns

    def emit(self, record):
        """Process log records for alert conditions"""
        try:
            # Only process records with alert_type extra data
            if not hasattr(record, "alert_type"):
                return

            # Check if alerts are configured
            try:
                alerts_config = config["alerts"].get()
                if not alerts_config:
                    return

                rules = alerts_config.get("rules", {})
                if not rules:
                    return

                # Get apprise URLs from shared notifications section
                try:
                    notifications_config = config["notifications"].get()
                    apprise_urls = notifications_config.get("apprise_urls", [])
                except Exception:
                    apprise_urls = []
                cooldown_minutes = alerts_config.get("cooldown_minutes", 30)

            except Exception:
                # Config not available or alerts not configured
                return

            # Extract alert data from log record
            alert_name = getattr(record, "alert_name", "unknown")
            alert_value = getattr(record, "alert_value", None)
            alert_threshold = getattr(record, "alert_threshold", None)

            # Check if this alert is configured
            if alert_name not in rules:
                return

            rule = rules[alert_name]

            # Check cooldown period
            now = time.time()
            last_notification = self.last_notification_times.get(alert_name, 0)
            if now - last_notification < (cooldown_minutes * 60):
                self.logger.debug(f"Alert {alert_name} in cooldown period")
                return

            # Send notification if apprise URLs configured
            if apprise_urls:
                notification_handler = NotificationHandler(apprise_urls)

                priority = rule.get("priority", 0)
                message = rule.get("message", f"Alert: {alert_name}")

                # Format title and body
                title = f"System Alert: {message}"
                body = f"{message}\nCurrent value: {alert_value}\nThreshold: {alert_threshold}"

                if notification_handler.send_notification(title, body, priority):
                    self.last_notification_times[alert_name] = now
                    self.logger.info(f"Alert notification sent for {alert_name}")
                else:
                    self.logger.error(
                        f"Failed to send alert notification for {alert_name}"
                    )
            else:
                self.logger.info(
                    f"Alert triggered: {alert_name} (no notifications configured)"
                )

        except Exception as e:
            self.logger.error(f"Error processing alert: {e}")


# Global alert handler instance
_alert_handler = None


def setup_alert_handler():
    """Setup the alert logging handler"""
    global _alert_handler
    if _alert_handler is None:
        _alert_handler = AlertHandler()
        # Add to root logger to catch all alert events
        logging.getLogger().addHandler(_alert_handler)


def get_csv_path():
    return get_data_path() / "speedtest.csv"


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
    return send_from_directory(WWW, "index.html")


@app.route("/data/<path:filename>")
def data_files(filename):
    data_dir = get_data_path()
    return send_from_directory(str(data_dir), filename)


@app.route("/about.md")
def about():
    return send_from_directory(BASE, "about.md")


@app.route("/README.md")
def readme():
    return send_from_directory(BASE, "README.md")


@app.route("/api/config", methods=["GET"])
def api_config():
    try:
        widgets_merged = {}
        for key in config["widgets"].keys():
            widgets_merged[key] = config["widgets"][key].get()

        payload = {
            "site": config["site"].get(dict),
            "privacy": config["privacy"].get(dict),
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
    default_favicon = WWW / "favicon.ico"
    try:
        configured = Path(config["paths"]["favicon"].as_filename())
    except Exception:
        configured = default_favicon

    path = configured if configured.exists() else default_favicon
    return send_from_directory(str(path.parent), path.name)


@app.route("/img/<path:filename>")
def img_files(filename):
    img_dir = Path(config["paths"]["img"].as_filename())
    return send_from_directory(str(img_dir), filename)


@app.route("/docs/<path:filename>")
def docs_files(filename):
    # Serve files from docs/ directory at project root
    return send_from_directory(BASE / "docs", filename)


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
    return send_from_directory(WWW, filename)


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
    import sys

    # Handle config command
    if len(sys.argv) > 1 and sys.argv[1] == "config":
        print(config_manager.get().dump(full=True, redact=True))
        sys.exit(0)

    setup_logging()
    app.run()
