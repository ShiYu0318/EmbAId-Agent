import pytest
from httpx import AsyncClient

from src.db.models import FlaggedQuestion
from src.db.session import session_scope
from tests.fakes import FakeChatModel


async def _gap(client: AsyncClient, locale: str) -> str:
    project = await client.post(
        "/v1/projects", json={"name": "KB", "chat_provider": "openai", "default_locale": locale}
    )
    async with session_scope() as session:
        gap = FlaggedQuestion(
            project_id=project.json()["id"],
            question_text="How do refunds work?",
            normalized_text="how do refunds work",
        )
        session.add(gap)
        await session.commit()
        return gap.id


@pytest.mark.parametrize(
    ("locale", "expected"), [("en", "Answer in English"), ("zh-TW", "繁體中文")]
)
async def test_draft_answer_follows_the_project_locale(
    authed_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, locale: str, expected: str
) -> None:
    model = FakeChatModel(reply="draft")
    monkeypatch.setattr(
        "src.api.routers.knowledge_gaps.build_chat_model", lambda *a, **k: model
    )
    gap_id = await _gap(authed_client, locale)

    response = await authed_client.post(f"/v1/knowledge-gaps/{gap_id}/draft-answer")

    assert response.status_code == 200
    assert expected in model.prompts[0][0].content
