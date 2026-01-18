#!/usr/bin/env python3
"""Generate fixtures for editor demo."""

import shutil
from pathlib import Path

import yaml

from demo.docs import generate_docs

DEMO_DIR = Path(__file__).parent


def generate_reminders():
    data_dir = DEMO_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    reminders_yml = data_dir / "reminders.yml"
    snippet_path = DEMO_DIR.parent / "simple" / "snippets" / "reminders.yaml"
    payload = yaml.safe_load(snippet_path.read_text(encoding="utf-8")) or {}
    items = payload["widgets"]["reminders"]["items"]

    reminders_yml.write_text(
        yaml.safe_dump(items, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    print(f"Generated {reminders_yml}")


def generate_dummy_doc():
    generate_docs(DEMO_DIR / "index.yml")


def generate_services():
    data_dir = DEMO_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    services_yml = data_dir / "services.yml"
    snippet_path = DEMO_DIR.parent / "simple" / "snippets" / "services.yaml"
    payload = yaml.safe_load(snippet_path.read_text(encoding="utf-8")) or {}
    items = payload["widgets"]["services"]["items"]

    services_yml.write_text(
        yaml.safe_dump(items, sort_keys=False, default_flow_style=False),
        encoding="utf-8",
    )
    print(f"Generated {services_yml}")


def copy_snapshot_data():
    data_dir = DEMO_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    source_dir = DEMO_DIR.parent / "simple" / "data"
    for filename in ["reminders.json", "snapshot.jsonl"]:
        source = source_dir / filename
        if source.exists():
            dest = data_dir / filename
            shutil.copy2(source, dest)
            print(f"Copied {source} → {dest}")


def reset_editor_images():
    img_dir = DEMO_DIR / "img"
    if img_dir.exists():
        shutil.rmtree(img_dir)
    (img_dir / "reminders").mkdir(parents=True, exist_ok=True)
    (img_dir / "services" / "docker").mkdir(parents=True, exist_ok=True)
    (img_dir / "services" / "systemd").mkdir(parents=True, exist_ok=True)
    print(f"Reset {img_dir}")

    base_images = DEMO_DIR.parent / "simple" / "img"
    shutil.copytree(
        base_images / "reminders", img_dir / "reminders", dirs_exist_ok=True
    )
    shutil.copytree(base_images / "services", img_dir / "services", dirs_exist_ok=True)
    shutil.copy2(base_images / "favicon.svg", img_dir / "favicon.svg")


def main():
    reset_editor_images()
    generate_reminders()
    generate_services()
    copy_snapshot_data()
    generate_dummy_doc()


if __name__ == "__main__":
    main()
