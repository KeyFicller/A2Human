"""Apply Alembic migrations. The container runs this once before workers start."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from a2human.db import database_url


def _config() -> Config:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url())
    return config


def upgrade() -> None:
    command.upgrade(_config(), "head")


async def wait_for_services(attempts: int = 60) -> None:
    from a2human.db import redis_client

    last: Exception | None = None
    for _ in range(attempts):
        try:
            engine = create_async_engine(database_url())
            async with engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
            await engine.dispose()
            if await redis_client().ping():
                return
        except Exception as error:
            last = error
            await asyncio.sleep(0.5)
    raise RuntimeError("postgres or redis is not ready") from last


def main() -> None:
    os.chdir(Path(__file__).resolve().parents[1])
    asyncio.run(wait_for_services())
    upgrade()


if __name__ == "__main__":
    main()
