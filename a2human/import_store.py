"""One-shot copy of a legacy ``store.json`` file into Postgres.

    python -m a2human.import_store data/store.json
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

from a2human.jsonutil import loads
from a2human.rules import create_seed
from a2human.store import update_store


def _read(path: Path) -> dict[str, Any]:
    data = loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit("store.json must be an object")
    store = create_seed()
    store["agents"] = list(data.get("agents") or [])
    store["tasks"] = list(data.get("tasks") or [])
    store["messages"] = list(data.get("messages") or [])
    return store


async def import_path(path: Path) -> None:
    incoming = _read(path)

    def merge(store: dict[str, Any]) -> int:
        known_agents = {agent["id"] for agent in store["agents"]}
        known_tasks = {task["id"] for task in store["tasks"]}
        known_messages = {message["id"] for message in store["messages"]}
        added = 0
        for agent in incoming["agents"]:
            if agent["id"] not in known_agents:
                store["agents"].append(agent)
                added += 1
        for task in reversed(incoming["tasks"]):
            if task["id"] not in known_tasks:
                store["tasks"].insert(0, task)
                added += 1
        for message in incoming["messages"]:
            if message["id"] not in known_messages:
                store["messages"].append(message)
                added += 1
        return added

    added = await update_store(merge)
    print(f"imported {added} rows from {path}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m a2human.import_store data/store.json")
    asyncio.run(import_path(Path(sys.argv[1])))


if __name__ == "__main__":
    main()
