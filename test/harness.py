#!/usr/bin/env python3
"""
Test harness for federation smoke tests.

Manages server lifecycle with subprocess.Popen - spawns servers,
waits for ready, runs tests, terminates cleanly.

Usage:
    uv run python test/harness.py              # Run all tests
    uv run python test/harness.py --widget metrics   # Run only metrics tests
    uv run python test/harness.py --widget services  # Run only services tests
    uv run python test/harness.py --list             # List available widget filters
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).parent.parent

SERVERS = [
    {
        "name": "nas-1",
        "config": "test/fixtures/nas-1/config.yaml",
        "port": 6601,
        "health_url": "http://localhost:6601/",
    },
    {
        "name": "nas-2",
        "config": "test/fixtures/nas-2/config.yaml",
        "port": 6602,
        "health_url": "http://localhost:6602/",
    },
    {
        "name": "central",
        "config": "test/fixtures/central/config.yaml",
        "port": 6100,
        "health_url": "http://localhost:6100/",
    },
]


def wait_for_server(url: str, timeout: float = 10.0) -> bool:
    """Poll until server responds or timeout."""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            response = httpx.get(url, timeout=1.0)
            if response.status_code == 200:
                return True
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(0.2)
    return False


def start_servers() -> list:
    """Start all test servers, return list of Popen objects."""
    processes = []

    for server in SERVERS:
        cmd = [
            "uv",
            "run",
            "monitorat",
            "-c",
            server["config"],
            "server",
            "--port",
            str(server["port"]),
        ]

        print(f"Starting {server['name']} on port {server['port']}...")

        proc = subprocess.Popen(
            cmd,
            cwd=PROJECT_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        processes.append((server, proc))

    return processes


def wait_for_ready(processes: list, timeout: float = 15.0) -> bool:
    """Wait for all servers to be ready."""
    print("Waiting for servers to be ready...")

    for server, proc in processes:
        if proc.poll() is not None:
            print(f"  {server['name']}: FAILED (process exited)")
            return False

        if wait_for_server(server["health_url"], timeout=timeout):
            print(f"  {server['name']}: ready")
        else:
            print(f"  {server['name']}: TIMEOUT")
            return False

    return True


def stop_servers(processes: list):
    """Terminate all server processes."""
    print("Stopping servers...")

    for server, proc in processes:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
                print(f"  {server['name']}: terminated")
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
                print(f"  {server['name']}: killed")
        else:
            print(f"  {server['name']}: already stopped")


WIDGET_FILTERS = ["metrics", "wiki", "services", "reminders", "speedtest", "network"]


def run_smoke_tests(widget_filter: str = None) -> int:
    """Run the smoke test suite, return exit code."""
    print("\n" + "=" * 60)
    if widget_filter:
        print(f"Running smoke tests (filter: {widget_filter})...")
    else:
        print("Running smoke tests...")
    print("=" * 60 + "\n")

    cmd = ["uv", "run", "python", "test/smoke/federation.py"]
    if widget_filter:
        cmd.extend(["--widget", widget_filter])

    result = subprocess.run(cmd, cwd=PROJECT_ROOT)

    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Federation test harness")
    parser.add_argument(
        "--widget",
        choices=WIDGET_FILTERS,
        help="Run only tests for specified widget type",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        dest="list_widgets",
        help="List available widget filters",
    )
    args = parser.parse_args()

    if args.list_widgets:
        print("Available widget filters:")
        for widget in WIDGET_FILTERS:
            print(f"  {widget}")
        return 0

    print("=" * 60)
    print("Federation Test Harness")
    print("=" * 60)
    print()

    processes = []
    exit_code = 1

    try:
        processes = start_servers()

        if not wait_for_ready(processes):
            print("\nFailed to start all servers")
            return 1

        print("\nAll servers ready\n")

        exit_code = run_smoke_tests(widget_filter=args.widget)

    except KeyboardInterrupt:
        print("\nInterrupted")
        exit_code = 130

    finally:
        print()
        stop_servers(processes)

    print()
    print("=" * 60)
    if exit_code == 0:
        print("Harness completed: ALL TESTS PASSED")
    else:
        print(f"Harness completed: exit code {exit_code}")
    print("=" * 60)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
