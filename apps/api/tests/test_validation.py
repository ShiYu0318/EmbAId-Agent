import pytest
from httpx import AsyncClient

from src.api import validation


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://Shop.Example.com/", "https://shop.example.com"),
        ("https://example.com:443", "https://example.com"),
        ("http://localhost:3000", "http://localhost:3000"),
        ("com.example.app", "com.example.app"),
    ],
)
def test_allowed_origin_normalises(raw: str, expected: str) -> None:
    assert validation.allowed_origin(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["*", "https://*.example.com", "https://example.com/path", "ftp://example.com", "a b", ""],
)
def test_allowed_origin_rejects(raw: str) -> None:
    with pytest.raises(ValueError):
        validation.allowed_origin(raw)


async def _project(client: AsyncClient) -> str:
    return (await client.post("/v1/projects", json={"name": "KB"})).json()["id"]


@pytest.mark.parametrize(
    "patch",
    [
        {"bot_avatar_url": "javascript:alert(1)"},
        {"bot_avatar_url": "data:text/html,<script>alert(1)</script>"},
        {"accent_color": "red;background:url(https://evil.example.org)"},
        {"suggested_questions": ["x" * 201]},
    ],
)
async def test_widget_config_rejects_unsafe_values(
    authed_client: AsyncClient, patch: dict[str, object]
) -> None:
    project_id = await _project(authed_client)
    response = await authed_client.put(f"/v1/projects/{project_id}/widget-config", json=patch)
    assert response.status_code == 422


async def test_widget_config_accepts_safe_values(authed_client: AsyncClient) -> None:
    project_id = await _project(authed_client)
    response = await authed_client.put(
        f"/v1/projects/{project_id}/widget-config",
        json={"bot_avatar_url": "https://cdn.example.com/a.png", "accent_color": "#FF8800"},
    )
    assert response.status_code == 200
    assert response.json()["accent_color"] == "#ff8800"


async def test_system_prompt_length_is_capped(authed_client: AsyncClient) -> None:
    response = await authed_client.post(
        "/v1/projects", json={"name": "KB", "system_prompt": "x" * 8001}
    )
    assert response.status_code == 422


async def test_api_key_origins_are_normalised_and_validated(authed_client: AsyncClient) -> None:
    project_id = await _project(authed_client)
    created = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys",
        json={"type": "publishable", "allowed_origins": ["https://Shop.Example.com/"]},
    )
    assert created.json()["allowed_origins"] == ["https://shop.example.com"]

    rejected = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys",
        json={"type": "publishable", "allowed_origins": ["https://*.example.com"]},
    )
    assert rejected.status_code == 422
