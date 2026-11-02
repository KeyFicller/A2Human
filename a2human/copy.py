"""UI phrases and protocol strings. The Chinese wire text is the API's voice.

Error messages returned to clients are the Simplified Chinese strings in
``src/locales/wire.zh.json``. English is only for translating those messages
in the browser.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

Locale = str  # "zh" or "en"
Tree = dict[str, Any]


def locales_dir() -> Path:
    override = os.environ.get("A2HUMAN_LOCALES")
    if override:
        return Path(override)
    candidates = [
        Path.cwd() / "src" / "locales",
        Path(__file__).resolve().parents[1] / "src" / "locales",
    ]
    for path in candidates:
        if (path / "wire.zh.json").is_file():
            return path
    raise FileNotFoundError("locale files not found (looked for src/locales/wire.zh.json)")


def _read(name: str) -> Tree:
    return json.loads((locales_dir() / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _catalogs() -> dict[str, Tree]:
    return {"zh": _read("zh.json"), "en": _read("en.json")}


@lru_cache(maxsize=1)
def _wire_trees() -> tuple[Tree, Tree]:
    return _read("wire.zh.json"), _read("wire.en.json")


def fill(template: str, vars: dict[str, str | int] | None = None) -> str:
    values = vars or {}

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in values:
            return str(values[key])
        return match.group(0)

    return re.sub(r"\{(\w+)\}", replace, template)


def _lookup(tree: Tree, path: str) -> str:
    node: Any = tree
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(f"Missing copy: {path}")
        node = node[part]
    if not isinstance(node, str):
        raise KeyError(f"Missing copy: {path}")
    return node


def phrase(path: str, vars: dict[str, str | int] | None = None, locale: Locale = "zh") -> str:
    return fill(_lookup(_catalogs()[locale], path), vars)


def wire(path: str, vars: dict[str, str | int] | None = None) -> str:
    zh, _en = _wire_trees()
    return fill(_lookup(zh, path), vars)


class _Template:
    def __init__(self, pattern: re.Pattern[str], names: list[str], english: str, literal: int):
        self.pattern = pattern
        self.names = names
        self.english = english
        self.literal = literal


def _walk(zh_node: Any, en_node: Any, exact: dict[str, str], templates: list[_Template]) -> None:
    if isinstance(zh_node, str) and isinstance(en_node, str):
        names = re.findall(r"\{(\w+)\}", zh_node)
        if not names:
            exact[zh_node] = en_node
            return
        source = "^"
        parts = re.split(r"\{(\w+)\}", zh_node)
        for index, part in enumerate(parts):
            if index % 2 == 0:
                source += re.escape(part)
            else:
                source += "(.+)"
        literal = len(re.sub(r"\{\w+\}", "", zh_node))
        templates.append(_Template(re.compile(f"{source}$"), names, en_node, literal))
        return
    if not isinstance(zh_node, dict) or not isinstance(en_node, dict):
        return
    for key in zh_node:
        _walk(zh_node.get(key), en_node.get(key), exact, templates)


@lru_cache(maxsize=1)
def _english_index() -> tuple[dict[str, str], tuple[_Template, ...]]:
    zh, en = _wire_trees()
    exact: dict[str, str] = {}
    templates: list[_Template] = []
    _walk(zh, en, exact, templates)
    templates.sort(key=lambda item: (-item.literal, -len(item.pattern.pattern)))
    return exact, tuple(templates)


def localize_error(message: str, locale: Locale) -> str:
    """Translate a known wire error into English. Unknown text is returned as-is."""
    if locale != "en":
        return message
    exact, templates = _english_index()
    known = exact.get(message)
    if known:
        return known
    for template in templates:
        matched = template.pattern.search(message)
        if not matched:
            continue
        vars: dict[str, str] = {}
        for index, name in enumerate(template.names):
            raw = matched.group(index + 1) or ""
            vars[name] = exact.get(raw, raw)
        return fill(template.english, vars)
    return message
