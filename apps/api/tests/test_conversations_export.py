import csv
import io

from httpx import AsyncClient

from src.api.routers.conversations import csv_safe
from src.db.models import Conversation, Message
from src.db.session import session_scope


def test_csv_safe_neutralises_formula_prefixes() -> None:
    for value in ("=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"):
        assert csv_safe(value) == f"'{value}"
    assert csv_safe("plain text") == "plain text"
    assert csv_safe(0.82) == 0.82


async def test_export_escapes_visitor_formulas(authed_client: AsyncClient) -> None:
    project = await authed_client.post("/v1/projects", json={"name": "KB"})
    project_id = project.json()["id"]
    payload = '=HYPERLINK("https://evil.example.org","click")'

    async with session_scope() as session:
        conversation = Conversation(project_id=project_id, channel="widget", visitor_id="@evil")
        session.add(conversation)
        await session.flush()
        session.add(Message(conversation_id=conversation.id, role="user", content=payload))

    response = await authed_client.get(
        "/v1/conversations/export", params={"project_id": project_id}
    )

    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows[0]["content"] == f"'{payload}"
    assert rows[0]["visitor_id"] == "'@evil"
