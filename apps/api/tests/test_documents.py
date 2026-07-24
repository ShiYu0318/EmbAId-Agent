import math
from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from src.ingestion import runtime
from src.search.factory import set_search_backend
from tests.fakes import FakeEmbeddings, FakeSearchBackend


@pytest.fixture
def ingestion_env() -> Iterator[FakeSearchBackend]:
    backend = FakeSearchBackend()
    set_search_backend(backend)
    runtime.set_overrides(
        search_backend=backend, embeddings=FakeEmbeddings(), chat_model=None, storage=None
    )
    yield backend
    runtime.clear_overrides()
    set_search_backend(None)


async def _project(client: AsyncClient) -> str:
    response = await client.post("/v1/projects", json={"name": "KB"})
    return response.json()["id"]


async def _upload(client: AsyncClient, project_id: str, name: str, body: str) -> str:
    response = await client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": (name, body.encode(), "text/plain")},
    )
    return response.json()["document_id"]


async def test_rename_document_updates_title(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    document_id = await _upload(authed_client, project_id, "old.txt", "內容測試段落。")

    response = await authed_client.patch(f"/v1/documents/{document_id}", json={"title": "新名稱"})

    assert response.status_code == 200
    assert response.json()["title"] == "新名稱"

    detail = await authed_client.get(f"/v1/documents/{document_id}")
    assert detail.json()["title"] == "新名稱"


async def test_toggle_enabled_flag(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    document_id = await _upload(authed_client, project_id, "a.txt", "內容測試段落。")

    disabled = await authed_client.patch(f"/v1/documents/{document_id}", json={"enabled": False})
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False

    listing = await authed_client.get(f"/v1/projects/{project_id}/documents")
    assert listing.json()[0]["enabled"] is False

    enabled = await authed_client.patch(f"/v1/documents/{document_id}", json={"enabled": True})
    assert enabled.json()["enabled"] is True


async def test_document_payload_exposes_enabled_and_token_count(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    document_id = await _upload(
        authed_client, project_id, "policy.txt", "本公司提供三十天內免費退貨。" * 5
    )

    detail = await authed_client.get(f"/v1/documents/{document_id}")
    body = detail.json()

    assert body["enabled"] is True
    expected = math.ceil(sum(len(chunk["content"]) for chunk in body["chunks"]) / 4)
    assert body["token_count"] == expected
    assert body["token_count"] > 0

    listing = await authed_client.get(f"/v1/projects/{project_id}/documents")
    assert listing.json()[0]["token_count"] == expected


async def test_update_document_is_scoped_to_owner(
    authed_client: AsyncClient, client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    document_id = await _upload(authed_client, project_id, "c.txt", "私密內容。")

    other = await client.post(
        "/auth/signup", json={"email": "intruder2@example.com", "password": "sup3r-secret-pass"}
    )
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    response = await client.patch(
        f"/v1/documents/{document_id}", json={"title": "hijacked"}, headers=headers
    )
    assert response.status_code == 404
