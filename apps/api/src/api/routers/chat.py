import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import Conversation, Message, Project
from ...providers.registry import ProviderNotConfiguredError, build_chat_model, build_embeddings
from ...rag import cache, pipeline
from ...rag.types import ChatTurn
from ...search.factory import get_search_backend
from ..deps import KeyDep, SessionDep
from ..errors import NotFound, ProviderUnavailable

router = APIRouter(prefix="/v1", tags=["chat"])

HISTORY_LIMIT = 10


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


async def _resolve_conversation(
    session: AsyncSession, project: Project, payload: ChatRequest, is_sandbox: bool
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
        channel="api" if is_sandbox else "widget",
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
async def chat(payload: ChatRequest, session: SessionDep, context: KeyDep) -> StreamingResponse:
    project = context.project
    runtime = _build_runtime(project)

    conversation = await _resolve_conversation(session, project, payload, context.is_sandbox)
    history = await _load_history(session, conversation.id)

    session.add(Message(conversation_id=conversation.id, role="user", content=payload.message))
    await session.flush()

    prepared = await pipeline.prepare(
        session=session,
        project=project,
        runtime=runtime,
        question=payload.message,
        history=history,
        locale=payload.locale or conversation.locale,
    )

    assistant = Message(
        conversation_id=conversation.id,
        role="assistant",
        content="",
        citations=cache.serialize_citations(prepared.citations),
        confidence_score=prepared.confidence,
        retrieval_trace=prepared.trace.as_dict(),
    )
    session.add(assistant)
    await session.flush()

    conversation_id = conversation.id
    assistant_id = assistant.id
    await session.commit()

    async def event_stream() -> AsyncIterator[str]:
        yield _frame(
            "conversation",
            {"conversation_id": conversation_id, "message_id": assistant_id},
        )

        collected: list[str] = []
        async for token in pipeline.stream_answer(runtime, prepared):
            collected.append(token)
            yield _frame("token", {"text": token})

        answer = "".join(collected)
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

        yield _frame("done", {"answered": prepared.trace.answered})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
