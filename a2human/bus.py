"""Redis fan-out. Workers do not keep task state in memory.

A finished score or a delivered artifact is published on ``task:<id>``. Whoever
is waiting in ``tasks/result`` or the 15 second MCP fallback wakes up and reads
Postgres. Agent cards are cached for a few seconds and dropped whenever a write
bumps ``cardver``. Rate limits are a fixed window per client address.
"""

from __future__ import annotations

import asyncio
import os
import time

from a2human.db import redis_client


async def notify(task_ids: list[str], changed: bool) -> None:
    if not changed:
        return
    redis = redis_client()
    pipe = redis.pipeline()
    for task_id in task_ids:
        pipe.publish(f"task:{task_id}", "1")
    pipe.incr("cardver")
    await pipe.execute()


async def wait_for_task(task_id: str, timeout_ms: float) -> None:
    """Block until another worker publishes, or until the poll interval is over."""
    if timeout_ms <= 0:
        return
    redis = redis_client()
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"task:{task_id}")
    try:
        deadline = time.monotonic() + (timeout_ms / 1000)
        while time.monotonic() < deadline:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.25)
            if message and message.get("type") == "message":
                return
    finally:
        await pubsub.unsubscribe(f"task:{task_id}")
        await pubsub.aclose()


async def cached_card(origin: str, agent_id: str | None) -> str | None:
    redis = redis_client()
    version = await redis.get("cardver") or "0"
    return await redis.get(f"card:{version}:{origin}:{agent_id or '*'}")


async def store_card(origin: str, agent_id: str | None, body: str) -> None:
    redis = redis_client()
    version = await redis.get("cardver") or "0"
    await redis.set(f"card:{version}:{origin}:{agent_id or '*'}", body, ex=5)


def _limit() -> tuple[int, int]:
    # High default so a normal load test measures the workers, not the limiter.
    return int(os.environ.get("A2HUMAN_RATE_LIMIT", "20000")), int(os.environ.get("A2HUMAN_RATE_WINDOW", "10"))


async def allow(client: str) -> bool:
    limit, window = _limit()
    if limit <= 0:
        return True
    redis = redis_client()
    bucket = int(time.time()) // window
    key = f"rate:{client}:{bucket}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window)
    return count <= limit


async def ping() -> bool:
    try:
        return bool(await redis_client().ping())
    except Exception:
        return False


async def flush_redis() -> None:
    await redis_client().flushdb()
    # Give a subscriber loop a chance to notice a closed test.
    await asyncio.sleep(0)
