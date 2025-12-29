#!/usr/bin/env python3
"""
Generate synthetic data for demo and test modes.

Demo mode (-d/--demo):
  Generates network.log and speedtest.csv for the demo site.

Test mode (-t/--test):
  Generates metrics.csv with distinguishable curves per node.
  Each node gets a different waveform for visual distinction.
"""

from __future__ import annotations

import argparse
import csv
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List

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

TEST_NODE_WAVEFORMS = {
    "nas-1": "sawtooth",
    "nas-2": "sine",
    "nas-3": "square",
}


@dataclass
class NetworkLine:
    timestamp: datetime
    message: str


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic data for demo or test modes."
    )
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument(
        "-d",
        "--demo",
        action="store_true",
        help="Generate demo data (network.log, speedtest.csv)",
    )
    mode_group.add_argument(
        "-t",
        "--test",
        action="store_true",
        help="Generate test data (metrics.csv per node)",
    )
    parser.add_argument(
        "--data-dir",
        help="Directory to write data files (default: demo/data or test/data)",
    )
    parser.add_argument(
        "--node",
        choices=list(TEST_NODE_WAVEFORMS.keys()),
        help="Node name for test mode (determines waveform)",
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="Hours of test data to generate (default: 24)",
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
    print(f"  Generated {target_path} ({len(entries)} entries)")


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
    print(f"  Generated {target_path} ({len(rows)} rows)")


def waveform_value(waveform: str, t: float, period: float = 1.0) -> float:
    """
    Generate waveform value at time t.
    Returns value in range [0, 1].
    """
    phase = (t % period) / period

    if waveform == "sawtooth":
        return phase

    if waveform == "sine":
        return (math.sin(2 * math.pi * phase) + 1) / 2

    if waveform == "square":
        return 1.0 if phase < 0.5 else 0.0

    if waveform == "triangle":
        return 2 * phase if phase < 0.5 else 2 * (1 - phase)

    return 0.5


def generate_test_metrics(
    target_path: Path,
    node_name: str,
    now_value: datetime,
    hours: int = 24,
    interval_seconds: int = 60,
) -> None:
    """Generate metrics.csv with distinguishable waveform patterns."""
    waveform = TEST_NODE_WAVEFORMS.get(node_name, "sine")
    start = now_value - timedelta(hours=hours)
    random_generator = random.Random(hash(node_name))

    rows = []
    current = start
    step = 0

    while current <= now_value:
        t_hours = step * interval_seconds / 3600
        wave = waveform_value(waveform, t_hours, period=4.0)

        cpu_percent = 10 + wave * 60 + random_generator.gauss(0, 3)
        memory_percent = 30 + wave * 40 + random_generator.gauss(0, 2)
        load_1min = 0.2 + wave * 2.0 + random_generator.gauss(0, 0.1)
        temp_c = 40 + wave * 30 + random_generator.gauss(0, 2)

        disk_read_mb = 1000 + step * 0.5 + random_generator.gauss(0, 10)
        disk_write_mb = 5000 + step * 2 + random_generator.gauss(0, 50)
        net_rx_mb = 500 + step * 0.3 + random_generator.gauss(0, 5)
        net_tx_mb = 800 + step * 0.4 + random_generator.gauss(0, 8)

        rows.append(
            {
                "timestamp": format_iso_datetime(current, False),
                "cpu_percent": f"{max(0, min(100, cpu_percent)):.1f}",
                "memory_percent": f"{max(0, min(100, memory_percent)):.1f}",
                "disk_read_mb": f"{max(0, disk_read_mb):.1f}",
                "disk_write_mb": f"{max(0, disk_write_mb):.1f}",
                "net_rx_mb": f"{max(0, net_rx_mb):.1f}",
                "net_tx_mb": f"{max(0, net_tx_mb):.1f}",
                "load_1min": f"{max(0, load_1min):.2f}",
                "temp_c": f"{max(0, min(100, temp_c)):.1f}",
                "battery_percent": "100.0",
                "source": "synthetic",
                "upstream": "",
            }
        )

        current += timedelta(seconds=interval_seconds)
        step += 1

    fieldnames = [
        "timestamp",
        "cpu_percent",
        "memory_percent",
        "disk_read_mb",
        "disk_write_mb",
        "net_rx_mb",
        "net_tx_mb",
        "load_1min",
        "temp_c",
        "battery_percent",
        "source",
        "upstream",
    ]

    with target_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"  Generated {target_path} ({len(rows)} rows, waveform={waveform})")


def run_demo_mode(data_dir: Path) -> None:
    print("Demo mode: generating demo data")
    data_dir.mkdir(parents=True, exist_ok=True)
    now_value = datetime.now(timezone.utc)
    generate_network_log(data_dir / "network.log", now_value)
    generate_speedtest_csv(data_dir / "speedtest.csv", now_value)


def run_test_mode(fixtures_dir: Path, node: str | None, hours: int) -> None:
    print("Test mode: generating test data")
    now_value = datetime.now(timezone.utc)

    if node:
        data_dir = fixtures_dir / node / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        generate_test_metrics(data_dir / "metrics.csv", node, now_value, hours)
    else:
        for node_name in TEST_NODE_WAVEFORMS:
            data_dir = fixtures_dir / node_name / "data"
            data_dir.mkdir(parents=True, exist_ok=True)
            generate_test_metrics(data_dir / "metrics.csv", node_name, now_value, hours)


def main() -> None:
    args = parse_arguments()
    project_root = Path(__file__).resolve().parent.parent

    if args.demo:
        data_dir = (
            Path(args.data_dir) if args.data_dir else project_root / "demo" / "data"
        )
        run_demo_mode(data_dir)
    elif args.test:
        fixtures_dir = (
            Path(args.data_dir) if args.data_dir else project_root / "test" / "fixtures"
        )
        run_test_mode(fixtures_dir, args.node, args.hours)

    print("Done")


if __name__ == "__main__":
    main()
