from httpx import AsyncClient


async def test_security_headers_present(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


async def test_hsts_absent_outside_production(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert "Strict-Transport-Security" not in response.headers


async def test_rate_limit_blocks_repeated_key_use(client: AsyncClient) -> None:
    headers = {"X-API-Key": "pub_ratelimit_probe_key"}
    statuses = set()

    for _ in range(25):
        response = await client.get("/health", headers=headers)
        statuses.add(response.status_code)

    assert 429 in statuses


async def test_rate_limited_response_sets_retry_after(client: AsyncClient) -> None:
    headers = {"X-API-Key": "pub_retry_after_probe_key"}

    last = None
    for _ in range(25):
        last = await client.get("/health", headers=headers)

    assert last is not None
    if last.status_code == 429:
        assert int(last.headers["Retry-After"]) > 0


async def test_unauthenticated_health_check_not_rate_limited(client: AsyncClient) -> None:
    for _ in range(30):
        response = await client.get("/health")

    assert response.status_code == 200


def test_limiter_prunes_idle_buckets_when_full() -> None:
    from src.security.rate_limit import SlidingWindowLimiter

    now = [0.0]
    limiter = SlidingWindowLimiter(max_buckets=100, clock=lambda: now[0])
    for index in range(100):
        limiter.hit(f"id-{index}", 5)
    now[0] = 120.0
    limiter.hit("fresh", 5)

    assert len(limiter) == 1


def test_limiter_never_exceeds_bucket_cap() -> None:
    from src.security.rate_limit import SlidingWindowLimiter

    limiter = SlidingWindowLimiter(max_buckets=50)
    for index in range(500):
        limiter.hit(f"id-{index}", 5)

    assert len(limiter) <= 50


async def test_random_keys_share_the_address_ceiling(
    client: AsyncClient, monkeypatch: object
) -> None:
    from src.config import get_settings

    monkeypatch.setenv("RATE_LIMIT_PER_IP", "10")  # type: ignore[attr-defined]
    get_settings.cache_clear()

    statuses = [
        (await client.get("/health", headers={"X-API-Key": f"pub_random_{index}"})).status_code
        for index in range(15)
    ]

    assert statuses.count(429) == 5


async def test_per_key_limit_is_enforced(authed_client: AsyncClient) -> None:
    project = await authed_client.post("/v1/projects", json={"name": "KB"})
    created = await authed_client.post(
        f"/v1/projects/{project.json()['id']}/api-keys",
        json={"type": "publishable", "name": "tight", "rate_limit_per_minute": 3},
    )
    assert created.status_code == 201, created.text
    headers = {"X-API-Key": created.json()["key"]}

    statuses = [
        (await authed_client.get("/v1/widget-config", headers=headers)).status_code
        for _ in range(6)
    ]

    assert statuses[:3] == [200, 200, 200]
    assert statuses[3:] == [429, 429, 429]
