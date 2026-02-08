#!/usr/bin/env python3
"""
Serve multiple single-node demos from one process:
  /           -> simple
  /advanced/  -> advanced
  /layout/    -> layout
"""

import argparse
from pathlib import Path

from werkzeug.serving import run_simple
from werkzeug.wrappers import Response

from monitorat.config import ConfigManager, set_active_config_manager


DEMO_DIR = Path(__file__).resolve().parent
PREFIX_TO_CONFIG = {
    "/": DEMO_DIR / "simple" / "config.yaml",
    "/advanced": DEMO_DIR / "advanced" / "config.yaml",
    "/layout": DEMO_DIR / "layout" / "config.yaml",
}


class DemoSuiteApp:
    def __init__(self, app, managers: dict[str, ConfigManager]):
        self.app = app
        self.managers = managers
        self.prefixed_paths = sorted(
            [prefix for prefix in managers if prefix != "/"],
            key=len,
            reverse=True,
        )

    def _resolve_prefix(self, path: str) -> str:
        if not path:
            return "/"
        for prefix in self.prefixed_paths:
            if path == prefix or path.startswith(prefix + "/"):
                return prefix
        return "/"

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO") or "/"
        prefix = self._resolve_prefix(path)

        if prefix != "/" and path == prefix:
            target = prefix + "/"
            response = Response("", status=308, headers={"Location": target})
            return response(environ, start_response)

        if prefix != "/":
            script_name = environ.get("SCRIPT_NAME", "")
            environ["SCRIPT_NAME"] = script_name + prefix
            suffix = path[len(prefix) :]
            environ["PATH_INFO"] = suffix if suffix else "/"

        manager = self.managers[prefix]
        with set_active_config_manager(manager):
            return self.app(environ, start_response)


def load_monitor_app(simple_manager: ConfigManager):
    with set_active_config_manager(simple_manager):
        from monitorat import monitor

        return monitor.app


def build_suite_app():
    managers = {
        prefix: ConfigManager(config_path)
        for prefix, config_path in PREFIX_TO_CONFIG.items()
    }
    monitor_app = load_monitor_app(managers["/"])
    return DemoSuiteApp(monitor_app, managers)


def main():
    parser = argparse.ArgumentParser(description="Run monitorat single-node suite demo")
    parser.add_argument("--host", default="127.0.0.1", help="host interface to bind")
    parser.add_argument("--port", type=int, default=6100, help="port to bind")
    args = parser.parse_args()

    app = build_suite_app()
    try:
        run_simple(
            hostname=args.host,
            port=args.port,
            application=app,
            threaded=True,
            use_reloader=False,
        )
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
