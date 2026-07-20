from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import ApiKey, Conversation, Message, Organization, Project
from ...security import api_keys, tokens
from ..deps import KeyDep, SessionDep
from ..errors import Forbidden, NotFound, Unauthorized

router = APIRouter(prefix="/v1/messages", tags=["messages"])


class FeedbackRequest(BaseModel):
    value: Literal["up", "down"]


class FeedbackPayload(BaseModel):
    message_id: str
    feedback: str


class TracePayload(BaseModel):
    message_id: str
    conversation_id: str
    confidence_score: float | None
    created_at: datetime
    trace: dict[str, Any]


async def _message_in_project(session: AsyncSession, message_id: str, project_id: str) -> Message:
    result = await session.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.id == message_id, Conversation.project_id == project_id)
    )
    message = result.scalars().first()
    if message is None:
        raise NotFound("message not found")
    return message


@router.post("/{message_id}/feedback", response_model=FeedbackPayload)
async def submit_feedback(
    message_id: str, payload: FeedbackRequest, session: SessionDep, context: KeyDep
) -> FeedbackPayload:
    message = await _message_in_project(session, message_id, context.project.id)
    if message.role != "assistant":
        raise NotFound("message not found")

    message.feedback = payload.value
    await session.commit()
    return FeedbackPayload(message_id=message.id, feedback=payload.value)


async def _authorize_trace(
    session: AsyncSession,
    message_id: str,
    authorization: str | None,
    api_key: str | None,
) -> Message:
    if api_key:
        if api_keys.key_type_of(api_key) != "secret":
            raise Forbidden("reading a trace requires a secret key")

        key_result = await session.execute(
            select(ApiKey).where(ApiKey.key_hash == api_keys.hash_key(api_key))
        )
        key = key_result.scalars().first()
        if key is None or key.revoked_at is not None:
            raise Unauthorized("invalid api key")

        return await _message_in_project(session, message_id, key.project_id)

    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized()

    try:
        user_id = tokens.decode_token(authorization.split(" ", 1)[1].strip(), "access")
    except tokens.InvalidTokenError as exc:
        raise Unauthorized(str(exc)) from exc

    result = await session.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(Project, Conversation.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(Message.id == message_id, Organization.owner_user_id == user_id)
    )
    message = result.scalars().first()
    if message is None:
        raise NotFound("message not found")
    return message


@router.get("/{message_id}/trace", response_model=TracePayload)
async def get_trace(
    message_id: str,
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> TracePayload:
    message = await _authorize_trace(session, message_id, authorization, x_api_key)
    return TracePayload(
        message_id=message.id,
        conversation_id=message.conversation_id,
        confidence_score=message.confidence_score,
        created_at=message.created_at,
        trace=message.retrieval_trace or {},
    )
