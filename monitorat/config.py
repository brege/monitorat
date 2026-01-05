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
    "set_project_config_path",
    "get_project_config_dir",
]


class ConfigManager:
    """Own the confuse.Configuration instance and provide reload hooks."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self._project_config = config_path
        self._lock = threading.Lock()
        self._callbacks: List[Callable[[confuse.Configuration], None]] = []
        self._config = self._build_config()

    def _resolve_application_name(self) -> str:
        preferred_name = "monitorat"
        legacy_name = "monitor@"
        if self._project_config:
            return preferred_name

        config_filename = "config.yaml"
        config_directories = [
            Path(directory) for directory in confuse.util.config_dirs()
        ]
        preferred_exists = any(
            (directory / preferred_name / config_filename).is_file()
            for directory in config_directories
        )
        legacy_exists = any(
            (directory / legacy_name / config_filename).is_file()
            for directory in config_directories
        )
        if preferred_exists:
            return preferred_name
        if legacy_exists:
            return legacy_name
        return preferred_name

    def _build_config(self) -> confuse.Configuration:
        application_name = self._resolve_application_name()
        config_obj = confuse.Configuration(application_name, __name__)
        default_config = confuse.Configuration(application_name, __name__)

        config_obj.clear()
        default_config.clear()
        if self._project_config:
            config_obj.read(user=False, defaults=True)
        else:
            config_obj.read(user=True, defaults=True)
        default_config.read(user=False, defaults=True)

        default_includes = default_config["includes"].get(list)
        default_config_dir = Path(__file__).resolve().parent
        for include in default_includes:
            filepath = default_config_dir / include
            if not filepath.exists():
                raise FileNotFoundError(f"Include file not found: {include}")
            config_obj.add(
                confuse.YamlSource(
                    str(filepath),
                    default=True,
                    loader=config_obj.loader,
                )
            )

        if not self._project_config:
            user_config_path = Path(config_obj.user_config_path())
            if user_config_path.exists():
                data = confuse.load_yaml(
                    str(user_config_path), loader=config_obj.loader
                )
                includes = []
                if isinstance(data, dict):
                    includes = data.get("includes") or []
                insert_index = next(
                    (
                        index
                        for index, source in enumerate(config_obj.sources)
                        if getattr(source, "default", False)
                    ),
                    len(config_obj.sources),
                )
                config_dir = user_config_path.parent
                for include in includes:
                    include_path = Path(include)
                    if include_path.is_absolute():
                        filepath = include_path
                    else:
                        candidates = [
                            config_dir / include,
                            default_config_dir / include,
                        ]
                        filepath = next(
                            (
                                candidate
                                for candidate in candidates
                                if candidate.exists()
                            ),
                            None,
                        )
                    if not filepath or not filepath.exists():
                        raise FileNotFoundError(f"Include file not found: {include}")
                    config_obj.sources.insert(
                        insert_index,
                        confuse.YamlSource(
                            str(filepath),
                            base_for_paths=True,
                            loader=config_obj.loader,
                        ),
                    )
                    insert_index += 1

        if self._project_config:
            candidate = self._project_config.expanduser()
            if candidate.exists():
                config_obj.set_file(candidate, base_for_paths=True)
                data = confuse.load_yaml(str(candidate), loader=config_obj.loader)
                includes = []
                if isinstance(data, dict):
                    includes = data.get("includes") or []
                insert_index = next(
                    (
                        index
                        for index, source in enumerate(config_obj.sources)
                        if getattr(source, "default", False)
                    ),
                    len(config_obj.sources),
                )
                for include in includes:
                    filepath = candidate.parent / include
                    if not filepath.exists():
                        raise FileNotFoundError(f"Include file not found: {filepath}")
                    config_obj.sources.insert(
                        insert_index,
                        confuse.YamlSource(
                            str(filepath),
                            base_for_paths=True,
                            loader=config_obj.loader,
                        ),
                    )
                    insert_index += 1

        config_obj["notifications"]["apprise_urls"].redact = True
        return config_obj

    def get(self) -> confuse.Configuration:
        return self._config

    def set_project_config(self, config_path: Path) -> confuse.Configuration:
        candidate = config_path.expanduser()
        if not candidate.exists():
            raise FileNotFoundError(f"Config file not found: {candidate}")
        self._project_config = candidate
        return self.reload()

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

    def get_project_config_dir(self) -> Optional[Path]:
        if self._project_config is None:
            return None
        return self._project_config.expanduser().parent


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


def set_project_config_path(config_path: Path) -> confuse.Configuration:
    return config_manager.set_project_config(config_path)


def get_project_config_dir() -> Optional[Path]:
    return config_manager.get_project_config_dir()


def get_widgets_paths() -> List[Path]:
    """Return list of widget search paths from config."""
    widgets_cfg = config["paths"]["widgets"].get(list)
    return [Path(p).expanduser() for p in widgets_cfg]
