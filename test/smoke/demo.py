#!/usr/bin/env python3
"""
Smoke tests for demo configurations (simple, advanced, federation).

Starts demo servers via demo/launcher.py, checks key endpoints, and stops servers.
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).parent.parent.parent

MODES = {
    "simple": {"port": 6100},
    "advanced": {"port": 6200},
    "federation": {"port": 6300},
}

DATA_ENDPOINTS = {
    "metrics": {
        "local": "/api/metrics",
        "remote": "/api/{name}",
    },
    "services": {
        "local": "/api/services",
        "remote": "/api/{name}",
    },
    "reminders": {
        "local": "/api/reminders",
        "remote": "/api/{name}",
    },
    "speedtest": {
        "local": "/api/speedtest/history",
        "remote": "/api/{name}/history",
    },
    "network": {
        "local": "/api/network/log",
        "remote": "/api/{name}/log",
    },
}

FEDERATION_ENDPOINTS = {
    "metrics": "/api/metrics-{source}",
    "services": "/api/services-{source}",
    "reminders": "/api/reminders-{source}",
    "speedtest": "/api/speedtest-{source}/history",
    "network": "/api/network-{source}/log",
}

SCHEMA_TYPES = {"metrics", "services", "reminders", "speedtest", "network", "wiki"}


def build_env() -> dict:
    env = os.environ.copy()
    cache_dir = PROJECT_ROOT / ".uv-cache"
    env.setdefault("UV_CACHE_DIR", str(cache_dir))
    return env


def run_launcher(args: list[str], timeout: float = 60.0) -> None:
    subprocess.run(
        [sys.executable, "demo/launcher.py"] + args,
        cwd=PROJECT_ROOT,
        env=build_env(),
        check=True,
        timeout=timeout,
    )


def wait_for_server(port: int, timeout: float = 15.0) -> bool:
    url = f"http://localhost:{port}/api/config"
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            response = httpx.get(url, timeout=1.0)
            if response.status_code == 200:
                return True
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(0.3)
    return False


def build_urls(config: dict, mode: str) -> tuple[list[str], list[str]]:
    widgets = config.get("widgets", {})
    enabled = widgets.get("enabled") or []

    data_urls = set()
    schema_urls = set()
    wiki_doc_urls = set()

    for widget_name in enabled:
        widget_cfg = widgets.get(widget_name, {})
        if widget_cfg.get("show") is False:
            continue

        widget_type = widget_cfg.get("type", widget_name)
        remote = widget_cfg.get("remote")
        federation_nodes = widget_cfg.get("federation", {}).get("nodes")

        if widget_type == "wiki":
            if remote:
                wiki_doc_urls.add(f"/api/{widget_name}/doc")
            elif federation_nodes:
                for source in federation_nodes:
                    wiki_doc_urls.add(f"/api/wiki-{source}/doc")
            elif widget_cfg.get("doc"):
                wiki_doc_urls.add(f"/api/wiki/doc?widget={widget_name}")
        elif widget_type in DATA_ENDPOINTS:
            if federation_nodes and widget_type in FEDERATION_ENDPOINTS:
                for source in federation_nodes:
                    data_urls.add(
                        FEDERATION_ENDPOINTS[widget_type].format(source=source)
                    )
            elif remote:
                data_urls.add(
                    DATA_ENDPOINTS[widget_type]["remote"].format(name=widget_name)
                )
            else:
                data_urls.add(DATA_ENDPOINTS[widget_type]["local"])

        if widget_type in SCHEMA_TYPES:
            if remote or federation_nodes:
                schema_urls.add(f"/api/{widget_name}/schema")
            else:
                schema_urls.add(f"/api/{widget_type}/schema")

    if mode == "federation":
        data_urls.add("/api/federation/status")

    urls = sorted(data_urls | schema_urls | wiki_doc_urls)
    return urls, sorted(wiki_doc_urls)


def check_urls(port: int, urls: list[str]) -> list[str]:
    failures = []
    base = f"http://localhost:{port}"
    for path in urls:
        url = f"{base}{path}"
        try:
            response = httpx.get(url, timeout=5.0)
            if response.status_code != 200:
                failures.append(path)
                print(f"  FAIL {response.status_code} {path}")
            else:
                print(f"  OK {response.status_code} {path}")
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            failures.append(path)
            print(f"  FAIL ERROR({exc.__class__.__name__}) {path}")
    return failures


def run_mode(mode: str, launch: bool) -> int:
    port = MODES[mode]["port"]
    if launch:
        run_launcher(["--mode", mode, "--background"])

    try:
        if not wait_for_server(port):
            print(f"FAIL: {mode} did not become ready on port {port}")
            return 1

        response = httpx.get(f"http://localhost:{port}/api/config", timeout=5.0)
        if response.status_code != 200:
            print(f"FAIL: {mode} /api/config -> {response.status_code}")
            return 1

        urls, wiki_urls = build_urls(response.json(), mode)
        failures = check_urls(port, urls)
        if failures:
            print(f"FAIL: {mode} endpoints returned non-200:")
            return 1

        print(f"PASS: {mode} ({len(wiki_urls)} wiki docs, {len(urls)} endpoints)")
        return 0
    finally:
        if launch:
            run_launcher(["--stop"])


def main() -> int:
    parser = argparse.ArgumentParser(description="Demo smoke tests")
    parser.add_argument(
        "--mode",
        choices=list(MODES.keys()),
        help="Run tests for a single demo mode",
    )
    parser.add_argument(
        "--no-launch",
        action="store_true",
        help="Skip launcher start/stop (assume servers are already running)",
    )
    args = parser.parse_args()

    modes = [args.mode] if args.mode else list(MODES.keys())
    exit_code = 0
    for mode in modes:
        result = run_mode(mode, launch=not args.no_launch)
        if result != 0:
            exit_code = result
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
