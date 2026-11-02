"""Postgres is the market. ``update_store`` is the only write path for HTTP.

The function still receives the same dict the rules use. The commit locks the
rows it changed and retries when another worker won the version check.
Nothing about a task is kept in this process between requests.
"""

from __future__ import annotations

from typing import Any, Callable, TypeVar

from a2human.bus import notify
from a2human.db import session_maker
from a2human.repository import Conflict, apply_changes, load_market, public_copy

T = TypeVar("T")


async def read_store() -> dict[str, Any]:
    maker = session_maker()
    async with maker() as session:
        return await load_market(session)


async def update_store(fn: Callable[[dict[str, Any]], T]) -> T:
    maker = session_maker()
    last: Exception | None = None
    for _attempt in range(8):
        try:
            async with maker() as session:
                async with session.begin():
                    store = await load_market(session)
                    result = fn(store)
                    changed = await apply_changes(session, store)
            await notify(changed, bool(changed))
            return result
        except Conflict as error:
            last = error
            continue
    raise RuntimeError("market write lost a version race") from last


async def commit_store(fn: Callable[[dict[str, Any]], bool]) -> dict[str, Any]:
    """Run ``fn`` and write only when it reports a change. Returns the market afterwards."""
    holder: dict[str, Any] = {}

    def run(store: dict[str, Any]) -> dict[str, Any]:
        holder["store"] = store
        if not fn(store):
            store["_skip_save"] = True
        return store

    await update_store(run)
    return holder["store"]


async def persist_outside(store: dict[str, Any]) -> None:
    """Commit a dict that tests have been mutating by hand."""
    versions = _copy_meta(store, "_versions")
    seqs = _copy_meta(store, "_seq")
    loaded = store.get("_loaded")
    try:
        maker = session_maker()
        async with maker() as session:
            async with session.begin():
                changed = await apply_changes(session, store)
        await notify(changed, bool(changed))
    except Exception:
        store["_versions"] = versions
        store["_seq"] = seqs
        store["_loaded"] = loaded
        raise


def _copy_meta(store: dict[str, Any], key: str) -> dict[str, Any]:
    raw = store.get(key) or {}
    return {name: dict(values) for name, values in raw.items()} if raw and isinstance(next(iter(raw.values()), None), dict) else dict(raw)


def same_market(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return public_copy(left) == public_copy(right)
