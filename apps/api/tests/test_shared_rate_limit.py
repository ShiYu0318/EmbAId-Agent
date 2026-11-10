import pytest

from src.config import get_settings
from src.security.rate_limit import (
    KEY_PREFIX,
    RedisSlidingWindow,
    SharedLimiter,
    SlidingWindowLimiter,
)

fakeredis = pytest.importorskip("fakeredis")
pytest.importorskip("lupa")


@pytest.fixture
def redis_backend(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RATE_LIMIT_BACKEND", "redis")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def test_redis_window_refuses_past_the_limit_and_expires_its_key() -> None:
    client = fakeredis.FakeAsyncRedis()
    window = RedisSlidingWindow(client, window_seconds=60)

    assert await window.hit("key:abc", 2) is None
    assert await window.hit("key:abc", 2) is None
    wait = await window.hit("key:abc", 2)

    assert wait is not None and 1 <= wait <= 61
    assert await client.zcard(f"{KEY_PREFIX}key:abc") == 2
    assert 0 < await client.pttl(f"{KEY_PREFIX}key:abc") <= 60_000
    assert await window.hit("key:other", 2) is None


async def test_replicas_share_one_window(redis_backend: None) -> None:
    server = fakeredis.FakeServer()

    def replica() -> SharedLimiter:
        client = fakeredis.FakeAsyncRedis(server=server)
        return SharedLimiter(SlidingWindowLimiter(), lambda: RedisSlidingWindow(client))

    first, second = replica(), replica()

    assert await first.hit("ip:203.0.113.9", 2) is None
    assert await second.hit("ip:203.0.113.9", 2) is None
    assert await first.hit("ip:203.0.113.9", 2) is not None
    assert await second.hit("ip:203.0.113.9", 2) is not None


async def test_falls_back_to_memory_while_redis_is_down(redis_backend: None) -> None:
    calls = 0
    now = [0.0]

    class Broken:
        async def hit(self, identity: str, limit: int) -> int | None:
            nonlocal calls
            calls += 1
            raise ConnectionError("redis is down")

    shared = SharedLimiter(SlidingWindowLimiter(), lambda: Broken(), clock=lambda: now[0])

    assert await shared.hit("key:abc", 1) is None
    assert await shared.hit("key:abc", 1) is not None  # still limited, in memory
    assert calls == 1  # redis is left alone during the pause

    now[0] = 31.0
    await shared.hit("key:other", 1)
    assert calls == 2


async def test_memory_backend_never_touches_redis() -> None:
    def factory() -> RedisSlidingWindow:
        raise AssertionError("redis must not be used")

    shared = SharedLimiter(SlidingWindowLimiter(), factory)

    assert await shared.hit("key:abc", 1) is None
    assert await shared.hit("key:abc", 1) is not None
