"""JSON file at ``data/store.json``. One writer at a time, same as the old server.

Missing file starts an empty market and writes it. A bad file is not replaced.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Callable, TypeVar

from a2human.images import IMAGE_TYPES
from a2human.jsonutil import dumps, loads
from a2human.rules import create_seed

T = TypeVar("T")
_lock = threading.Lock()


def data_file() -> Path:
    root = os.environ.get("A2HUMAN_DATA")
    directory = Path(root) if root else Path.cwd() / "data"
    return directory / "store.json"


def _schema_of(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    try:
        encoded = dumps(value)
        if len(encoded) > 2000:
            return None
        parsed = loads(encoded)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _skill_of(value: object) -> dict[str, Any] | None:
    if isinstance(value, str) and value.strip():
        name = value.strip()
        return {"name": name, "description": name}
    if not isinstance(value, dict) or not isinstance(value.get("name"), str) or not value["name"].strip():
        return None
    name = value["name"].strip()
    description = value["description"].strip() if isinstance(value.get("description"), str) and value["description"].strip() else name
    input_schema = _schema_of(value.get("inputSchema"))
    output_schema = _schema_of(value.get("outputSchema"))
    if input_schema and output_schema:
        return {"name": name, "description": description, "inputSchema": input_schema, "outputSchema": output_schema}
    return {"name": name, "description": description}


def _image_of(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict) or value.get("mediaType") not in IMAGE_TYPES:
        return None
    raw = value["raw"] if isinstance(value.get("raw"), str) and len(value["raw"]) <= 1_500_000 else None
    url = value["url"] if isinstance(value.get("url"), str) and value["url"].startswith(("http://", "https://")) and len(value["url"]) <= 2000 else None
    if not raw and not url:
        return None
    image: dict[str, Any] = {"mediaType": value["mediaType"]}
    if raw:
        image["raw"] = raw
    if url:
        image["url"] = url
    if isinstance(value.get("filename"), str):
        image["filename"] = value["filename"][:80]
    return image


def normalize(store: dict[str, Any]) -> dict[str, Any]:
    store.setdefault("agents", [])
    store.setdefault("tasks", [])
    store.setdefault("messages", [])
    for agent in store["agents"]:
        agent["available"] = bool(agent.get("available", False))
        skills = agent.get("skills") if isinstance(agent.get("skills"), list) else []
        agent["skills"] = [skill for item in skills if (skill := _skill_of(item))]
    for task in store["tasks"]:
        images = [_image_of(item) for item in task.get("images") or []]
        images = [image for image in images if image]
        if images:
            task["images"] = images
        else:
            task.pop("images", None)
        artifact = _image_of(task.get("artifactImage"))
        if artifact:
            task["artifactImage"] = artifact
        else:
            task.pop("artifactImage", None)
    return store


def _load() -> dict[str, Any]:
    path = data_file()
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        store = normalize(create_seed())
        _persist(store)
        return store
    return normalize(loads(raw))


def _persist(store: dict[str, Any]) -> None:
    path = data_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(store, pretty=True), encoding="utf-8")


def update_store(fn: Callable[[dict[str, Any]], T]) -> T:
    with _lock:
        store = _load()
        result = fn(store)
        _persist(store)
        return result


def commit_store(fn: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
    with _lock:
        store = _load()
        if fn(store):
            _persist(store)
        return store


def read_store() -> dict[str, Any]:
    with _lock:
        return _load()
