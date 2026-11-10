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


async def test_api_responses_carry_a_locked_down_csp(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert "camera=()" in response.headers["Permissions-Policy"]


async def test_docs_page_is_not_broken_by_the_csp(client: AsyncClient) -> None:
    response = await client.get("/docs")

    assert response.status_code == 200
    assert "Content-Security-Policy" not in response.headers


async def test_auth_responses_are_not_cached(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/signup", json={"email": "cache@example.com", "password": "sup3r-secret-pass"}
    )

    assert response.headers["Cache-Control"] == "no-store"


async def test_public_health_reveals_no_configuration(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.json() == {"status": "ok"}


async def test_system_status_requires_authentication(
    client: AsyncClient, authed_client: AsyncClient
) -> None:
    body = (await authed_client.get("/v1/system/status")).json()
    assert {"providers", "embeddings", "search_backend"} <= body.keys()

    del client.headers["Authorization"]
    assert (await client.get("/v1/system/status")).status_code == 401


async def test_docs_are_disabled_in_production(monkeypatch: object) -> None:
    from httpx import ASGITransport

    from src.config import get_settings
    from src.main import create_app

    monkeypatch.setenv("ENVIRONMENT", "production")  # type: ignore[attr-defined]
    get_settings.cache_clear()
    transport = ASGITransport(app=create_app())

    async with AsyncClient(transport=transport, base_url="http://test") as production:
        assert (await production.get("/docs")).status_code == 404
        assert (await production.get("/openapi.json")).status_code == 404
        assert (await production.get("/health")).status_code == 200
