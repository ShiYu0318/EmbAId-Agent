from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from src.db.models import Conversation, FlaggedQuestion, Message
from src.db.session import session_scope
from src.ingestion import runtime
from src.search.factory import set_search_backend
from tests.fakes import FakeEmbeddings, FakeSearchBackend


@pytest.fixture
def ingestion_env() -> Iterator[FakeSearchBackend]:
    backend = FakeSearchBackend()
    set_search_backend(backend)
    runtime.set_overrides(search_backend=backend, embeddings=FakeEmbeddings(), chat_model=None)
    yield backend
    runtime.clear_overrides()
    set_search_backend(None)


async def _project_with_keys(client: AsyncClient) -> tuple[str, str, str]:
    project_id = (await client.post("/v1/projects", json={"name": "Support"})).json()["id"]
    publishable = (
        await client.post(
            f"/v1/projects/{project_id}/api-keys", json={"type": "publishable", "name": "web"}
        )
    ).json()["key"]
    secret = (
        await client.post(
            f"/v1/projects/{project_id}/api-keys", json={"type": "secret", "name": "server"}
        )
    ).json()["key"]
    return project_id, publishable, secret


async def _seed_answer(project_id: str, *, answered: bool = True) -> str:
    async with session_scope() as session:
        conversation = Conversation(project_id=project_id, channel="widget")
        session.add(conversation)
        await session.flush()
        message = Message(
            conversation_id=conversation.id,
            role="assistant",
            content="這是回答。",
            confidence_score=0.82,
            retrieval_trace={"original_query": "問題", "answered": answered, "cache_hit": False},
        )
        session.add(message)
        await session.flush()
        return message.id


async def test_feedback_accepted_from_publishable_key(authed_client: AsyncClient) -> None:
    project_id, publishable, _ = await _project_with_keys(authed_client)
    message_id = await _seed_answer(project_id)

    response = await authed_client.post(
        f"/v1/messages/{message_id}/feedback",
        json={"value": "up"},
        headers={"X-API-Key": publishable},
    )

    assert response.status_code == 200
    assert response.json()["feedback"] == "up"


async def test_feedback_cannot_cross_projects(authed_client: AsyncClient) -> None:
    first_id, _, _ = await _project_with_keys(authed_client)
    _, other_publishable, _ = await _project_with_keys(authed_client)
    message_id = await _seed_answer(first_id)

    response = await authed_client.post(
        f"/v1/messages/{message_id}/feedback",
        json={"value": "down"},
        headers={"X-API-Key": other_publishable},
    )

    assert response.status_code == 404


async def test_trace_readable_with_secret_key(authed_client: AsyncClient) -> None:
    project_id, _, secret = await _project_with_keys(authed_client)
    message_id = await _seed_answer(project_id)

    response = await authed_client.get(
        f"/v1/messages/{message_id}/trace", headers={"X-API-Key": secret}
    )

    assert response.status_code == 200
    assert response.json()["trace"]["original_query"] == "問題"


async def test_trace_rejects_publishable_key(authed_client: AsyncClient) -> None:
    project_id, publishable, _ = await _project_with_keys(authed_client)
    message_id = await _seed_answer(project_id)

    response = await authed_client.get(
        f"/v1/messages/{message_id}/trace", headers={"X-API-Key": publishable}
    )

    assert response.status_code == 403


async def test_trace_secret_key_cannot_read_other_project(authed_client: AsyncClient) -> None:
    first_id, _, _ = await _project_with_keys(authed_client)
    _, _, other_secret = await _project_with_keys(authed_client)
    message_id = await _seed_answer(first_id)

    response = await authed_client.get(
        f"/v1/messages/{message_id}/trace", headers={"X-API-Key": other_secret}
    )

    assert response.status_code == 404


async def test_trace_readable_by_owner_session(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)
    message_id = await _seed_answer(project_id)

    response = await authed_client.get(f"/v1/messages/{message_id}/trace")

    assert response.status_code == 200


async def test_analytics_reports_refusals_and_satisfaction(authed_client: AsyncClient) -> None:
    project_id, publishable, _ = await _project_with_keys(authed_client)
    answered = await _seed_answer(project_id, answered=True)
    await _seed_answer(project_id, answered=False)

    await authed_client.post(
        f"/v1/messages/{answered}/feedback",
        json={"value": "up"},
        headers={"X-API-Key": publishable},
    )

    response = await authed_client.get(f"/v1/projects/{project_id}/analytics")

    assert response.status_code == 200
    body = response.json()
    assert body["answers"] == 2
    assert body["refusals"] == 1
    assert body["refusal_rate"] == 0.5
    assert body["thumbs_up"] == 1
    assert body["satisfaction_rate"] == 1.0
    assert len(body["conversations_by_day"]) == body["range_days"] + 1


async def test_knowledge_gap_listing_ranks_by_occurrence(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    async with session_scope() as session:
        session.add(
            FlaggedQuestion(
                project_id=project_id,
                question_text="rare",
                normalized_text="rare",
                occurrence_count=1,
            )
        )
        session.add(
            FlaggedQuestion(
                project_id=project_id,
                question_text="common",
                normalized_text="common",
                occurrence_count=9,
            )
        )

    response = await authed_client.get(f"/v1/projects/{project_id}/knowledge-gaps")

    assert [gap["question_text"] for gap in response.json()] == ["common", "rare"]


async def test_gap_approval_creates_indexable_document(
    authed_client: AsyncClient, ingestion_env: FakeSearchBackend
) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    async with session_scope() as session:
        gap = FlaggedQuestion(
            project_id=project_id,
            question_text="你們有提供退貨嗎？",
            normalized_text="你們有提供退貨嗎？",
        )
        session.add(gap)
        await session.flush()
        gap_id = gap.id

    response = await authed_client.post(
        f"/v1/knowledge-gaps/{gap_id}/approve",
        json={"answer": "是的，提供三十天內退貨。"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "resolved"

    document_id = response.json()["document_id"]
    detail = await authed_client.get(f"/v1/documents/{document_id}")
    assert detail.json()["status"] == "ready"
    assert ingestion_env.chunks


async def test_gap_approval_requires_an_answer(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    async with session_scope() as session:
        gap = FlaggedQuestion(
            project_id=project_id, question_text="無解", normalized_text="無解"
        )
        session.add(gap)
        await session.flush()
        gap_id = gap.id

    response = await authed_client.post(f"/v1/knowledge-gaps/{gap_id}/approve", json={})

    assert response.status_code == 400


async def test_webhook_secret_returned_once(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    created = await authed_client.post(
        f"/v1/projects/{project_id}/webhooks",
        json={"url": "https://example.com/hook", "subscribed_events": ["document.indexed"]},
    )

    assert created.status_code == 201
    assert created.json()["secret"]

    listing = await authed_client.get(f"/v1/projects/{project_id}/webhooks")
    assert "secret" not in listing.json()[0]


async def test_webhook_rejects_unknown_event(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/webhooks",
        json={"url": "https://example.com/hook", "subscribed_events": ["not.an.event"]},
    )

    assert response.status_code == 400


async def test_webhook_rejects_relative_url(authed_client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/webhooks",
        json={"url": "/hook", "subscribed_events": []},
    )

    assert response.status_code == 400


async def test_webhooks_scoped_to_owner(authed_client: AsyncClient, client: AsyncClient) -> None:
    project_id, _, _ = await _project_with_keys(authed_client)
    created = await authed_client.post(
        f"/v1/projects/{project_id}/webhooks",
        json={"url": "https://example.com/hook", "subscribed_events": []},
    )
    endpoint_id = created.json()["id"]

    other = await client.post(
        "/auth/signup", json={"email": "other@example.com", "password": "sup3r-secret-pass"}
    )
    headers = {"Authorization": f"Bearer {other.json()['access_token']}"}

    response = await client.patch(
        f"/v1/webhooks/{endpoint_id}", json={"active": False}, headers=headers
    )
    assert response.status_code == 404
