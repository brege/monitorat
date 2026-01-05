#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import sys

import yaml


ALLOWED_DEFAULT_KEYS = {"summary", "lang"}
ALLOWED_DOC_KEYS = {
    "output",
    "preface",
    "footer",
    "summary",
    "include",
    "lang",
    "show_config",
}


def load_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Manifest must be a mapping.")
    return data


def validate_defaults(defaults: dict) -> dict:
    if defaults is None:
        return {}
    if not isinstance(defaults, dict):
        raise ValueError("Manifest defaults must be a mapping.")
    unknown_keys = set(defaults) - ALLOWED_DEFAULT_KEYS
    if unknown_keys:
        raise ValueError(f"Unknown defaults keys: {sorted(unknown_keys)}")
    return defaults


def validate_documents(documents: list) -> list:
    if not isinstance(documents, list) or not documents:
        raise ValueError("Manifest documents must be a non-empty list.")
    for index, doc in enumerate(documents):
        if not isinstance(doc, dict):
            raise ValueError(f"Document entry at index {index} must be a mapping.")
        unknown_keys = set(doc) - ALLOWED_DOC_KEYS
        if unknown_keys:
            raise ValueError(
                f"Unknown document keys at index {index}: {sorted(unknown_keys)}"
            )
        output_path = doc.get("output")
        if not isinstance(output_path, str) or not output_path.strip():
            raise ValueError(f"Document entry at index {index} missing output path.")
        include_path = doc.get("include")
        if include_path is not None and not isinstance(include_path, str):
            raise ValueError(
                f"Document entry at index {index} include must be a string."
            )
        preface = doc.get("preface")
        if preface is not None and not isinstance(preface, str):
            raise ValueError(
                f"Document entry at index {index} preface must be a string."
            )
        footer = doc.get("footer")
        if footer is not None and not isinstance(footer, str):
            raise ValueError(
                f"Document entry at index {index} footer must be a string."
            )
        summary = doc.get("summary")
        if summary is not None and not isinstance(summary, str):
            raise ValueError(
                f"Document entry at index {index} summary must be a string."
            )
        show_config = doc.get("show_config")
        if show_config is not None and not isinstance(show_config, bool):
            raise ValueError(
                f"Document entry at index {index} show_config must be a boolean."
            )
        lang = doc.get("lang")
        if lang is not None and not isinstance(lang, str):
            raise ValueError(f"Document entry at index {index} lang must be a string.")
    return documents


def render_document(doc: dict, defaults: dict) -> str:
    summary = doc.get("summary") or defaults.get("summary")
    lang = doc.get("lang") or defaults.get("lang")
    show_config = doc.get("show_config", True)
    include_path = doc.get("include")

    lines: list[str] = []
    preface = doc.get("preface")
    if preface:
        lines.append(preface.rstrip())
        lines.append("")

    if show_config:
        if not include_path:
            raise ValueError(f"Document {doc.get('output')} missing include path.")
        if not summary:
            raise ValueError(f"Document {doc.get('output')} missing summary.")
        if not lang:
            raise ValueError(f"Document {doc.get('output')} missing lang.")
        include_path = include_path.strip()
        lines.append("<details>")
        lines.append(f"<summary><b>{summary}</b></summary>")
        lines.append("")
        lines.append(f'{{{{ include:code path="{include_path}" lang="{lang}" }}}}')
        lines.append("</details>")

    footer = doc.get("footer")
    if footer:
        lines.append("")
        lines.append(footer.rstrip())

    return "\n".join(lines).rstrip() + "\n"


def generate_docs(manifest_path: Path) -> None:
    manifest = load_manifest(manifest_path)
    defaults = validate_defaults(manifest.get("defaults", {}))
    documents = validate_documents(manifest.get("documents"))

    repo_root = manifest_path.parent.parent.resolve()
    for doc in documents:
        output_path = Path(doc["output"])
        resolved_path = output_path
        if not output_path.is_absolute():
            resolved_path = (repo_root / output_path).resolve()
        if not resolved_path.is_relative_to(repo_root):
            raise ValueError(f"Output path escapes repo root: {output_path}")
        resolved_path.parent.mkdir(parents=True, exist_ok=True)
        content = render_document(doc, defaults)
        resolved_path.write_text(content, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate demo documentation markdown."
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).parent / "docs.yml",
        help="Path to documentation manifest.",
    )
    args = parser.parse_args()
    generate_docs(args.manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
