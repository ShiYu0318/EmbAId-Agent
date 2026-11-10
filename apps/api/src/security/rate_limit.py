import logging
import time
import uuid
from collections import OrderedDict, deque
from collections.abc import Callable
from typing import Any

from ..config import get_settings

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60
MAX_BUCKETS = 50_000
MAX_KNOWN_LIMITS = 10_000


class SlidingWindowLimiter:
    """In-memory sliding window with a hard cap on how many identities it tracks."""

    def __init__(
        self,
        window_seconds: float = WINDOW_SECONDS,
        max_buckets: int = MAX_BUCKETS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.window_seconds = window_seconds
        self.max_buckets = max_buckets
        self._clock = clock
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._known_limits: OrderedDict[str, int] = OrderedDict()

    def __len__(self) -> int:
        return len(self._hits)

    def remember_limit(self, identity: str, limit: int) -> None:
        self._known_limits[identity] = limit
        self._known_limits.move_to_end(identity)
        while len(self._known_limits) > MAX_KNOWN_LIMITS:
            self._known_limits.popitem(last=False)

    def known_limit(self, identity: str) -> int | None:
        return self._known_limits.get(identity)

    def _prune(self, now: float) -> None:
        expired = [
            identity
            for identity, window in self._hits.items()
            if not window or now - window[-1] > self.window_seconds
        ]
        for identity in expired:
            del self._hits[identity]
        # Still full of live buckets: drop the least recently used ones.
        while len(self._hits) >= self.max_buckets:
            self._hits.popitem(last=False)

    def hit(self, identity: str, limit: int) -> int | None:
        """Record a request. Returns seconds to wait when the limit is exceeded."""
        now = self._clock()
        window = self._hits.get(identity)
        if window is None:
            if len(self._hits) >= self.max_buckets:
                self._prune(now)
            window = self._hits[identity] = deque()
        else:
            self._hits.move_to_end(identity)

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= limit:
            return int(self.window_seconds - (now - window[0])) + 1

        window.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()
        self._known_limits.clear()


limiter = SlidingWindowLimiter()

REDIS_TIMEOUT_SECONDS = 0.5
# After a Redis failure, requests are counted in memory for this long before trying again.
REDIS_RETRY_SECONDS = 30.0
KEY_PREFIX = "embaid:ratelimit:"

# One atomic step: drop hits that left the window, then either refuse or record this hit.
# Redis's own clock is used so replicas with drifting clocks agree on the window.
# Returns 0 when the request is allowed, otherwise the seconds to wait.
SLIDING_WINDOW_SCRIPT = """
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return math.floor((tonumber(oldest[2]) + window - now) / 1000) + 1
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window)
return 0
"""


class RedisSlidingWindow:
    """The same sliding window kept in Redis, shared by every API replica."""

    def __init__(self, client: Any, window_seconds: float = WINDOW_SECONDS) -> None:
        self._client = client
        self._window_ms = int(window_seconds * 1000)

    async def hit(self, identity: str, limit: int) -> int | None:
        wait = await self._client.eval(
            SLIDING_WINDOW_SCRIPT,
            1,
            f"{KEY_PREFIX}{identity}",
            self._window_ms,
            limit,
            uuid.uuid4().hex,
        )
        return int(wait) or None


class SharedLimiter:
    """Counts in Redis when configured, and in memory whenever Redis cannot answer.

    Losing Redis must not take the API down or switch rate limiting off, so a failure
    falls back to the per-process window and Redis is retried after a short pause.
    """

    def __init__(
        self,
        local: SlidingWindowLimiter,
        remote_factory: Callable[[], RedisSlidingWindow | None] | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.local = local
        self._remote_factory = remote_factory or _redis_window
        self._remote: RedisSlidingWindow | None = None
        self._clock = clock
        self._retry_at = 0.0

    def _backend(self) -> RedisSlidingWindow | None:
        if get_settings().rate_limit_backend != "redis" or self._clock() < self._retry_at:
            return None
        if self._remote is None:
            self._remote = self._remote_factory()
        return self._remote

    async def hit(self, identity: str, limit: int) -> int | None:
        """Record a request. Returns seconds to wait when the limit is exceeded."""
        try:
            remote = self._backend()
            if remote is not None:
                return await remote.hit(identity, limit)
        except Exception:
            self._retry_at = self._clock() + REDIS_RETRY_SECONDS
            logger.warning(
                "redis rate limiter unavailable; counting in memory for %.0fs",
                REDIS_RETRY_SECONDS,
                exc_info=True,
            )
        return self.local.hit(identity, limit)


def _redis_window() -> RedisSlidingWindow:
    from redis.asyncio import Redis

    client = Redis.from_url(
        get_settings().redis_url,
        socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
        socket_timeout=REDIS_TIMEOUT_SECONDS,
    )
    return RedisSlidingWindow(client)


def key_identity(raw_key: str) -> str:
    from .api_keys import hash_key

    return f"key:{hash_key(raw_key)[:32]}"
