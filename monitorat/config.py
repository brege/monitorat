#!/usr/bin/env python3
from pathlib import Path
import threading
import confuse
from typing import Callable, List, Optional
import yaml

__all__ = [
    "ConfigManager",
    "ConfigProxy",
    "config_manager",
    "config",
    "get_config",
    "reload_config",
    "register_config_listener",
    "get_widgets_paths",
    "get_primary_config_path",
    "find_widget_items_source",
    "load_widget_items_from_file",
    "write_widget_items_to_file",
    "set_project_config_path",
    "get_project_config_dir",
    "get_project_config_path",
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
        config_object, default_config = self._create_configurations(application_name)
        self._initialize_configurations(config_object, default_config)

        default_config_directory = Path(__file__).resolve().parent
        self._add_default_includes(
            config_object, default_config, default_config_directory
        )

        if self._project_config:
            self._add_project_config_includes(config_object, default_config_directory)
        else:
            self._add_user_config_includes(config_object, default_config_directory)

        self._apply_redactions(config_object)
        return config_object

    def _create_configurations(
        self, application_name: str
    ) -> tuple[confuse.Configuration, confuse.Configuration]:
        config_object = confuse.Configuration(application_name, __name__)
        default_config = confuse.Configuration(application_name, __name__)
        return config_object, default_config

    def _initialize_configurations(
        self,
        config_object: confuse.Configuration,
        default_config: confuse.Configuration,
    ) -> None:
        config_object.clear()
        default_config.clear()
        if self._project_config:
            config_object.read(user=False, defaults=True)
        else:
            config_object.read(user=True, defaults=True)
        default_config.read(user=False, defaults=True)

    def _add_default_includes(
        self,
        config_object: confuse.Configuration,
        default_config: confuse.Configuration,
        default_config_directory: Path,
    ) -> None:
        default_includes = default_config["includes"].get(list)
        include_paths = [
            default_config_directory / include for include in default_includes
        ]
        include_paths.extend(
            self._discover_widget_default_paths(default_config_directory)
        )
        seen_paths = set()
        base_for_paths = bool(self._project_config)
        for filepath in include_paths:
            resolved_path = filepath.resolve()
            if resolved_path in seen_paths:
                continue
            seen_paths.add(resolved_path)
            if not filepath.exists():
                raise FileNotFoundError(f"Include file not found: {filepath}")
            config_object.add(
                confuse.YamlSource(
                    str(filepath),
                    default=True,
                    base_for_paths=base_for_paths,
                    loader=config_object.loader,
                )
            )

    def _add_user_config_includes(
        self,
        config_object: confuse.Configuration,
        default_config_directory: Path,
    ) -> None:
        user_config_path = Path(config_object.user_config_path())
        if not user_config_path.exists():
            return
        includes = self._load_includes_from_file(user_config_path, config_object.loader)
        include_paths = self._resolve_include_paths(
            includes,
            user_config_path.parent,
            default_config_directory,
        )
        self._insert_include_sources(
            config_object,
            include_paths,
            base_for_paths=True,
        )

    def _add_project_config_includes(
        self,
        config_object: confuse.Configuration,
        default_config_directory: Path,
    ) -> None:
        candidate = self._project_config.expanduser()
        if not candidate.exists():
            return
        config_object.set_file(candidate, base_for_paths=True)
        includes = self._load_includes_from_file(candidate, config_object.loader)
        include_paths = self._resolve_include_paths(
            includes,
            candidate.parent,
            None,
        )
        self._insert_include_sources(
            config_object,
            include_paths,
            base_for_paths=True,
        )

    def _load_includes_from_file(self, config_path: Path, loader) -> List[str]:
        data = confuse.load_yaml(str(config_path), loader=loader)
        if not isinstance(data, dict):
            return []
        return data.get("includes") or []

    def _resolve_include_paths(
        self,
        includes: List[str],
        config_directory: Path,
        default_config_directory: Optional[Path],
    ) -> List[Path]:
        include_paths = []
        for include in includes:
            include_path = Path(include)
            if include_path.is_absolute():
                filepath = include_path
            else:
                candidates = [config_directory / include]
                if default_config_directory is not None:
                    candidates.append(default_config_directory / include)
                filepath = next(
                    (candidate for candidate in candidates if candidate.exists()),
                    None,
                )
            if not filepath or not filepath.exists():
                raise FileNotFoundError(f"Include file not found: {include}")
            include_paths.append(filepath)
        return include_paths

    def _insert_include_sources(
        self,
        config_object: confuse.Configuration,
        include_paths: List[Path],
        base_for_paths: bool,
    ) -> None:
        insert_index = self._find_default_insert_index(config_object)
        for include_path in include_paths:
            config_object.sources.insert(
                insert_index,
                confuse.YamlSource(
                    str(include_path),
                    base_for_paths=base_for_paths,
                    loader=config_object.loader,
                ),
            )
            insert_index += 1

    def _find_default_insert_index(self, config_object: confuse.Configuration) -> int:
        return next(
            (
                index
                for index, source in enumerate(config_object.sources)
                if getattr(source, "default", False)
            ),
            len(config_object.sources),
        )

    def _apply_redactions(self, config_object: confuse.Configuration) -> None:
        config_object["notifications"]["apprise_urls"].redact = True

    def _discover_widget_default_paths(
        self, default_config_directory: Path
    ) -> List[Path]:
        widgets_root = default_config_directory / "widgets"
        if not widgets_root.exists():
            return []
        default_paths = []
        for widget_directory in sorted(widgets_root.iterdir(), key=lambda p: p.name):
            if not widget_directory.is_dir():
                continue
            default_path = widget_directory / "default.yaml"
            if default_path.exists():
                default_paths.append(default_path)
        return default_paths

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

    def get_project_config_path(self) -> Optional[Path]:
        if self._project_config is None:
            return None
        return self._project_config.expanduser()


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


def get_project_config_path() -> Optional[Path]:
    return config_manager.get_project_config_path()


def get_primary_config_path() -> Optional[Path]:
    project_path = get_project_config_path()
    if project_path:
        return project_path
    return Path(config.user_config_path())


def _load_yaml_mapping(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ValueError(f"Config file must be a mapping: {path}")
    return data


def _resolve_include_path(
    include: str,
    config_directory: Path,
    default_config_directory: Optional[Path],
    allow_default: bool,
) -> Path:
    include_path = Path(include)
    if include_path.is_absolute():
        return include_path
    candidate = config_directory / include
    if candidate.exists():
        return candidate
    if allow_default and default_config_directory is not None:
        fallback = default_config_directory / include
        if fallback.exists():
            return fallback
    raise FileNotFoundError(f"Include file not found: {include}")


def _collect_config_sources(
    config_path: Path,
    default_config_directory: Path,
    seen: set[Path],
    allow_default: bool,
) -> list[Path]:
    resolved = config_path.resolve()
    if resolved in seen:
        raise ValueError(f"Include cycle detected at {config_path}")
    seen.add(resolved)
    data = _load_yaml_mapping(config_path)
    sources = [config_path]
    includes = data.get("includes")
    if includes is None:
        seen.remove(resolved)
        return sources
    if not isinstance(includes, list):
        raise ValueError(f"Includes must be a list in {config_path}")
    for include in includes:
        if not isinstance(include, str):
            raise ValueError(f"Includes must be a list of file paths in {config_path}")
        include_path = _resolve_include_path(
            include,
            config_path.parent,
            default_config_directory,
            allow_default,
        )
        sources.extend(
            _collect_config_sources(
                include_path,
                default_config_directory,
                seen,
                allow_default=False,
            )
        )
    seen.remove(resolved)
    return sources


def find_widget_items_source(widget_name: str) -> Path:
    config_path = get_primary_config_path()
    if not config_path or not config_path.exists():
        raise FileNotFoundError("Config file not found.")
    default_config_directory = Path(__file__).resolve().parent
    sources = _collect_config_sources(
        config_path,
        default_config_directory,
        seen=set(),
        allow_default=True,
    )
    for source in sources:
        data = _load_yaml_mapping(source)
        widgets = data.get("widgets")
        if not isinstance(widgets, dict):
            continue
        widget_config = widgets.get(widget_name)
        if not isinstance(widget_config, dict):
            continue
        if "items" in widget_config:
            return source
    return config_path


def load_widget_items_from_file(path: Path, widget_name: str) -> dict:
    data = _load_yaml_mapping(path)
    widgets = data.get("widgets", {})
    if not isinstance(widgets, dict):
        raise ValueError(f"widgets must be a mapping in {path}")
    widget_config = widgets.get(widget_name)
    if widget_config is None:
        return {}
    if not isinstance(widget_config, dict):
        raise ValueError(f"widgets.{widget_name} must be a mapping in {path}")
    items = widget_config.get("items")
    if items is None:
        return {}
    if not isinstance(items, dict):
        raise ValueError(f"widgets.{widget_name}.items must be a mapping in {path}")
    return dict(items)


def write_widget_items_to_file(
    path: Path,
    widget_name: str,
    items: dict,
) -> None:
    data = _load_yaml_mapping(path)
    widgets = data.get("widgets")
    if widgets is None:
        widgets = {}
        data["widgets"] = widgets
    if not isinstance(widgets, dict):
        raise ValueError(f"widgets must be a mapping in {path}")
    widget_config = widgets.get(widget_name)
    if widget_config is None:
        widget_config = {}
        widgets[widget_name] = widget_config
    if not isinstance(widget_config, dict):
        raise ValueError(f"widgets.{widget_name} must be a mapping in {path}")
    widget_config["items"] = items
    path.write_text(
        yaml.safe_dump(data, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )


def get_widgets_paths() -> List[Path]:
    """Return list of widget search paths from config."""
    widgets_cfg = config["paths"]["widgets"].get(list)
    return [Path(p).expanduser() for p in widgets_cfg]
