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
