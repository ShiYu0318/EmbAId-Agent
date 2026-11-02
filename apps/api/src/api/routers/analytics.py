from collections import Counter
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ...db.models import Conversation, Document, Message
from ..deps import CurrentUser, SessionDep, owned_project

router = APIRouter(prefix="/v1", tags=["analytics"])

TOP_QUESTION_LIMIT = 10
CONFIDENCE_BUCKETS = 10


class DailyPoint(BaseModel):
    date: str
    value: int


class TopQuestion(BaseModel):
    question: str
    count: int


class CountByLabel(BaseModel):
    label: str
    count: int


class PeriodTotals(BaseModel):
    """The same measures for the window just before the requested one."""

    conversations: int
    messages: int
    answers: int
    refusal_rate: float
    satisfaction_rate: float | None
    average_confidence: float | None


class AnalyticsPayload(BaseModel):
    project_id: str
    range_days: int
    conversations: int
    messages: int
    questions: int
    answers: int
    refusals: int
    refusal_rate: float
    thumbs_up: int
    thumbs_down: int
    satisfaction_rate: float | None
    cache_hits: int
    cache_hit_rate: float
    average_confidence: float | None
    prompt_tokens: int
    completion_tokens: int
    stale_documents: int
    conversations_by_day: list[DailyPoint] = Field(default_factory=list)
    messages_by_day: list[DailyPoint] = Field(default_factory=list)
    top_questions: list[TopQuestion] = Field(default_factory=list)
    answers_by_day: list[DailyPoint] = Field(default_factory=list)
    refusals_by_day: list[DailyPoint] = Field(default_factory=list)
    confidence_threshold: float = 0.0
    confidence_histogram: list[int] = Field(default_factory=list)
    channels: list[CountByLabel] = Field(default_factory=list)
    previous: PeriodTotals | None = None


def _day_key(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).date().isoformat()


def _series(values: list[datetime], start: datetime, days: int) -> list[DailyPoint]:
    counts = Counter(_day_key(value) for value in values)
    return [
        DailyPoint(
            date=(start + timedelta(days=offset)).date().isoformat(),
            value=counts.get((start + timedelta(days=offset)).date().isoformat(), 0),
        )
        for offset in range(days + 1)
    ]


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


async def _window(
    session: SessionDep,
    project_id: str,
    start: datetime,
    end: datetime | None,
    include_sandbox: bool,
) -> tuple[list[Conversation], list[Message]]:
    query = select(Conversation).where(
        Conversation.project_id == project_id, Conversation.started_at >= start
    )
    if end is not None:
        query = query.where(Conversation.started_at < end)
    if not include_sandbox:
        query = query.where(Conversation.is_sandbox.is_(False))
    conversations = list((await session.execute(query)).scalars().all())
    ids = [conversation.id for conversation in conversations]
    if not ids:
        return conversations, []
    result = await session.execute(select(Message).where(Message.conversation_id.in_(ids)))
    return conversations, list(result.scalars().all())


def _answered(message: Message) -> bool:
    return message.retrieval_trace.get("answered") is not False


def _totals(conversations: list[Conversation], messages: list[Message]) -> PeriodTotals:
    answers = [message for message in messages if message.role == "assistant"]
    refusals = sum(1 for message in answers if not _answered(message))
    up = sum(1 for message in answers if message.feedback == "up")
    rated = up + sum(1 for message in answers if message.feedback == "down")
    confidences = [m.confidence_score for m in answers if m.confidence_score is not None]
    return PeriodTotals(
        conversations=len(conversations),
        messages=len(messages),
        answers=len(answers),
        refusal_rate=_ratio(refusals, len(answers)),
        satisfaction_rate=_ratio(up, rated) if rated else None,
        average_confidence=(round(sum(confidences) / len(confidences), 4) if confidences else None),
    )


def _histogram(values: list[float]) -> list[int]:
    buckets = [0] * CONFIDENCE_BUCKETS
    for value in values:
        index = min(CONFIDENCE_BUCKETS - 1, max(0, int(value * CONFIDENCE_BUCKETS)))
        buckets[index] += 1
    return buckets


@router.get("/projects/{project_id}/analytics", response_model=AnalyticsPayload)
async def project_analytics(
    project_id: str,
    user: CurrentUser,
    session: SessionDep,
    days: int = Query(default=30, ge=1, le=365),
    include_sandbox: bool = False,
) -> AnalyticsPayload:
    project = await owned_project(session, user, project_id)
    start = datetime.now(UTC) - timedelta(days=days)

    conversations, messages = await _window(session, project.id, start, None, include_sandbox)
    previous_conversations, previous_messages = await _window(
        session, project.id, start - timedelta(days=days), start, include_sandbox
    )

    questions = [message for message in messages if message.role == "user"]
    answers = [message for message in messages if message.role == "assistant"]

    refusals = sum(1 for message in answers if message.retrieval_trace.get("answered") is False)
    cache_hits = sum(1 for message in answers if message.retrieval_trace.get("cache_hit") is True)
    thumbs_up = sum(1 for message in answers if message.feedback == "up")
    thumbs_down = sum(1 for message in answers if message.feedback == "down")
    rated = thumbs_up + thumbs_down

    confidences = [
        message.confidence_score for message in answers if message.confidence_score is not None
    ]

    stale_cutoff = datetime.now(UTC) - timedelta(days=project.staleness_days)
    stale_documents = await session.scalar(
        select(func.count(Document.id)).where(
            Document.project_id == project.id,
            (Document.last_verified_at.is_(None)) | (Document.last_verified_at < stale_cutoff),
        )
    )

    counts = Counter(message.content.strip() for message in questions if message.content.strip())

    return AnalyticsPayload(
        project_id=project.id,
        range_days=days,
        conversations=len(conversations),
        messages=len(messages),
        questions=len(questions),
        answers=len(answers),
        refusals=refusals,
        refusal_rate=_ratio(refusals, len(answers)),
        thumbs_up=thumbs_up,
        thumbs_down=thumbs_down,
        satisfaction_rate=_ratio(thumbs_up, rated) if rated else None,
        cache_hits=cache_hits,
        cache_hit_rate=_ratio(cache_hits, len(answers)),
        average_confidence=(round(sum(confidences) / len(confidences), 4) if confidences else None),
        prompt_tokens=sum(message.prompt_tokens for message in messages),
        completion_tokens=sum(message.completion_tokens for message in messages),
        stale_documents=stale_documents or 0,
        conversations_by_day=_series(
            [conversation.started_at for conversation in conversations], start, days
        ),
        messages_by_day=_series([message.created_at for message in messages], start, days),
        top_questions=[
            TopQuestion(question=question, count=count)
            for question, count in counts.most_common(TOP_QUESTION_LIMIT)
        ],
        answers_by_day=_series(
            [message.created_at for message in answers if _answered(message)], start, days
        ),
        refusals_by_day=_series(
            [message.created_at for message in answers if not _answered(message)], start, days
        ),
        confidence_threshold=project.confidence_threshold,
        confidence_histogram=_histogram(confidences),
        channels=[
            CountByLabel(label=label, count=count)
            for label, count in Counter(c.channel for c in conversations).most_common()
        ],
        previous=_totals(previous_conversations, previous_messages),
    )
