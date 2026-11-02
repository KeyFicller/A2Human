"""Real Postgres and Redis for the whole suite.

Domain tests still pass a dict around. A commit hook writes that dict in the
same transaction path the API uses, then reads it back.
"""

from __future__ import annotations

import asyncio
import os
import threading

os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")

from a2human.jsonutil import dumps
from a2human.repository import public_copy
from a2human.rules import create_seed as _plain_seed
import a2human.rules as rules_module


class _Loop:
    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run, name="market-db", daemon=True)
        self.thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result()


LOOP = _Loop()


def _digest(store: dict) -> str:
    return dumps(public_copy(store))


async def _flush(store: dict) -> None:
    from a2human.store import persist_outside, read_store, same_market

    await persist_outside(store)
    loaded = await read_store()
    if not same_market(loaded, store):
        raise AssertionError(f"postgres round trip mismatch\nmemory={public_copy(store)}\ndb={public_copy(loaded)}")


def _tracked_seed() -> dict:
    store = _plain_seed()
    store["_loaded"] = {"agents": [], "tasks": [], "messages": []}
    store["_versions"] = {"agents": {}, "tasks": {}, "messages": {}}
    store["_seq"] = {"agents": {}, "tasks": {}, "messages": {}}
    store["_hash"] = None

    def hook() -> None:
        digest = _digest(store)
        if digest == store.get("_hash"):
            return
        LOOP.run(_flush(store))
        store["_hash"] = _digest(store)

    store["_flush"] = hook
    return store


rules_module.create_seed = _tracked_seed


def pytest_configure(config) -> None:
    # Test modules import create_seed by name. Point those bindings at the tracked seed
    # if they were imported before this patch (pytest still loads conftest first).
    rules_module.create_seed = _tracked_seed


def _asyncpg_url(url: str) -> str:
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg2://") :]
    if url.startswith("postgresql+psycopg://"):
        return "postgresql+asyncpg://" + url[len("postgresql+psycopg://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def pytest_sessionstart(session) -> None:
    from testcontainers.postgres import PostgresContainer
    from testcontainers.redis import RedisContainer

    postgres = PostgresContainer("postgres:16-alpine")
    redis = RedisContainer("redis:7-alpine")
    postgres.start()
    redis.start()
    session.config._a2human_containers = (postgres, redis)
    os.environ["DATABASE_URL"] = _asyncpg_url(postgres.get_connection_url())
    host = redis.get_container_host_ip()
    port = redis.get_exposed_port(6379)
    os.environ["REDIS_URL"] = f"redis://{host}:{port}/0"
    from a2human.migrate import upgrade

    upgrade()


def pytest_sessionfinish(session, exitstatus) -> None:
    containers = getattr(session.config, "_a2human_containers", None)
    if not containers:
        return
    postgres, redis = containers
    redis.stop()
    postgres.stop()


async def _truncate() -> None:
    from sqlalchemy import text

    from a2human.bus import flush_redis
    from a2human.db import session_maker

    maker = session_maker()
    async with maker() as session:
        async with session.begin():
            await session.execute(text("TRUNCATE messages, skills, tasks, agents RESTART IDENTITY CASCADE"))
    await flush_redis()


def pytest_runtest_setup(item) -> None:
    if os.environ.get("DATABASE_URL"):
        LOOP.run(_truncate())
