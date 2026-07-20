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


async def test_upload_indexes_document_and_chunks(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={
            "file": (
                "policy.txt",
                "本公司提供三十天內免費退貨。退貨需保持商品完整。".encode(),
                "text/plain",
            )
        },
    )

    assert response.status_code == 201
    document_id = response.json()["document_id"]

    detail = await authed_client.get(f"/v1/documents/{document_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "ready"
    assert body["chunk_count"] > 0
    assert len(ingestion_env.chunks) == body["chunk_count"]


async def test_upload_rejects_empty_file(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": ("empty.txt", b"", "text/plain")},
    )

    assert response.status_code == 400


async def test_freshly_indexed_document_is_not_stale(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": ("a.txt", "內容測試段落。".encode(), "text/plain")},
    )

    listing = await authed_client.get(f"/v1/projects/{project_id}/documents")

    assert listing.json()[0]["is_stale"] is False


async def test_aged_document_is_stale_until_verified(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    from datetime import UTC, datetime, timedelta

    from src.db.models import Document
    from src.db.session import session_scope

    project_id = await _project(authed_client)
    upload = await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": ("a.txt", "內容測試段落。".encode(), "text/plain")},
    )
    document_id = upload.json()["document_id"]

    async with session_scope() as session:
        document = await session.get(Document, document_id)
        assert document is not None
        document.last_verified_at = datetime.now(UTC) - timedelta(days=400)

    listing = await authed_client.get(f"/v1/projects/{project_id}/documents")
    assert listing.json()[0]["is_stale"] is True

    stale_only = await authed_client.get(
        f"/v1/projects/{project_id}/documents", params={"stale_only": True}
    )
    assert len(stale_only.json()) == 1

    verified = await authed_client.post(f"/v1/documents/{document_id}/verify")
    assert verified.status_code == 200
    assert verified.json()["is_stale"] is False


async def test_delete_document_removes_index_entries(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    upload = await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": ("b.txt", "另一份文件的內容。".encode(), "text/plain")},
    )
    document_id = upload.json()["document_id"]
    assert ingestion_env.chunks

    response = await authed_client.delete(f"/v1/documents/{document_id}")

    assert response.status_code == 204
    assert ingestion_env.chunks == {}


async def test_create_url_source_requires_url(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/sources", json={"type": "url_crawl", "config": {}}
    )

    assert response.status_code == 400


async def test_source_config_secrets_are_redacted(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/sources",
        json={"type": "notion", "config": {"token": "secret-token-value"}},
    )

    assert response.status_code == 201
    assert response.json()["config"]["token"] == "***"


async def test_documents_are_scoped_to_owner(
    authed_client: AsyncClient, client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id = await _project(authed_client)
    upload = await authed_client.post(
        f"/v1/projects/{project_id}/documents/upload",
        files={"file": ("c.txt", "私密內容。".encode(), "text/plain")},
    )
    document_id = upload.json()["document_id"]

    other = await client.post(
        "/auth/signup", json={"email": "intruder@example.com", "password": "sup3r-secret-pass"}
    )
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    response = await client.get(f"/v1/documents/{document_id}", headers=headers)
    assert response.status_code == 404
