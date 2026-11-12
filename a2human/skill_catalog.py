"""First-screen skills shared by the publish form and card validation.

The list lives in ``src/locales/skill-catalog.json`` so the browser and the API
read one file. A catalog name is the ASCII tool id. Any other casing of that
id is reserved and cannot be used as a custom skill. ``title`` is the name a
person shows; it is not the id agents call.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any

from a2human.copy import locales_dir

_TOOL_ID = re.compile(r"^[a-z][a-z0-9_]{0,23}$")


def _text(item: dict[str, Any], key: str, limit: int) -> None:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise RuntimeError(f"skill catalog {item.get('name')} needs {key}")


def _schema(item: dict[str, Any], key: str) -> dict[str, Any]:
    value = item.get(key)
    if not isinstance(value, dict) or value.get("type") != "object":
        raise RuntimeError(f"skill catalog {item.get('name')} needs {key}")
    properties = value.get("properties")
    if not isinstance(properties, dict) or not properties:
        raise RuntimeError(f"skill catalog {item.get('name')} needs {key}")
    return value


@lru_cache(maxsize=1)
def skill_catalog() -> list[dict[str, Any]]:
    payload = json.loads((locales_dir() / "skill-catalog.json").read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise RuntimeError("skill catalog must be a list")
    seen: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            raise RuntimeError("skill catalog item must be an object")
        name = item.get("name")
        if not isinstance(name, str) or not _TOOL_ID.fullmatch(name) or name in seen:
            raise RuntimeError("skill catalog name must be a unique tool id")
        seen.add(name)
        _text(item, "title", 32)
        _text(item, "description", 120)
        _text(item, "sample", 200)
        incoming = _schema(item, "inputSchema")
        _schema(item, "outputSchema")
        if list(incoming["properties"]) != ["task"] or incoming.get("required") != ["task"]:
            raise RuntimeError(f"skill catalog {name} starts from one required text input")
        task = incoming["properties"]["task"]
        if not isinstance(task, dict) or task.get("type") != "string":
            raise RuntimeError(f"skill catalog {name} starts from one required text input")
    return payload


def catalog_ids() -> set[str]:
    return {item["name"] for item in skill_catalog()}


CATALOG_IDS = catalog_ids()


def reserved_custom_name(name: str) -> bool:
    """True when ``name`` is a catalog id written with different casing."""
    folded = name.casefold()
    for item in skill_catalog():
        if item["name"].casefold() == folded and item["name"] != name:
            return True
    return False
