#!/usr/bin/env python3
from pathlib import Path
import threading
import confuse
from typing import Callable, List, Optional

__all__ = [
    "ConfigManager",
    "ConfigProxy",
    "config_manager",
    "config",
    "get_config",
    "reload_config",
    "register_config_listener",
    "get_widgets_paths",
]


class ConfigManager:
    """Own the confuse.Configuration instance and provide reload hooks."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self._project_config = config_path
        self._lock = threading.Lock()
        self._callbacks: List[Callable[[confuse.Configuration], None]] = []
        self._config = self._build_config()

    def _build_config(self) -> confuse.Configuration:
        config_obj = confuse.Configuration("monitor@", __name__)

        config_obj.clear()
        config_obj.read(user=True, defaults=True)

        try:
            includes = config_obj["includes"].get(list)
            config_dir = Path(config_obj.config_dir())
            for include in includes:
                filepath = config_dir / include
                if filepath.exists():
                    config_obj.set_file(filepath)
        except Exception:
            pass

        if self._project_config:
            candidate = self._project_config.expanduser()
            if candidate.exists():
                config_obj.set_file(candidate, base_for_paths=True)

        config_obj["notifications"]["apprise_urls"].redact = True
        return config_obj

    def get(self) -> confuse.Configuration:
        return self._config

    def reload(self) -> confuse.Configuration:
        with self._lock:
            reloaded = self._build_config()
            self._config = reloaded
            for callback in list(self._callbacks):
                try:
                    callback(reloaded)
                except Exception as exc:
                    print(f"Config reload callback failed: {exc}")
            return reloaded

    def register_callback(
        self, callback: Callable[[confuse.Configuration], None]
    ) -> None:
        self._callbacks.append(callback)


class ConfigProxy:
    """Lightweight proxy so existing code can keep using `config[...]`."""

    def __init__(self, manager: ConfigManager) -> None:
        self._manager = manager

    def __getitem__(self, key):
        return self._manager.get()[key]

    def __getattr__(self, item):
        return getattr(self._manager.get(), item)

    def get(self, *args, **kwargs):
        return self._manager.get().get(*args, **kwargs)

    def __repr__(self) -> str:
        return repr(self._manager.get())


config_manager = ConfigManager()
config = ConfigProxy(config_manager)


def get_config() -> confuse.Configuration:
    return config_manager.get()


def reload_config() -> confuse.Configuration:
    return config_manager.reload()


def register_config_listener(callback: Callable[[confuse.Configuration], None]) -> None:
    config_manager.register_callback(callback)


def get_widgets_paths() -> List[Path]:
    """Return list of widget search paths from config."""
    widgets_cfg = config["paths"]["widgets"].get(list)
    return [Path(p).expanduser() for p in widgets_cfg]
