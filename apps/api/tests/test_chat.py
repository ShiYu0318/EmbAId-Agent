import json

import pytest
from httpx import AsyncClient

from src.rag import pipeline
from src.search.base import IndexedChunk
from src.search.factory import set_search_backend
from tests.fakes import FakeChatModel, FakeEmbeddings, FakeSearchBackend


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        if not block.strip():
            continue
        event = None
        data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if event is not None:
            events.append((event, data))
    return events


@pytest.fixture
def backend() -> FakeSearchBackend:
    fake = FakeSearchBackend()
    set_search_backend(fake)
    yield fake
    set_search_backend(None)


@pytest.fixture
def stub_providers(monkeypatch: pytest.MonkeyPatch) -> FakeChatModel:
    chat_model = FakeChatModel()
    monkeypatch.setattr("src.api.routers.chat.build_chat_model", lambda *a, **k: chat_model)
    monkeypatch.setattr("src.api.routers.chat.build_embeddings", lambda *a, **k: FakeEmbeddings())
    return chat_model


async def _project_with_key(client: AsyncClient) -> tuple[str, str]:
    project = await client.post("/v1/projects", json={"name": "Docs", "chat_provider": "openai"})
    project_id = project.json()["id"]
    key = await client.post(
        f"/v1/projects/{project_id}/api-keys",
        json={"type": "publishable", "name": "widget"},
    )
    return project_id, key.json()["key"]


async def _seed_chunk(
    backend: FakeSearchBackend, authed_client: AsyncClient, project_id: str
) -> None:
    from sqlalchemy import select

    from src.db.models import Document, DocumentChunk
    from src.db.session import session_scope

    async with session_scope() as session:
        document = Document(project_id=project_id, title="退貨政策", status="indexed")
        session.add(document)
        await session.flush()
        chunk = DocumentChunk(
            document_id=document.id,
            project_id=project_id,
            content="本公司提供三十天內免費退貨服務。",
            ordinal=0,
        )
        session.add(chunk)
        await session.flush()
        await backend.upsert(
            [
                IndexedChunk(
                    chunk_id=chunk.id,
                    project_id=project_id,
                    document_id=document.id,
                    text=chunk.content,
                    embedding=FakeEmbeddings().embed_query(chunk.content),
                )
            ]
        )
        assert (await session.execute(select(Document))).scalars().first() is not None


async def test_chat_streams_answer_with_citations_and_trace(
    authed_client: AsyncClient, backend: FakeSearchBackend, stub_providers: FakeChatModel
) -> None:
    project_id, raw_key = await _project_with_key(authed_client)
    await _seed_chunk(backend, authed_client, project_id)

    response = await authed_client.post(
        "/v1/chat",
        json={"message": "請問退貨政策是什麼？"},
        headers={"X-API-Key": raw_key},
    )

    assert response.status_code == 200
    events = parse_sse(response.text)
    names = [name for name, _ in events]

    assert names[0] == "conversation"
    assert "token" in names
    assert names[-1] == "done"
    assert "citations" in names
    assert "trace" in names


async def test_chat_persists_messages_and_trace(
    authed_client: AsyncClient, backend: FakeSearchBackend, stub_providers: FakeChatModel
) -> None:
    project_id, raw_key = await _project_with_key(authed_client)
    await _seed_chunk(backend, authed_client, project_id)

    response = await authed_client.post(
        "/v1/chat",
        json={"message": "退貨要幾天？"},
        headers={"X-API-Key": raw_key},
    )
    events = dict(parse_sse(response.text))
    message_id = events["conversation"]["message_id"]

    from src.db.models import Message
    from src.db.session import session_scope

    async with session_scope() as session:
        stored = await session.get(Message, message_id)
        assert stored is not None
        assert stored.content
        assert "original_query" in stored.retrieval_trace


async def test_chat_rejects_unknown_conversation_from_other_project(
    authed_client: AsyncClient, backend: FakeSearchBackend, stub_providers: FakeChatModel
) -> None:
    project_id, raw_key = await _project_with_key(authed_client)
    await _seed_chunk(backend, authed_client, project_id)

    response = await authed_client.post(
        "/v1/chat",
        json={"message": "你好", "conversation_id": "conv_does_not_exist"},
        headers={"X-API-Key": raw_key},
    )

    assert response.status_code == 404


async def test_chat_requires_api_key(authed_client: AsyncClient) -> None:
    response = await authed_client.post("/v1/chat", json={"message": "hi"})

    assert response.status_code == 401


async def test_low_confidence_refuses_and_flags_question(
    authed_client: AsyncClient, backend: FakeSearchBackend, stub_providers: FakeChatModel
) -> None:
    project_id, raw_key = await _project_with_key(authed_client)
    backend.vector_results = []
    backend.lexical_results = []

    response = await authed_client.post(
        "/v1/chat",
        json={"message": "這個問題知識庫沒有答案"},
        headers={"X-API-Key": raw_key},
    )
    events = dict(parse_sse(response.text))

    assert events["done"]["answered"] is False
    assert events["trace"]["answered"] is False

    from sqlalchemy import select

    from src.db.models import FlaggedQuestion
    from src.db.session import session_scope

    async with session_scope() as session:
        result = await session.execute(
            select(FlaggedQuestion).where(FlaggedQuestion.project_id == project_id)
        )
        assert result.scalars().first() is not None


async def test_refusal_does_not_call_the_model(
    authed_client: AsyncClient, backend: FakeSearchBackend, stub_providers: FakeChatModel
) -> None:
    _, raw_key = await _project_with_key(authed_client)
    backend.vector_results = []
    backend.lexical_results = []

    await authed_client.post(
        "/v1/chat",
        json={"message": "知識庫查不到的問題"},
        headers={"X-API-Key": raw_key},
    )

    assert stub_providers.prompts == []


async def test_refusal_text_is_locale_aware() -> None:
    assert pipeline.refusal_text("zh-TW") != pipeline.refusal_text("en")
