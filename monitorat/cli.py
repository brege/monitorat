#!/usr/bin/env python3
import argparse
import importlib.metadata
from pathlib import Path
import sys

try:
    from .config import config_manager, get_widgets_paths
except ImportError:
    from config import config_manager, get_widgets_paths


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

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser(
        "config", help="Display the merged configuration with sensitive data redacted"
    )

    subparsers.add_parser("ls-widgets", help="List available widgets and their status")

    args = parser.parse_args()

    if args.command == "config":
        command_config(args)
    elif args.command == "ls-widgets":
        command_ls_widgets(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
