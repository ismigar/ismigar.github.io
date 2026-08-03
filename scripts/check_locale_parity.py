#!/usr/bin/env python3
"""Verify structural and change-set parity across localized landing pages."""

from __future__ import annotations

import argparse
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
LOCALIZED_PAGES = ("index.html", "index.ca.html", "index.es.html")
STRUCTURAL_ATTRIBUTES = {
    "class",
    "id",
    "role",
    "target",
    "rel",
    "aria-controls",
    "aria-expanded",
    "aria-hidden",
}


class StructureParser(HTMLParser):
    """Collect a translation-independent representation of an HTML document."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[tuple[str, str, tuple[tuple[str, str], ...]]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        structural = tuple(
            sorted(
                (name, value or "")
                for name, value in attrs
                if name in STRUCTURAL_ATTRIBUTES
            )
        )
        self.tokens.append(("start", tag, structural))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.tokens.append(("end", tag, ()))

    def handle_endtag(self, tag: str) -> None:
        self.tokens.append(("end", tag, ()))


def document_structure(path: Path) -> list[tuple[str, str, tuple[tuple[str, str], ...]]]:
    """Return stable structural tokens for one localized document."""
    parser = StructureParser()
    parser.feed(path.read_text(encoding="utf-8"))
    normalized: list[tuple[str, str, tuple[tuple[str, str], ...]]] = []
    inside_language_switch = False
    for kind, tag, attrs in parser.tokens:
        classes = dict(attrs).get("class", "").split()
        if kind == "start" and tag == "div" and "lang-switch" in classes:
            inside_language_switch = True
        if inside_language_switch and tag in {"a", "span"}:
            normalized.append((kind, "locale-option", ()))
        else:
            normalized.append((kind, tag, attrs))
        if kind == "end" and tag == "div" and inside_language_switch:
            inside_language_switch = False
    return normalized


def changed_files(base_ref: str, root: Path = ROOT) -> set[str]:
    """Return repository-relative files changed from a Git base reference."""
    if not base_ref or set(base_ref) == {"0"}:
        return set()
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base_ref}...HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def validate_change_set(paths: set[str]) -> list[str]:
    """Require every locale page when any localized landing page changes."""
    changed_locales = set(LOCALIZED_PAGES).intersection(paths)
    if changed_locales and changed_locales != set(LOCALIZED_PAGES):
        missing = sorted(set(LOCALIZED_PAGES) - changed_locales)
        return [
            "Localized landing pages must change together. Missing: "
            + ", ".join(missing)
        ]
    return []


def validate_structure(root: Path = ROOT) -> list[str]:
    """Require identical semantic structure across all landing locales."""
    reference = document_structure(root / LOCALIZED_PAGES[0])
    errors: list[str] = []
    for filename in LOCALIZED_PAGES[1:]:
        candidate = document_structure(root / filename)
        if candidate != reference:
            errors.append(
                f"{filename} does not match the semantic structure of "
                f"{LOCALIZED_PAGES[0]}"
            )
    return errors


def main() -> int:
    """Run locale parity checks."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref", default="")
    args = parser.parse_args()

    errors = validate_structure()
    if args.base_ref:
        errors.extend(validate_change_set(changed_files(args.base_ref)))

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Locale parity verified for English, Catalan, and Spanish landing pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
