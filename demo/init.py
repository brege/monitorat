#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

import confuse

FAKE_SERVER_NAMES = [
    "Valentine",
    "Annesburg",
    "Van Horn Trading Post",
    "Rhodes",
    "Lagras",
    "Saint Denis",
    "Blackwater",
    "Strawberry",
    "Armadillo",
    "Tumbleweed",
]


@dataclass
class NetworkLine:
    timestamp: datetime
    message: str


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate demo synthetic data.")
    parser.add_argument(
        "--config",
        default=str(Path(__file__).resolve().parent / "config.yaml"),
        help="Path to demo config.yaml.",
    )
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parent / "data"),
        help="Directory to write demo data files.",
    )
    return parser.parse_args()


def next_fake_server_name(index: int) -> str:
    return FAKE_SERVER_NAMES[index % len(FAKE_SERVER_NAMES)]


def format_iso_datetime(value: datetime, use_timezone: bool) -> str:
    if use_timezone:
        return (
            value.astimezone(timezone.utc)
            .isoformat(timespec="microseconds")
            .replace("+00:00", "Z")
        )
    return value.isoformat(timespec="microseconds")


def load_services_statuses(config_path: Path) -> dict[str, str]:
    config = confuse.Configuration("monitor@", __name__)
    config.set_file(config_path, base_for_paths=True)
    if config["includes"].exists():
        include_root = config_path.parent
        for include in config["includes"].get(list):
            config.set_file(include_root / include, base_for_paths=True)
    items = config["widgets"]["services"]["items"].get(dict)
    statuses: dict[str, str] = {}
    for service in items.values():
        for key in service.get("services", []):
            statuses[key] = "ok"
        for key in service.get("timers", []):
            statuses[key] = "ok"
        for key in service.get("containers", []):
            statuses[key] = "ok"
    return statuses


def generate_network_log(
    target_path: Path, now_value: datetime, days: int = 7, interval_seconds: int = 600
) -> None:
    start = now_value - timedelta(days=days)
    domain = "example.com"
    ip_addresses = ["10.0.0.1", "10.0.0.2", "10.0.0.3"]

    ip_change_times = [
        now_value - timedelta(days=5),
        now_value - timedelta(days=2),
    ]
    outage_start = now_value - timedelta(hours=6, minutes=30)
    outage_end = outage_start + timedelta(minutes=30)
    failure_times = [
        now_value - timedelta(days=4, hours=3),
        now_value - timedelta(days=2, hours=8),
        now_value - timedelta(hours=18),
    ]

    def resolve_ip(timestamp: datetime) -> str:
        if timestamp >= ip_change_times[1]:
            return ip_addresses[2]
        if timestamp >= ip_change_times[0]:
            return ip_addresses[1]
        return ip_addresses[0]

    entries: List[NetworkLine] = []
    current = start
    while current <= now_value:
        if outage_start <= current <= outage_end:
            current += timedelta(seconds=interval_seconds)
            continue
        ip_address = resolve_ip(current)
        message = (
            f"server monitor-network: INFO:    "
            f"[{domain}]> detected IPv4 address {ip_address}"
        )
        entries.append(NetworkLine(timestamp=current, message=message))
        current += timedelta(seconds=interval_seconds)

    for failure_time in failure_times:
        message = (
            f"server monitor-network: FAILED:  "
            f"[{domain}]> updating {domain}: nohost: unable to resolve current IP"
        )
        entries.append(NetworkLine(timestamp=failure_time, message=message))

    entries.sort(key=lambda item: item.timestamp)
    output_lines = [
        f"{entry.timestamp:%b} {entry.timestamp.day:2d} {entry.timestamp:%H:%M:%S} {entry.message}"
        for entry in entries
    ]
    target_path.write_text("\n".join(output_lines) + "\n", encoding="utf-8")


def generate_speedtest_csv(target_path: Path, now_value: datetime) -> None:
    days = 90
    start = now_value - timedelta(days=days)
    random_generator = random.Random(947321)
    offsets = [
        0,
        1,
        3,
        5,
        7,
        9,
        12,
        15,
        18,
        21,
        24,
        27,
        30,
        33,
        36,
        39,
        42,
        45,
        48,
        52,
        56,
        60,
        64,
        68,
        72,
        76,
        80,
        83,
        85,
        87,
        88,
        90,
    ]
    rows = []
    for index, offset_days in enumerate(offsets):
        hour_offset = (offset_days * 7) % 24
        minute_offset = (offset_days * 13) % 60
        timestamp = start + timedelta(
            days=offset_days, hours=hour_offset, minutes=minute_offset
        )
        baseline_mbps = 300
        download_mbps = baseline_mbps + random_generator.gauss(0, baseline_mbps * 0.1)
        if random_generator.random() < 0.12:
            download_mbps -= random_generator.uniform(60, 130)
        if random_generator.random() < 0.08:
            download_mbps += random_generator.uniform(80, 160)
        download_mbps = min(500, max(120, download_mbps))
        upload_mbps = download_mbps / 5 + random_generator.uniform(-6, 10)
        upload_mbps = min(120, max(12, upload_mbps))
        ping_ms = random_generator.uniform(35, 85)
        server_name = next_fake_server_name(index)
        rows.append(
            {
                "timestamp": format_iso_datetime(timestamp, True),
                "download": f"{download_mbps * 1_000_000:.6f}",
                "upload": f"{upload_mbps * 1_000_000:.6f}",
                "ping": f"{ping_ms:.3f}",
                "server": server_name,
                "ip_address": "",
            }
        )

    with target_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "timestamp",
                "download",
                "upload",
                "ping",
                "server",
                "ip_address",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    arguments = parse_arguments()
    data_dir = Path(arguments.data_dir).expanduser()
    data_dir.mkdir(parents=True, exist_ok=True)

    now_value = datetime.now(timezone.utc)
    generate_network_log(data_dir / "network.log", now_value)
    generate_speedtest_csv(data_dir / "speedtest.csv", now_value)


if __name__ == "__main__":
    main()
