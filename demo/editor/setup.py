#!/usr/bin/env python3
"""Generate fixtures for editor demo."""

from pathlib import Path
import shutil

DEMO_DIR = Path(__file__).parent


def generate_reminders():
    """Generate reminders.yml fixture."""
    data_dir = DEMO_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    reminders_yml = data_dir / "reminders.yml"
    reminders_yml.write_text(
        "protonmail:\n"
        '  name: "ProtonMail Password"\n'
        '  url: "https://protonmail.com"\n'
        '  icon: "reminders/protonmail.png"\n'
        "  expiry_days: 90\n"
        '  reason: "Change your ProtonMail password"\n'
        "github:\n"
        '  name: "GitHub SSH Keys"\n'
        '  url: "https://github.com/settings/keys"\n'
        '  icon: "reminders/github.svg"\n'
        "  expiry_days: 180\n"
        '  reason: "Review and rotate SSH keys"\n'
    )
    print(f"Generated {reminders_yml}")


def generate_dummy_doc():
    """Generate dummy.md fixture."""
    docs_dir = DEMO_DIR / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    dummy_md = docs_dir / "dummy.md"
    dummy_md.write_text(
        "### Edit Me\n"
        "\n"
        "This is a dummy document for testing the editor. It is not\n"
        "intended for actual use.\n"
        "\n"
        "```bash\n"
        "uv tool install monitorat\n"
        "```\n"
        "\n"
        "\n"
        "See https://github.com/brege/monitorat for more information.\n"
    )
    print(f"Generated {dummy_md}")


def reset_editor_images():
    img_dir = DEMO_DIR / "img"
    if img_dir.exists():
        shutil.rmtree(img_dir)
    (img_dir / "reminders").mkdir(parents=True, exist_ok=True)
    print(f"Reset {img_dir}")

    source_icons = DEMO_DIR.parent / "simple" / "img" / "reminders"
    if source_icons.exists():
        shutil.copytree(source_icons, img_dir / "reminders", dirs_exist_ok=True)
        print(f"Copied {source_icons} -> {img_dir / 'reminders'}")


def main():
    reset_editor_images()
    generate_reminders()
    generate_dummy_doc()


if __name__ == "__main__":
    main()
