#!/usr/bin/env python3
"""
Development server harness for interactive testing.

Spawns monitor@ servers and keeps them running until Ctrl+C.

Usage:
  uv run python test/dev.py                          # head + nas-1 + nas-2
  uv run python test/dev.py --single nas-1           # just nas-1
  uv run python test/dev.py --remote nas-1           # head + nas-1
  uv run python test/dev.py --remote nas-1 --remote nas-2  # head + both
  uv run python test/dev.py --widget metrics         # all nodes, metrics only
  uv run python test/dev.py --remote nas-1 --widget speedtest
"""

import argparse
import atexit
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import yaml

FIXTURES_DIR = Path(__file__).parent / "fixtures"

NODES = {
    "central": {
        "name": "central",
        "config": FIXTURES_DIR / "central" / "config.yaml",
        "port": 6100,
        "is_head": True,
    },
    "nas-1": {
        "name": "nas-1",
        "config": FIXTURES_DIR / "nas-1" / "config.yaml",
        "port": 6601,
        "is_head": False,
    },
    "nas-2": {
        "name": "nas-2",
        "config": FIXTURES_DIR / "nas-2" / "config.yaml",
        "port": 6602,
        "is_head": False,
    },
}

ALL_WIDGETS = ["wiki", "metrics", "services", "reminders", "speedtest", "network"]

running_processes: list[subprocess.Popen] = []
temp_files: list[Path] = []


def cleanup():
    """Terminate all running processes and remove temp files."""
    for proc in running_processes:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    for temp_file in temp_files:
        try:
            temp_file.unlink()
        except FileNotFoundError:
            pass


atexit.register(cleanup)


def signal_handler(signum, frame):
    print("\n\nShutting down...")
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def filter_widgets_in_config(
    config_path: Path, widgets: list[str], node_name: str
) -> Path:
    """Create a temporary config with only specified widgets enabled."""
    with open(config_path) as f:
        config = yaml.safe_load(f)

    original_enabled = config.get("widgets", {}).get("enabled", [])

    if node_name == "central":
        filtered = []
        for widget_name in original_enabled:
            widget_config = config.get("widgets", {}).get(widget_name, {})
            widget_type = widget_config.get("type", widget_name)
            base_type = widget_type.split("-")[0]
            if base_type in widgets or widget_type in widgets:
                filtered.append(widget_name)
    else:
        filtered = [w for w in original_enabled if w in widgets]

    config.setdefault("widgets", {})["enabled"] = filtered

    temp_fd, temp_path = tempfile.mkstemp(suffix=".yaml", prefix=f"dev-{node_name}-")
    temp_path = Path(temp_path)
    temp_files.append(temp_path)

    with open(temp_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)

    return temp_path


def start_server(node: dict, config_override: Path = None) -> subprocess.Popen:
    """Start a server process for the given node."""
    config_path = config_override or node["config"]
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
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    running_processes.append(proc)
    return proc


def wait_for_server(port: int, timeout: float = 10.0) -> bool:
    """Wait for server to be ready on given port."""
    import socket

    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            time.sleep(0.2)
    return False


def print_status(nodes: list[dict], widgets: list[str] = None):
    """Print server status and URLs."""
    print("\n" + "=" * 60)
    print("Development Servers Running")
    print("=" * 60)

    if widgets:
        print(f"Widgets: {', '.join(widgets)}")
        print()

    for node in nodes:
        label = "HEAD" if node["is_head"] else "REMOTE"
        print(f"  {node['name']:12} [{label}]  http://localhost:{node['port']}")

    print()
    print("Press Ctrl+C to stop all servers")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="Development server harness for interactive testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--single",
        choices=list(NODES.keys()),
        help="Run only a single node (no federation)",
    )
    parser.add_argument(
        "--remote",
        action="append",
        choices=["nas-1", "nas-2"],
        help="Run head with specified remote(s). Can be repeated.",
    )
    parser.add_argument(
        "--widget",
        action="append",
        choices=ALL_WIDGETS,
        help="Enable only specified widget(s). Can be repeated.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available nodes and widgets",
    )

    args = parser.parse_args()

    if args.list:
        print("Available nodes:")
        for name, node in NODES.items():
            label = "head" if node["is_head"] else "remote"
            print(f"  {name:12} (port {node['port']}, {label})")
        print()
        print("Available widgets:")
        for widget in ALL_WIDGETS:
            print(f"  {widget}")
        return 0

    if args.single and args.remote:
        parser.error("Cannot use --single with --remote")

    if args.single:
        nodes_to_start = [NODES[args.single]]
    elif args.remote:
        nodes_to_start = [NODES["central"]]
        for remote_name in args.remote:
            nodes_to_start.append(NODES[remote_name])
    else:
        nodes_to_start = [NODES["central"], NODES["nas-1"], NODES["nas-2"]]

    widgets = args.widget if args.widget else None

    print("Starting servers...")
    for node in nodes_to_start:
        config_path = None
        if widgets:
            config_path = filter_widgets_in_config(
                node["config"], widgets, node["name"]
            )

        start_server(node, config_path)
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
        print("\nSome servers failed to start. Check output above.")
        cleanup()
        return 1

    print_status(nodes_to_start, widgets)

    while True:
        time.sleep(1)
        for proc in running_processes:
            if proc.poll() is not None:
                print(f"A server process exited unexpectedly (code {proc.returncode})")
                cleanup()
                return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
