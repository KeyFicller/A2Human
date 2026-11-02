"""Everyday skills shared by the publish form and card validation.

The list lives in ``src/locales/skill-catalog.json`` so the browser and the API
read one file. A catalog name is a global id. Any other casing of that id is
reserved and cannot be used as a custom skill.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from a2human.copy import locales_dir


@lru_cache(maxsize=1)
def skill_catalog() -> list[dict[str, Any]]:
    payload = json.loads((locales_dir() / "skill-catalog.json").read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise RuntimeError("skill catalog must be a list")
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
