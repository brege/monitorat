#!/usr/bin/env python3
"""
Launcher for the monitorat demos (simple, advanced, federation).

Usage:
    python demo/launcher.py                 # Start simple demo
    monitorat demo                          # (same as above)
    monitorat demo --mode advanced          # Start advanced demo
    monitorat demo --mode federation        # Start federation demo
    monitorat demo --background             # Daemonize
    monitorat demo --stop                   # Stop all demo servers
"""

import argparse
import atexit
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from docs import generate_docs

DEMO_DIR = Path(__file__).parent

NODES = {
    "simple": {
        "name": "simple",
        "config": DEMO_DIR / "simple" / "config.yaml",
        "port": 6100,
        "is_head": True,
    },
    "advanced": {
        "name": "advanced",
        "config": DEMO_DIR / "advanced" / "config.yaml",
        "port": 6200,
        "is_head": True,
    },
    "editor": {
        "name": "editor",
        "config": DEMO_DIR / "editor" / "config.yaml",
        "port": 6400,
        "is_head": True,
    },
    "layout": {
        "name": "layout",
        "config": DEMO_DIR / "layout" / "config.yaml",
        "port": 6500,
        "is_head": True,
    },
    "central": {
        "name": "central",
        "config": DEMO_DIR / "federation" / "central" / "config.yaml",
        "port": 6300,
        "is_head": True,
    },
    "nas-1": {
        "name": "nas-1",
        "config": DEMO_DIR / "federation" / "nas-1" / "config.yaml",
        "port": 6301,
        "is_head": False,
    },
    "nas-2": {
        "name": "nas-2",
        "config": DEMO_DIR / "federation" / "nas-2" / "config.yaml",
        "port": 6302,
        "is_head": False,
    },
}

MODES = {
    "simple": ["simple"],
    "advanced": ["advanced"],
    "editor": ["editor"],
    "layout": ["layout"],
    "federation": ["nas-1", "nas-2", "central"],
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


def get_pid_directory() -> Path:
    state_home = os.environ.get("XDG_STATE_HOME")
    if state_home:
        return Path(state_home) / "monitorat" / "demo" / "pids"
    return Path.home() / ".local" / "state" / "monitorat" / "demo" / "pids"


def get_pid_file(node_name: str) -> Path:
    """Get PID file path for a node."""
    pid_directory = get_pid_directory()
    pid_directory.mkdir(parents=True, exist_ok=True)
    return pid_directory / f"{node_name}.pid"


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


def start_server(node: dict, background: bool = False) -> subprocess.Popen | int | None:
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
        "--host",
        "0.0.0.0",
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


def print_banner(nodes: list[dict], background: bool = False):
    """Print server status and URLs."""
    print("\n" + "=" * 60)
    print("monitorat Demo Servers")
    print("=" * 60)

    for node in nodes:
        label = "HEAD" if node["is_head"] else "REMOTE"
        print(f"  {node['name']:12} [{label}]  http://localhost:{node['port']}")

    print()
    if background:
        print("Servers running in background.")
        print("Use 'monitorat demo --stop' to stop.")
    else:
        print("Press Ctrl+C to stop all servers")
    print("=" * 60 + "\n")


def bootstrap_demo_data():
    """Generate demo data for simple/advanced modes."""
    subprocess.run(
        ["uv", "run", "python", str(DEMO_DIR / "setup.py"), "--demo"],
        cwd=DEMO_DIR,
        check=True,
    )


def bootstrap_editor_fixtures():
    """Generate fixtures for editor demo."""
    subprocess.run(
        ["uv", "run", "python", str(DEMO_DIR / "editor" / "setup.py")],
        cwd=DEMO_DIR,
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Launcher for the monitorat demos",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--mode",
        choices=sorted(MODES.keys()),
        default="simple",
        help="demo mode to start.",
    )
    parser.add_argument(
        "--background",
        action="store_true",
        help="run servers in background (daemonize)",
    )
    parser.add_argument(
        "--stop",
        action="store_true",
        help="stop all running demo servers",
    )

    args = parser.parse_args()

    if args.stop:
        stop_servers()
        return 0

    mode_to_manifest = {
        "simple": DEMO_DIR / "simple" / "index.yml",
        "advanced": DEMO_DIR / "advanced" / "index.yml",
        "editor": DEMO_DIR / "editor" / "index.yml",
        "federation": DEMO_DIR / "federation" / "index.yml",
    }
    manifest = mode_to_manifest.get(args.mode)
    if manifest:
        generate_docs(manifest)

    if args.mode in ("simple", "advanced"):
        bootstrap_demo_data()
    elif args.mode == "editor":
        bootstrap_editor_fixtures()

    nodes_to_start = [NODES[name] for name in MODES[args.mode]]

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
