import pytest
from httpx import AsyncClient

from src.tasks import queue


async def test_widget_bundle_is_served_from_the_api(
    authed_client: AsyncClient, tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bundle = tmp_path / "widget.js"
    bundle.write_text("console.log('widget')")
    monkeypatch.setattr("src.main.widget_bundle", lambda: bundle)

    response = await authed_client.get("/widget.js")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/javascript")
    assert "widget" in response.text


async def test_missing_widget_bundle_explains_how_to_build_it(
    authed_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("src.main.widget_bundle", lambda: None)
    response = await authed_client.get("/widget.js")
    assert response.status_code == 404
    assert "pnpm" in response.json()["detail"]


async def test_unreachable_redis_falls_back_to_inline_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken_pool():
        raise ConnectionRefusedError("redis is down")

    monkeypatch.setattr(queue, "get_pool", broken_pool)
    assert await queue.enqueue("ingest_document", "doc_1") is None


async def test_widget_endpoints_accept_any_website(authed_client: AsyncClient) -> None:
    preflight = await authed_client.options(
        "/v1/chat",
        headers={
            "Origin": "https://shop.example.org",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-api-key",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "*"


async def test_dashboard_api_stays_limited_to_configured_origins(
    authed_client: AsyncClient,
) -> None:
    preflight = await authed_client.options(
        "/v1/projects",
        headers={"Origin": "https://evil.example.org", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in preflight.headers
