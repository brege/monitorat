#!/usr/bin/env python3
import argparse
import importlib.metadata
from pathlib import Path
import subprocess
import sys

try:
    from .config import config_manager, get_widgets_paths, set_project_config_path
except ImportError:
    from config import config_manager, get_widgets_paths, set_project_config_path


def command_config(args):
    """Display the merged configuration with sensitive data redacted."""
    config_obj = config_manager.get()
    print(config_obj.dump(full=True, redact=True))


def command_ls_widgets(args):
    """List available widgets and their status."""
    try:
        config_obj = config_manager.get()
        enabled_widgets = config_obj["widgets"]["enabled"].get(list)
    except Exception as exc:
        print(f"Error reading configuration: {exc}", file=sys.stderr)
        sys.exit(1)

    extend_widget_package_path()

    built_in_widgets = get_builtin_widgets()
    custom_widgets = get_custom_widgets()
    all_widgets = {**built_in_widgets, **custom_widgets}

    print("Enabled widgets:")
    for widget_name in enabled_widgets:
        widget_type = get_widget_type(widget_name, config_obj)
        location = "custom" if widget_name in custom_widgets else "built-in"
        print(f"  ✓ {widget_name} ({widget_type}) [{location}]")

    disabled_available = set(all_widgets.keys()) - set(enabled_widgets)
    if disabled_available:
        print("\nAvailable (disabled):")
        for widget_name in sorted(disabled_available):
            widget_type = all_widgets[widget_name]
            location = "custom" if widget_name in custom_widgets else "built-in"
            print(f"  · {widget_name} ({widget_type}) [{location}]")


def get_widget_type(widget_name: str, config_obj) -> str:
    """Get the widget type from configuration."""
    try:
        widget_cfg = config_obj["widgets"][widget_name].get(dict)
        return widget_cfg.get("type", widget_name)
    except Exception:
        return widget_name


def extend_widget_package_path():
    """Add configured widget directories to the widgets package search path."""
    try:
        import widgets
    except ImportError:
        return

    package_path = getattr(widgets, "__path__", None)
    if package_path is None:
        return

    _custom_widget_paths = set()
    for widget_path in get_widgets_paths():
        custom_path = str(widget_path)
        if custom_path in _custom_widget_paths or custom_path in package_path:
            continue

        package_path.append(custom_path)
        _custom_widget_paths.add(custom_path)


def get_builtin_widgets() -> dict:
    """Discover built-in widgets from monitorat/widgets directory."""
    widgets_dir = Path(__file__).parent / "widgets"
    result = {}

    if not widgets_dir.exists():
        return result

    for item in widgets_dir.iterdir():
        if item.is_dir() and (item / "api.py").exists():
            result[item.name] = item.name

    return result


def get_custom_widgets() -> dict:
    """Discover custom widgets from configured widget paths."""
    result = {}

    for widget_path in get_widgets_paths():
        if not widget_path.exists():
            continue

        for item in widget_path.iterdir():
            if item.is_dir() and (item / "api.py").exists():
                result[item.name] = item.name

    return result


def command_server(args):
    """Run the development server."""
    try:
        from .monitor import app as flask_app, is_demo_enabled
    except ImportError:
        from monitor import app as flask_app, is_demo_enabled

    mode_label = "on" if is_demo_enabled() else "off"
    print(f" * Demo mode: {mode_label}")
    flask_app.run(host=args.host, port=args.port, debug=args.debug)


def get_demo_config_path() -> Path:
    package_root = Path(__file__).resolve().parent
    package_demo = package_root / "demo" / "config.yaml"
    repo_demo = package_root.parent / "demo" / "config.yaml"

    if package_demo.exists():
        return package_demo
    if repo_demo.exists():
        return repo_demo

    raise FileNotFoundError(
        "Demo config not found; reinstall with demo assets included."
    )


def command_demo(args):
    """Run the demo server with bundled demo configuration."""
    demo_config = get_demo_config_path()
    if args.bootstrap:
        demo_dir = demo_config.parent
        subprocess.run(
            ["uv", "run", "python", str(demo_dir / "setup.py"), "--demo"],
            cwd=demo_dir,
            check=True,
        )
    set_project_config_path(demo_config)
    command_server(args)


def main():
    parser = argparse.ArgumentParser(
        prog="monitorat", description="monitor@ system dashboard and monitoring tool"
    )
    parser.add_argument(
        "-v",
        "--version",
        action="version",
        version=importlib.metadata.version("monitorat"),
    )
    parser.add_argument(
        "-c",
        dest="config",
        type=Path,
        help="Path to config.yaml to load before running the command.",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser(
        "config", help="Display the merged configuration with sensitive data redacted"
    )

    subparsers.add_parser("ls-widgets", help="List available widgets and their status")
    server_parser = subparsers.add_parser("server", help="Run the development server")
    server_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind.",
    )
    server_parser.add_argument(
        "--port",
        type=int,
        default=6161,
        help="Port to bind.",
    )
    server_parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode.",
    )
    demo_parser = subparsers.add_parser("demo", help="Run the demo server")
    demo_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host interface to bind.",
    )
    demo_parser.add_argument(
        "--port",
        type=int,
        default=6161,
        help="Port to bind.",
    )
    demo_parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug mode.",
    )
    demo_parser.add_argument(
        "--bootstrap",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Generate demo assets before starting the server.",
    )

    args = parser.parse_args()

    if args.command == "demo" and args.config:
        print("The demo command does not accept --config.", file=sys.stderr)
        sys.exit(2)

    if args.config:
        set_project_config_path(args.config)

    if args.command == "config":
        command_config(args)
    elif args.command == "ls-widgets":
        command_ls_widgets(args)
    elif args.command == "server":
        command_server(args)
    elif args.command == "demo":
        command_demo(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
