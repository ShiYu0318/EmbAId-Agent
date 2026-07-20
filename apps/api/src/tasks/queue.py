from typing import Any

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from ..config import get_settings

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def get_pool() -> ArqRedis | None:
    global _pool
    if not get_settings().queue_enabled:
        return None
    if _pool is None:
        _pool = await create_pool(redis_settings())
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
    _pool = None


async def enqueue(job: str, *args: Any, **kwargs: Any) -> str | None:
    pool = await get_pool()
    if pool is None:
        return None
    result = await pool.enqueue_job(job, *args, **kwargs)
    return result.job_id if result else None
