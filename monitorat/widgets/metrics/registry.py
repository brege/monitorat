"""Metrics backend registry.

To add a new observable (quantity):
1) Add a getter on MetricContext if the source data is new.
2) Add a MetricQuantity in get_core_quantities() with key/label/unit/title.
3) Optionally add to history.table.columns and/or snapshots.quantities in config.
4) If it should influence status, add a thresholds entry and set status_key if needed.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Dict, Iterable, List, Optional, Tuple

import os
import psutil


def identity_value(value: Optional[float]) -> Optional[float]:
    return value


class MetricContext:
    def __init__(self, storage_mounts: List[str]):
        self.timestamp = datetime.now()
        self.storage_mounts = storage_mounts
        self._cache: Dict[str, object] = {}

    def _cache_value(self, key: str, value: object) -> object:
        self._cache[key] = value
        return value

    def _get_cached(self, key: str) -> Optional[object]:
        return self._cache.get(key)

    def get_cpu_percent(self) -> Optional[float]:
        cached = self._get_cached("cpu_percent")
        if cached is not None:
            return cached
        return self._cache_value("cpu_percent", psutil.cpu_percent(interval=0.1))

    def get_memory_percent(self) -> Optional[float]:
        cached = self._get_cached("memory_percent")
        if cached is not None:
            return cached
        return self._cache_value("memory_percent", psutil.virtual_memory().percent)

    def get_memory_usage(self) -> Optional[Tuple[int, int, float]]:
        cached = self._get_cached("memory_usage")
        if cached is not None:
            return cached
        memory = psutil.virtual_memory()
        return self._cache_value(
            "memory_usage", (memory.used, memory.total, memory.percent)
        )

    def get_disk_io(self):
        cached = self._get_cached("disk_io")
        if cached is not None:
            return cached
        return self._cache_value("disk_io", psutil.disk_io_counters())

    def get_network_io(self):
        cached = self._get_cached("network_io")
        if cached is not None:
            return cached
        return self._cache_value("network_io", psutil.net_io_counters())

    def get_load_averages(self) -> Optional[Tuple[float, float, float]]:
        cached = self._get_cached("load_averages")
        if cached is not None:
            return cached
        try:
            return self._cache_value("load_averages", os.getloadavg())
        except OSError:
            return self._cache_value("load_averages", None)

    def get_temperature_c(self) -> Optional[float]:
        cached = self._get_cached("temperature_c")
        if cached is not None:
            return cached
        try:
            sensors = psutil.sensors_temperatures()
        except (AttributeError, OSError):
            return self._cache_value("temperature_c", None)

        if not sensors:
            return self._cache_value("temperature_c", None)

        # Select a plausible temperature across known sensor groups.
        for sensor_name in ("coretemp", "k10temp", "cpu_thermal"):
            if sensor_name in sensors and sensors[sensor_name]:
                values = [sensor.current for sensor in sensors[sensor_name]]
                if values:
                    return self._cache_value("temperature_c", max(values))

        for entries in sensors.values():
            for sensor in entries:
                if 10 < sensor.current < 120:
                    return self._cache_value("temperature_c", sensor.current)

        return self._cache_value("temperature_c", None)

    def get_battery_percent(self) -> Optional[float]:
        cached = self._get_cached("battery_percent")
        if cached is not None:
            return cached
        try:
            battery = psutil.sensors_battery()
        except (AttributeError, OSError):
            return self._cache_value("battery_percent", None)
        if not battery:
            return self._cache_value("battery_percent", None)
        return self._cache_value("battery_percent", battery.percent)

    def get_disk_percent(self) -> Optional[float]:
        cached = self._get_cached("disk_percent")
        if cached is not None:
            return cached
        usage = self.get_disk_usage()
        return self._cache_value("disk_percent", usage[2] if usage else None)

    def get_storage_percent(self) -> Optional[float]:
        cached = self._get_cached("storage_percent")
        if cached is not None:
            return cached
        usage = self.get_storage_usage()
        return self._cache_value("storage_percent", usage[2] if usage else None)

    def get_uptime_seconds(self) -> Optional[float]:
        cached = self._get_cached("uptime_seconds")
        if cached is not None:
            return cached
        try:
            with open("/proc/uptime", "r", encoding="utf-8") as handle:
                return self._cache_value(
                    "uptime_seconds", float(handle.read().split()[0])
                )
        except (OSError, ValueError, IndexError):
            return self._cache_value("uptime_seconds", None)

    def get_disk_usage(self) -> Optional[Tuple[int, int, float]]:
        cached = self._get_cached("disk_usage")
        if cached is not None:
            return cached
        usage = psutil.disk_usage("/")
        return self._cache_value("disk_usage", (usage.used, usage.total, usage.percent))

    def get_storage_usage(self) -> Optional[Tuple[int, int, float]]:
        cached = self._get_cached("storage_usage")
        if cached is not None:
            return cached
        for path in self.storage_mounts:
            if not os.path.exists(path):
                continue
            usage = psutil.disk_usage(path)
            return self._cache_value(
                "storage_usage", (usage.used, usage.total, usage.percent)
            )
        return self._cache_value("storage_usage", None)


MetricValueType = Optional[float | str]


@dataclass(frozen=True)
class MetricQuantity:
    key: str
    label: str
    unit: str
    collect: Callable[[MetricContext], MetricValueType]
    title: Optional[str] = None
    status_key: Optional[str] = None
    csv_value: Callable[[MetricValueType], Optional[float]] = identity_value


@dataclass(frozen=True)
class MetricValue:
    key: str
    label: str
    unit: str
    value: MetricValueType


class MetricRegistry:
    def __init__(self, quantities: Iterable[MetricQuantity]):
        self._quantities = {quantity.key: quantity for quantity in quantities}

    def list_quantities(self) -> List[MetricQuantity]:
        return list(self._quantities.values())

    def get_quantity(self, key: str) -> MetricQuantity:
        return self._quantities[key]

    def serialize_quantities(self) -> List[Dict[str, str]]:
        return [
            {
                "key": quantity.key,
                "label": quantity.label,
                "unit": quantity.unit,
                "title": quantity.title or quantity.label,
                "status_key": quantity.status_key or quantity.key,
            }
            for quantity in self._quantities.values()
        ]

    def collect_values(
        self, keys: Iterable[str], context: MetricContext
    ) -> Dict[str, MetricValue]:
        values: Dict[str, MetricValue] = {}
        for key in keys:
            quantity = self._quantities[key]
            value = quantity.collect(context)
            values[key] = MetricValue(
                key=key,
                label=quantity.label,
                unit=quantity.unit,
                value=value,
            )
        return values

    def build_csv_row(
        self, keys: Iterable[str], values: Dict[str, MetricValue]
    ) -> Dict[str, Optional[float]]:
        row: Dict[str, Optional[float]] = {}
        for key in keys:
            quantity = self._quantities[key]
            row[key] = quantity.csv_value(values[key].value)
        return row


def build_metric_context(storage_mounts: List[str]) -> MetricContext:
    return MetricContext(storage_mounts)


def bytes_to_megabytes(value: Optional[int]) -> Optional[float]:
    if value is None:
        return None
    return value / (1024**2)


def format_gigabytes(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    return f"{value / (1024**3):.1f}GB"


def format_terabytes(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    return f"{value / (1024**4):.1f}TB"


def get_core_quantities() -> List[MetricQuantity]:
    return [
        MetricQuantity(
            key="uptime_seconds",
            label="Uptime",
            unit="seconds",
            title="Uptime",
            collect=lambda context: context.get_uptime_seconds(),
        ),
        MetricQuantity(
            key="load_summary",
            label="Load Average",
            unit="text",
            title="Load Average",
            status_key="load_1min",
            collect=lambda context: (
                " ".join(f"{value:.2f}" for value in context.get_load_averages())
                if context.get_load_averages()
                else None
            ),
        ),
        MetricQuantity(
            key="memory_usage",
            label="Memory Usage",
            unit="text",
            title="Memory Usage",
            status_key="memory_percent",
            collect=lambda context: (
                None
                if not context.get_memory_usage()
                else f"{format_gigabytes(context.get_memory_usage()[0])} / "
                f"{format_gigabytes(context.get_memory_usage()[1])}"
            ),
        ),
        MetricQuantity(
            key="cpu_percent",
            label="CPU %",
            unit="percent",
            title="CPU %",
            collect=lambda context: context.get_cpu_percent(),
        ),
        MetricQuantity(
            key="memory_percent",
            label="Memory %",
            unit="percent",
            title="Memory Usage",
            collect=lambda context: context.get_memory_percent(),
        ),
        MetricQuantity(
            key="disk_read_mb",
            label="Disk Read",
            unit="megabytes",
            title="Disk Read",
            collect=lambda context: bytes_to_megabytes(
                context.get_disk_io().read_bytes if context.get_disk_io() else None
            ),
        ),
        MetricQuantity(
            key="disk_write_mb",
            label="Disk Write",
            unit="megabytes",
            title="Disk Write",
            collect=lambda context: bytes_to_megabytes(
                context.get_disk_io().write_bytes if context.get_disk_io() else None
            ),
        ),
        MetricQuantity(
            key="net_rx_mb",
            label="Network RX",
            unit="megabytes",
            title="Network RX",
            collect=lambda context: bytes_to_megabytes(
                context.get_network_io().bytes_recv
                if context.get_network_io()
                else None
            ),
        ),
        MetricQuantity(
            key="net_tx_mb",
            label="Network TX",
            unit="megabytes",
            title="Network TX",
            collect=lambda context: bytes_to_megabytes(
                context.get_network_io().bytes_sent
                if context.get_network_io()
                else None
            ),
        ),
        MetricQuantity(
            key="load_1min",
            label="Load (1m)",
            unit="load",
            title="Load Average",
            collect=lambda context: (
                context.get_load_averages()[0] if context.get_load_averages() else None
            ),
        ),
        MetricQuantity(
            key="temp_c",
            label="Temperature",
            unit="celsius",
            title="Temperature",
            collect=lambda context: context.get_temperature_c(),
        ),
        MetricQuantity(
            key="battery_percent",
            label="Battery %",
            unit="percent",
            title="Battery",
            collect=lambda context: context.get_battery_percent(),
        ),
        MetricQuantity(
            key="disk_percent",
            label="Disk %",
            unit="percent",
            title="Disk Usage",
            collect=lambda context: context.get_disk_percent(),
        ),
        MetricQuantity(
            key="storage_percent",
            label="Storage %",
            unit="percent",
            title="Storage Usage",
            collect=lambda context: context.get_storage_percent(),
        ),
        MetricQuantity(
            key="disk_usage",
            label="Disk Usage",
            unit="text",
            title="Disk Usage",
            status_key="disk_percent",
            collect=lambda context: (
                None
                if not context.get_disk_usage()
                else f"{format_gigabytes(context.get_disk_usage()[0])} / "
                f"{format_gigabytes(context.get_disk_usage()[1])} "
                f"({context.get_disk_usage()[2]:.0f}%)"
            ),
        ),
        MetricQuantity(
            key="storage_usage",
            label="Storage Usage",
            unit="text",
            title="NFS Storage",
            status_key="storage_percent",
            collect=lambda context: (
                None
                if not context.get_storage_usage()
                else f"{format_terabytes(context.get_storage_usage()[0])} / "
                f"{format_terabytes(context.get_storage_usage()[1])} "
                f"({context.get_storage_usage()[2]:.0f}%)"
            ),
        ),
    ]


def build_registry(
    extra_quantities: Optional[Iterable[MetricQuantity]] = None,
) -> MetricRegistry:
    quantities = list(get_core_quantities())
    if extra_quantities:
        quantities.extend(extra_quantities)
    return MetricRegistry(quantities)


METRIC_REGISTRY = build_registry()
