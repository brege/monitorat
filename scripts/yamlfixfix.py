#!/usr/bin/env python3
"""
Run yamlfix on YAML files and then re-quote bare HH:MM values.
This avoids confuse interpreting times like 21:00 as integers.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_DIR = Path(__file__).with_name(".yamlfixfix-venv")
TIME_PATTERN = re.compile(r"(:[ \t]+)(\d{1,2}:\d{2})(?=[ \t]*(?:\n|#|$))")
EXCLUDED_DIRS = {".git", ".venv", ".yamlfixfix-venv", "__pycache__", ".mypy_cache"}


def get_venv_python() -> Path:
    bin_dir = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin")
    candidate = bin_dir / ("python.exe" if sys.platform == "win32" else "python3")
    if not candidate.exists():
        candidate = bin_dir / "python"
    return candidate


def get_yamlfix_bin() -> Path:
    bin_dir = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin")
    name = "yamlfix.exe" if sys.platform == "win32" else "yamlfix"
    return bin_dir / name


def ensure_yamlfix():
    yamlfix_bin = get_yamlfix_bin()
    if not VENV_DIR.exists():
        subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)], check=True)

    if yamlfix_bin.exists():
        return

    python_bin = get_venv_python()
    subprocess.run(
        [str(python_bin), "-m", "pip", "install", "--upgrade", "pip"], check=True
    )
    subprocess.run(
        [str(python_bin), "-m", "pip", "install", "--upgrade", "yamlfix"], check=True
    )


def run_yamlfix(files: List[Path]):
    ensure_yamlfix()
    yamlfix_bin = get_yamlfix_bin()
    cmd = [str(yamlfix_bin)] + [str(path) for path in files]
    subprocess.run(cmd, check=True)


def gather_yaml_files(paths: Iterable[str]) -> List[Path]:
    files: List[Path] = []
    if not paths:
        search_root = REPO_ROOT
        candidates = list(search_root.rglob("*.yml")) + list(
            search_root.rglob("*.yaml")
        )
        files.extend(candidates)
    else:
        for raw in paths:
            path = Path(raw).resolve()
            if path.is_dir():
                files.extend(path.rglob("*.yml"))
                files.extend(path.rglob("*.yaml"))
            elif path.suffix.lower() in {".yaml", ".yml"}:
                files.append(path)
    unique_files = sorted(set(files))

    def allowed(path: Path) -> bool:
        return not any(part in EXCLUDED_DIRS for part in path.parts)

    return [path for path in unique_files if path.exists() and allowed(path)]


def quote_times(path: Path) -> bool:
    try:
        original = path.read_text()
    except (OSError, UnicodeDecodeError):
        return False

    def repl(match: re.Match) -> str:
        prefix, time_value = match.groups()
        return f'{prefix}"{time_value}"'

    updated = TIME_PATTERN.sub(repl, original)
    if updated != original:
        path.write_text(updated)
        return True
    return False


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Run yamlfix and re-quote HH:MM scalars so confuse reads them as strings."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="YAML files or directories to process (defaults to entire repo).",
    )
    args = parser.parse_args(argv)

    files = gather_yaml_files(args.targets)
    if not files:
        print("No YAML files found to process.")
        return 0

    run_yamlfix(files)

    changed = 0
    for path in files:
        if quote_times(path):
            changed += 1

    print(
        f"yamlfix complete on {len(files)} file(s); re-quoted times in {changed} file(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
