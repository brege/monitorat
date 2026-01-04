#!/usr/bin/env python3
"""
Production-ready launcher for the monitor@ federation demo.

Starts central head node and remote nodes (nas-1, nas-2) for the live demo.
Only the central node is exposed publicly; remotes serve federation requests.

Usage:
    python demo/federation/launcher.py                    # Start all servers
    python demo/federation/launcher.py --central-only     # Start only central
    python demo/federation/launcher.py --background       # Daemonize (for production)
    python demo/federation/launcher.py --stop             # Stop all servers

Ports:
    central: 6100 (public, proxied)
    nas-1:   6601 (internal only)
    nas-2:   6602 (internal only)
"""

import argparse
import atexit
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

DEMO_DIR = Path(__file__).parent
PID_DIR = DEMO_DIR / ".pids"

NODES = {
    "central": {
        "name": "central",
        "config": DEMO_DIR / "central" / "config.yaml",
        "port": 6100,
        "is_head": True,
    },
    "nas-1": {
        "name": "nas-1",
        "config": DEMO_DIR / "nas-1" / "config.yaml",
        "port": 6601,
        "is_head": False,
    },
    "nas-2": {
        "name": "nas-2",
        "config": DEMO_DIR / "nas-2" / "config.yaml",
        "port": 6602,
        "is_head": False,
    },
}

running_processes: list[subprocess.Popen] = []


def cleanup():
    """Terminate all running processes."""
    for proc in running_processes:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()


atexit.register(cleanup)


def signal_handler(signum, frame):
    print("\n\nShutting down...")
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def get_pid_file(node_name: str) -> Path:
    """Get PID file path for a node."""
    PID_DIR.mkdir(exist_ok=True)
    return PID_DIR / f"{node_name}.pid"


def write_pid(node_name: str, pid: int):
    """Write PID to file."""
    pid_file = get_pid_file(node_name)
    pid_file.write_text(str(pid))


def read_pid(node_name: str) -> int | None:
    """Read PID from file."""
    pid_file = get_pid_file(node_name)
    if pid_file.exists():
        try:
            return int(pid_file.read_text().strip())
        except (ValueError, OSError):
            return None
    return None


def remove_pid(node_name: str):
    """Remove PID file."""
    pid_file = get_pid_file(node_name)
    try:
        pid_file.unlink()
    except FileNotFoundError:
        pass


def is_process_running(pid: int) -> bool:
    """Check if process with given PID is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def start_server(node: dict, background: bool = False) -> subprocess.Popen | int:
    """Start a server process for the given node."""
    config_path = node["config"]

    if not config_path.exists():
        print(f"  ERROR: Config not found: {config_path}")
        return None

    cmd = [
        "uv",
        "run",
        "monitorat",
        "-c",
        str(config_path),
        "server",
        "--port",
        str(node["port"]),
    ]

    if background:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        write_pid(node["name"], proc.pid)
        return proc.pid
    else:
        proc = subprocess.Popen(cmd)
        running_processes.append(proc)
        return proc


def wait_for_server(port: int, timeout: float = 15.0) -> bool:
    """Wait for server to be ready on given port."""
    import socket

    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            time.sleep(0.3)
    return False


def stop_servers():
    """Stop all running demo servers."""
    stopped = []
    for node_name in NODES:
        pid = read_pid(node_name)
        if pid and is_process_running(pid):
            try:
                os.kill(pid, signal.SIGTERM)
                stopped.append(node_name)
            except (OSError, ProcessLookupError):
                pass
        remove_pid(node_name)

    if stopped:
        print(f"Stopped: {', '.join(stopped)}")
        time.sleep(1)
    else:
        print("No running demo servers found.")


def status():
    """Show status of demo servers."""
    print("\nDemo Server Status")
    print("=" * 50)
    any_running = False
    for node_name, node in NODES.items():
        pid = read_pid(node_name)
        if pid and is_process_running(pid):
            label = "HEAD" if node["is_head"] else "REMOTE"
            print(f"  {node_name:12} [{label}]  RUNNING (PID {pid})")
            any_running = True
        else:
            print(f"  {node_name:12}           STOPPED")
            remove_pid(node_name)
    if not any_running:
        print("\n  No servers running.")
    print()


def print_banner(nodes: list[dict], background: bool = False):
    """Print server status and URLs."""
    print("\n" + "=" * 60)
    print("monitor@ Demo Servers")
    print("=" * 60)

    for node in nodes:
        label = "HEAD" if node["is_head"] else "REMOTE"
        print(f"  {node['name']:12} [{label}]  http://localhost:{node['port']}")

    print()
    if background:
        print("Servers running in background.")
        print("Use 'python demo/federation/launcher.py --stop' to stop.")
    else:
        print("Press Ctrl+C to stop all servers")
    print("=" * 60 + "\n")


WIDGET_TYPES = ["wiki", "metrics", "services", "reminders", "speedtest", "network"]


def main():
    parser = argparse.ArgumentParser(
        description="Production launcher for the monitor@ demo",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--central-only",
        action="store_true",
        help="Start only the central head node",
    )
    parser.add_argument(
        "--background",
        action="store_true",
        help="Run servers in background (daemonize)",
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="Stop all running demo servers",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show status of demo servers",
    )
    parser.add_argument(
        "--widget",
        choices=WIDGET_TYPES,
        help="Filter to show only widgets of this type (for debugging)",
    )

    args = parser.parse_args()

    if args.status:
        status()
        return 0

    if args.stop:
        stop_servers()
        return 0

    widget_filter = args.widget
    if widget_filter:
        print(f"Widget filter: {widget_filter}")

    if args.central_only:
        nodes_to_start = [NODES["central"]]
    else:
        nodes_to_start = [NODES["nas-1"], NODES["nas-2"], NODES["central"]]

    for node_name in NODES:
        pid = read_pid(node_name)
        if pid and is_process_running(pid):
            print(f"Warning: {node_name} already running (PID {pid})")

    print("Starting demo servers...")

    for node in nodes_to_start:
        result = start_server(node, args.background)
        if result is None:
            cleanup()
            return 1
        if args.background:
            print(f"  {node['name']}: started (PID {result})")
        else:
            print(f"  {node['name']}: starting on port {node['port']}...")

    print("\nWaiting for servers to be ready...")
    all_ready = True
    for node in nodes_to_start:
        if wait_for_server(node["port"]):
            print(f"  {node['name']}: ready")
        else:
            print(f"  {node['name']}: FAILED to start")
            all_ready = False

    if not all_ready:
        print("\nSome servers failed to start.")
        if not args.background:
            cleanup()
        return 1

    print_banner(nodes_to_start, args.background)

    if args.background:
        return 0

    while True:
        time.sleep(1)
        for proc in running_processes:
            if proc.poll() is not None:
                print(f"A server process exited unexpectedly (code {proc.returncode})")
                cleanup()
                return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
