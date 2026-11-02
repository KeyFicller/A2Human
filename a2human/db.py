"""One connection pool per process (and per event loop). No task data is cached here.

Gunicorn runs several workers. Each worker builds its own pool after fork.
Task truth lives in Postgres; Redis only carries wakeups, card cache, and rate limits.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

_engines: dict[int, AsyncEngine] = {}
_makers: dict[int, async_sessionmaker[AsyncSession]] = {}
_redis: dict[int, Any] = {}


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set. The market stores tasks in Postgres.")
    return url


def redis_url() -> str:
    url = os.environ.get("REDIS_URL", "").strip()
    if not url:
        raise RuntimeError("REDIS_URL is not set. Workers share wakeups and card cache through Redis.")
    return url


def _loop_id() -> int:
    return id(asyncio.get_running_loop())


def session_maker() -> async_sessionmaker[AsyncSession]:
    loop_id = _loop_id()
    maker = _makers.get(loop_id)
    if maker is None:
        engine = create_async_engine(
            database_url(),
            pool_size=int(os.environ.get("A2HUMAN_POOL_SIZE", "5")),
            max_overflow=int(os.environ.get("A2HUMAN_POOL_OVERFLOW", "5")),
            pool_pre_ping=True,
        )
        maker = async_sessionmaker(engine, expire_on_commit=False)
        _engines[loop_id] = engine
        _makers[loop_id] = maker
    return maker


def redis_client():
    import redis.asyncio as redis

    loop_id = _loop_id()
    client = _redis.get(loop_id)
    if client is None:
        client = redis.from_url(redis_url(), decode_responses=True)
        _redis[loop_id] = client
    return client


async def shutdown_resources() -> None:
    loop_id = _loop_id()
    engine = _engines.pop(loop_id, None)
    _makers.pop(loop_id, None)
    client = _redis.pop(loop_id, None)
    if client is not None:
        await client.aclose()
    if engine is not None:
        await engine.dispose()
