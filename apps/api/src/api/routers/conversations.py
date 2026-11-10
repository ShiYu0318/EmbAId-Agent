import csv
import io
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from ...db.models import Conversation, Message, Organization, Project, User
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import NotFound

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])

MAX_EXPORT_ROWS = 5000

EXPORT_COLUMNS = (
    "conversation_id",
    "started_at",
    "channel",
    "is_sandbox",
    "visitor_id",
    "locale",
    "message_id",
    "role",
    "content",
    "confidence_score",
    "feedback",
    "created_at",
)


class MessagePayload(BaseModel):
    id: str
    role: str
    content: str
    citations: dict[str, Any]
    confidence_score: float | None
    feedback: str | None
    prompt_tokens: int
    completion_tokens: int
    created_at: datetime


class ConversationSummary(BaseModel):
    id: str
    project_id: str
    channel: str
    visitor_id: str | None
    is_sandbox: bool
    title: str | None
    locale: str
    started_at: datetime
    last_message_at: datetime
    message_count: int


class ConversationDetail(ConversationSummary):
    messages: list[MessagePayload]


class ConversationPage(BaseModel):
    items: list[ConversationSummary]
    total: int
    limit: int
    offset: int


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


def _day_after(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time.min, tzinfo=UTC)


def _message_count_column() -> ColumnElement[int]:
    return (
        select(func.count(Message.id))
        .where(Message.conversation_id == Conversation.id)
        .scalar_subquery()
        .label("message_count")
    )


def _filters(
    project_id: str,
    channel: str | None,
    is_sandbox: bool | None,
    start: date | None,
    end: date | None,
    search: str | None,
) -> list[ColumnElement[bool]]:
    clauses: list[ColumnElement[bool]] = [Conversation.project_id == project_id]

    if channel:
        clauses.append(Conversation.channel == channel)
    if is_sandbox is not None:
        clauses.append(Conversation.is_sandbox.is_(is_sandbox))
    if start is not None:
        clauses.append(Conversation.started_at >= _day_start(start))
    if end is not None:
        clauses.append(Conversation.started_at < _day_after(end))
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        matched = aliased(Message)
        clauses.append(
            or_(
                Conversation.title.ilike(pattern),
                select(matched.id)
                .where(
                    matched.conversation_id == Conversation.id,
                    matched.content.ilike(pattern),
                )
                .exists(),
            )
        )

    return clauses


def _ordered(statement: Select[Any]) -> Select[Any]:
    return statement.order_by(Conversation.last_message_at.desc(), Conversation.id.desc())


async def _owned_conversation(
    session: AsyncSession, user: User, conversation_id: str
) -> Conversation:
    result = await session.execute(
        select(Conversation)
        .join(Project, Conversation.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(Conversation.id == conversation_id, Organization.owner_user_id == user.id)
    )
    conversation = result.scalars().first()
    if conversation is None:
        raise NotFound("conversation not found")
    return conversation


def _summary(conversation: Conversation, message_count: int) -> ConversationSummary:
    return ConversationSummary(
        id=conversation.id,
        project_id=conversation.project_id,
        channel=conversation.channel,
        visitor_id=conversation.visitor_id,
        is_sandbox=conversation.is_sandbox,
        title=conversation.title,
        locale=conversation.locale,
        started_at=conversation.started_at,
        last_message_at=conversation.last_message_at,
        message_count=message_count,
    )


_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe(value: Any) -> Any:
    """Stop spreadsheet apps from running visitor text as a formula."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return f"'{value}"
    return value


def _export_row(conversation: Conversation, message: Message | None) -> tuple[Any, ...]:
    return tuple(csv_safe(cell) for cell in _raw_export_row(conversation, message))


def _raw_export_row(conversation: Conversation, message: Message | None) -> tuple[Any, ...]:
    confidence = None if message is None else message.confidence_score
    return (
        conversation.id,
        conversation.started_at.isoformat(),
        conversation.channel,
        str(conversation.is_sandbox).lower(),
        conversation.visitor_id or "",
        conversation.locale,
        "" if message is None else message.id,
        "" if message is None else message.role,
        "" if message is None else message.content,
        "" if confidence is None else confidence,
        "" if message is None else (message.feedback or ""),
        "" if message is None else message.created_at.isoformat(),
    )


@router.get("/export")
async def export_conversations(
    user: CurrentUser,
    session: SessionDep,
    project_id: Annotated[str, Query()],
    channel: Annotated[str | None, Query()] = None,
    is_sandbox: Annotated[bool | None, Query()] = None,
    start: Annotated[date | None, Query()] = None,
    end: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query(alias="q")] = None,
) -> Response:
    project = await owned_project(session, user, project_id)
    clauses = _filters(project.id, channel, is_sandbox, start, end, search)

    result = await session.execute(
        _ordered(
            select(Conversation, Message)
            .outerjoin(Message, Message.conversation_id == Conversation.id)
            .where(*clauses)
        )
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(MAX_EXPORT_ROWS)
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(EXPORT_COLUMNS)
    for conversation, message in result.all():
        writer.writerow(_export_row(conversation, message))

    filename = f"conversations-{project.id}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("", response_model=ConversationPage)
async def list_conversations(
    user: CurrentUser,
    session: SessionDep,
    project_id: Annotated[str, Query()],
    channel: Annotated[str | None, Query()] = None,
    is_sandbox: Annotated[bool | None, Query()] = None,
    start: Annotated[date | None, Query()] = None,
    end: Annotated[date | None, Query()] = None,
    search: Annotated[str | None, Query(alias="q")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConversationPage:
    project = await owned_project(session, user, project_id)
    clauses = _filters(project.id, channel, is_sandbox, start, end, search)

    total = await session.scalar(select(func.count()).select_from(Conversation).where(*clauses))
    result = await session.execute(
        _ordered(select(Conversation, _message_count_column()).where(*clauses))
        .limit(limit)
        .offset(offset)
    )

    return ConversationPage(
        items=[_summary(conversation, count) for conversation, count in result.all()],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str, user: CurrentUser, session: SessionDep
) -> ConversationDetail:
    conversation = await _owned_conversation(session, user, conversation_id)
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    )
    messages = [
        MessagePayload(
            id=message.id,
            role=message.role,
            content=message.content,
            citations=message.citations,
            confidence_score=message.confidence_score,
            feedback=message.feedback,
            prompt_tokens=message.prompt_tokens,
            completion_tokens=message.completion_tokens,
            created_at=message.created_at,
        )
        for message in result.scalars().all()
    ]

    return ConversationDetail(
        **_summary(conversation, len(messages)).model_dump(), messages=messages
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str, user: CurrentUser, session: SessionDep) -> None:
    conversation = await _owned_conversation(session, user, conversation_id)
    await session.delete(conversation)
    await session.commit()
