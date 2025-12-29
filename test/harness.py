#!/usr/bin/env python3
"""
Test harness for federation smoke tests.

Manages server lifecycle with subprocess.Popen - spawns servers,
waits for ready, runs tests, terminates cleanly.

Usage:
    uv run python test/harness.py
"""

import subprocess
import sys
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).parent.parent

SERVERS = [
    {
        "name": "nas-1",
        "config": "test/config-nas-1.yaml",
        "port": 6601,
        "health_url": "http://localhost:6601/",
    },
    {
        "name": "nas-2",
        "config": "test/config-nas-2.yaml",
        "port": 6602,
        "health_url": "http://localhost:6602/",
    },
    {
        "name": "central",
        "config": "test/config-central.yaml",
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


def run_smoke_tests() -> int:
    """Run the smoke test suite, return exit code."""
    print("\n" + "=" * 60)
    print("Running smoke tests...")
    print("=" * 60 + "\n")

    result = subprocess.run(
        ["uv", "run", "python", "test/smoke_federation.py"],
        cwd=PROJECT_ROOT,
    )

    return result.returncode


def main():
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

        exit_code = run_smoke_tests()

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
