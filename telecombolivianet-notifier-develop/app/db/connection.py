import asyncio
import os
import asyncpg
import structlog

log = structlog.get_logger(__name__)

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    global _pool
    async with _pool_lock:
        if _pool is None:
            dsn = os.environ["DATABASE_URL"]
            _pool = await asyncpg.create_pool(
                dsn,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            log.info("db.pool_created")
    return _pool


async def close_pool() -> None:
    global _pool
    async with _pool_lock:
        if _pool:
            await _pool.close()
            _pool = None
            log.info("db.pool_closed")
