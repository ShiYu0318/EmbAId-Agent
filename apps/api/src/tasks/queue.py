import logging
from typing import Any

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from redis.exceptions import RedisError

from ..config import get_settings

_pool: ArqRedis | None = None
_warned = False
logger = logging.getLogger(__name__)


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
    """Queue a job, or return None so the caller runs it inline.

    An unreachable Redis falls back to inline work instead of leaving uploads stuck in
    "pending" with no visible error, which is what a first-time setup usually hits.
    """
    global _warned
    try:
        pool = await get_pool()
    except (OSError, RedisError) as exc:
        if not _warned:
            logger.warning(
                "QUEUE_ENABLED is true but Redis is unreachable (%s); running jobs inline", exc
            )
            _warned = True
        return None
    if pool is None:
        return None
    result = await pool.enqueue_job(job, *args, **kwargs)
    return result.job_id if result else None
