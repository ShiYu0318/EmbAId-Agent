import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.models import Conversation, Message, Project
from ...providers.registry import ProviderNotConfiguredError, build_chat_model, build_embeddings
from ...rag import cache, pipeline
from ...rag.options import OptionsFilter
from ...rag.types import ChatTurn
from ...search.factory import get_search_backend
from ..deps import KeyDep, SessionDep
from ..errors import NotFound, ProviderUnavailable

router = APIRouter(prefix="/v1", tags=["chat"])

HISTORY_LIMIT = 10


@router.get("/widget-config")
async def public_widget_config(context: KeyDep) -> dict[str, object]:
    project = context.project
    config = project.widget_config or {}
    return {
        "primary_color": config.get("accent_color") or "#0033ff",
        "greeting": config.get("greeting") or "",
        "starter_questions": config.get("suggested_questions") or [],
        "bot_name": config.get("bot_name") or "",
        "bot_avatar_url": config.get("bot_avatar_url"),
        "theme": config.get("theme") or "auto",
        "position": config.get("position") or "bottom-right",
        "locale": project.default_locale,
    }


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    visitor_id: str | None = Field(default=None, max_length=80)
    locale: str | None = Field(default=None, max_length=10)


def _frame(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _build_runtime(project: Project) -> pipeline.RagRuntime:
    try:
        return pipeline.RagRuntime(
            search=get_search_backend(),
            embeddings=build_embeddings(project.embedding_provider, project.embedding_model),
            chat_model=build_chat_model(project.chat_provider, project.chat_model),
        )
    except ProviderNotConfiguredError as exc:
        raise ProviderUnavailable(str(exc)) from exc


def _channel(is_sandbox: bool, origin: str | None) -> str:
    """Where a new conversation came from. Chats started inside the dashboard are kept
    apart from real website traffic, so a live install can be told from a test."""
    if is_sandbox:
        return "api"
    dashboard = get_settings().dashboard_url.rstrip("/")
    if origin and origin.rstrip("/") == dashboard:
        return "dashboard"
    return "widget"


async def _resolve_conversation(
    session: AsyncSession,
    project: Project,
    payload: ChatRequest,
    is_sandbox: bool,
    origin: str | None = None,
) -> Conversation:
    if payload.conversation_id:
        result = await session.execute(
            select(Conversation).where(
                Conversation.id == payload.conversation_id,
                Conversation.project_id == project.id,
            )
        )
        conversation = result.scalars().first()
        if conversation is None:
            raise NotFound("conversation not found")
        return conversation

    conversation = Conversation(
        project_id=project.id,
        channel=_channel(is_sandbox, origin),
        visitor_id=payload.visitor_id,
        is_sandbox=is_sandbox,
        locale=payload.locale or project.default_locale,
        title=payload.message[:120],
    )
    session.add(conversation)
    await session.flush()
    return conversation


async def _load_history(session: AsyncSession, conversation_id: str) -> list[ChatTurn]:
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    rows = list(result.scalars().all())
    rows.reverse()
    return [ChatTurn(role=row.role, content=row.content) for row in rows]


@router.post("/chat")
async def chat(
    payload: ChatRequest, request: Request, session: SessionDep, context: KeyDep
) -> StreamingResponse:
    project = context.project
    runtime = _build_runtime(project)

    conversation = await _resolve_conversation(
        session, project, payload, context.is_sandbox, request.headers.get("origin")
    )
    history = await _load_history(session, conversation.id)

    session.add(Message(conversation_id=conversation.id, role="user", content=payload.message))
    assistant = Message(conversation_id=conversation.id, role="assistant", content="")
    session.add(assistant)
    await session.flush()

    conversation_id = conversation.id
    assistant_id = assistant.id
    locale = payload.locale or conversation.locale
    await session.commit()

    async def event_stream() -> AsyncIterator[str]:
        yield _frame(
            "conversation",
            {"conversation_id": conversation_id, "message_id": assistant_id},
        )

        # Run retrieval in the background and relay each stage as it starts, so the
        # client can show the assistant thinking instead of a silent wait.
        stages: asyncio.Queue[tuple[str, dict[str, object]]] = asyncio.Queue()

        async def report(name: str, detail: dict[str, object]) -> None:
            await stages.put((name, detail))

        task = asyncio.create_task(
            pipeline.prepare(
                session=session,
                project=project,
                runtime=runtime,
                question=payload.message,
                history=history,
                locale=locale,
                on_stage=report,
            )
        )
        while not task.done() or not stages.empty():
            getter = asyncio.ensure_future(stages.get())
            done, _ = await asyncio.wait({getter, task}, return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                name, detail = getter.result()
                yield _frame("status", {"stage": name, **detail})
            else:
                getter.cancel()
        prepared = task.result()

        stored = await session.get(Message, assistant_id)
        if stored is not None:
            stored.citations = cache.serialize_citations(prepared.citations)
            stored.confidence_score = prepared.confidence
            stored.retrieval_trace = prepared.trace.as_dict()
            await session.commit()

        collected: list[str] = []
        choices = OptionsFilter()
        async for token in pipeline.stream_answer(runtime, prepared):
            visible = choices.feed(token)
            if visible:
                collected.append(visible)
                yield _frame("token", {"text": visible})
        tail, options = choices.finish()
        if tail:
            collected.append(tail)
            yield _frame("token", {"text": tail})

        answer = "".join(collected).rstrip()
        if options:
            yield _frame("quick_replies", {"items": options})
        yield _frame(
            "citations",
            {"items": [citation.as_dict() for citation in prepared.citations]},
        )
        yield _frame("trace", prepared.trace.as_dict())

        stored = await session.get(Message, assistant_id)
        if stored is not None:
            stored.content = answer
            stored.retrieval_trace = prepared.trace.as_dict()

        if prepared.cacheable and answer.strip():
            await cache.store(
                session=session,
                project=project,
                search=runtime.search,
                embeddings=runtime.embeddings,
                question=payload.message,
                answer=answer,
                citations=prepared.citations,
                embedding=prepared.question_embedding,
            )
        await session.commit()

        yield _frame(
            "done",
            {
                "answered": prepared.trace.answered,
                "confidence": round(prepared.confidence, 2),
                # a low-confidence refusal is logged as a knowledge gap (pipeline.flag_question)
                "flagged": prepared.trace.refusal_reason == "low_confidence",
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
