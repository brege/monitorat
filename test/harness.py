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


def read_process_output(proc: subprocess.Popen, limit: int = 40) -> str | None:
    """Read process output after exit for diagnostics."""
    try:
        stdout, stderr = proc.communicate(timeout=1)
    except subprocess.TimeoutExpired:
        return None

    lines = []
    if stdout:
        lines.extend(stdout.strip().splitlines())
    if stderr:
        lines.extend(stderr.strip().splitlines())
    if not lines:
        return None
    return "\n".join(lines[-limit:])


def wait_for_server(
    url: str, proc: subprocess.Popen, server_name: str, timeout: float = 10.0
) -> bool:
    """Poll until server responds, exits, or timeout."""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if proc.poll() is not None:
            print(f"  {server_name}: FAILED (process exited, code {proc.returncode})")
            output = read_process_output(proc)
            if output:
                print("  --- process output ---")
                for line in output.splitlines():
                    print(f"  {line}")
                print("  --- end output ---")
            return False
        try:
            response = httpx.get(url, timeout=1.0)
            if response.status_code == 200:
                return True
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(0.2)
    print(f"  {server_name}: TIMEOUT")
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
            text=True,
        )
        processes.append((server, proc))

    return processes


def wait_for_ready(processes: list, timeout: float = 15.0) -> bool:
    """Wait for all servers to be ready."""
    print("Waiting for servers to be ready...")

    for server, proc in processes:
        if wait_for_server(
            server["health_url"],
            proc,
            server["name"],
            timeout=timeout,
        ):
            print(f"  {server['name']}: ready")
        else:
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


WIDGET_FILTERS = [
    "metrics",
    "wiki",
    "services",
    "reminders",
    "speedtest",
    "network",
    "schema",
]


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


def run_demo_smoke_tests() -> int:
    """Run demo smoke tests, return exit code."""
    print("\n" + "=" * 60)
    print("Running demo smoke tests...")
    print("=" * 60 + "\n")

    cmd = ["uv", "run", "python", "test/smoke/demo.py"]
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)

    return result.returncode


def generate_test_fixtures() -> int:
    """Generate test fixture data."""
    print("\n" + "=" * 60)
    print("Generating test fixtures...")
    print("=" * 60 + "\n")

    cmd = [sys.executable, "demo/setup.py", "--test"]
    result = subprocess.run(cmd, cwd=PROJECT_ROOT)

    return result.returncode


def main():
    parser = argparse.ArgumentParser(description="Federation test harness")
    parser.add_argument(
        "--widget",
        choices=WIDGET_FILTERS,
        help="run only tests for specified widget type",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        dest="list_widgets",
        help="list available widget filters",
    )
    parser.add_argument(
        "--set",
        choices=["all", "federation", "demo"],
        default="all",
        help="select which test set to run",
    )
    args = parser.parse_args()

    if args.list_widgets:
        print("Available widget filters:")
        for widget in WIDGET_FILTERS:
            print(f"  {widget}")
        print("Available test sets:")
        print("  federation")
        print("  demo")
        return 0

    print("=" * 60)
    print("Federation Test Harness")
    print("=" * 60)
    print()

    processes = []
    federation_exit = 1
    demo_exit = None

    try:
        if args.set in ("all", "federation"):
            setup_exit = generate_test_fixtures()
            if setup_exit != 0:
                print("\nFailed to generate test fixtures")
                federation_exit = setup_exit
            else:
                processes = start_servers()

                if not wait_for_ready(processes):
                    print("\nFailed to start all servers")
                    federation_exit = 1
                else:
                    print("\nAll servers ready\n")
                    federation_exit = run_smoke_tests(widget_filter=args.widget)
        else:
            federation_exit = 0

    except KeyboardInterrupt:
        print("\nInterrupted")
        federation_exit = 130

    finally:
        print()
        stop_servers(processes)

    if args.set in ("all", "demo"):
        if federation_exit == 130:
            demo_exit = 130
        else:
            demo_exit = run_demo_smoke_tests()
    else:
        demo_exit = 0

    print()
    print("=" * 60)
    federation_status = (
        "PASSED" if federation_exit == 0 else f"FAILED ({federation_exit})"
    )
    demo_status = "PASSED" if demo_exit == 0 else f"FAILED ({demo_exit})"
    print("Harness completed:")
    print(f"  federation: {federation_status}")
    print(f"  demo: {demo_status}")
    print("=" * 60)

    return 0 if federation_exit == 0 and demo_exit == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
