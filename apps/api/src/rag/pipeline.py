import time
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass, field

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import FlaggedQuestion, Project
from ..search.base import SearchBackend
from . import cache
from .prompt import build_citations, build_messages, resolve_locale
from .rerank import rerank
from .retriever import Retriever
from .rewrite import rewrite_query
from .text import normalize
from .timing import elapsed_ms
from .types import ChatTurn, Citation, RetrievalTrace, RetrievedChunk

MAX_NORMALIZED_CHARS = 500

# Reports a pipeline stage as it starts, so clients can show what the assistant is doing.
StageCallback = Callable[[str, dict[str, object]], Awaitable[None]]

REFUSALS = {
    "zh": (
        "抱歉，目前的知識庫裡沒有足夠的資料可以回答這個問題，我不想給你不確定的答案。"
        "我已經把這個問題記錄下來，請稍後再試或聯繫真人客服。"
    ),
    "en": (
        "I could not find enough information in the knowledge base to answer that "
        "confidently, so I would rather not guess. I have logged the question for a "
        "human to follow up."
    ),
    "ja": (
        "申し訳ありませんが、現在のナレッジベースにはこの質問に答えるための十分な情報がありません。"
        "この質問は記録しましたので、後ほどお試しいただくか、担当者にお問い合わせください。"
    ),
}


def refusal_text(locale: str) -> str:
    language = locale.split("-")[0].lower()
    return REFUSALS.get(language, REFUSALS["zh"])


@dataclass(slots=True)
class RagRuntime:
    search: SearchBackend
    embeddings: Embeddings
    chat_model: BaseChatModel


@dataclass(slots=True)
class PreparedAnswer:
    trace: RetrievalTrace
    locale: str
    chunks: list[RetrievedChunk] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)
    messages: list[BaseMessage] | None = None
    answer: str | None = None
    confidence: float = 0.0
    question_embedding: list[float] | None = None

    @property
    def needs_model(self) -> bool:
        return self.messages is not None

    @property
    def cacheable(self) -> bool:
        return self.needs_model and not self.trace.cache_hit and self.trace.answered


async def flag_question(session: AsyncSession, project: Project, question: str) -> FlaggedQuestion:
    normalized = normalize(question)[:MAX_NORMALIZED_CHARS]
    result = await session.execute(
        select(FlaggedQuestion).where(
            FlaggedQuestion.project_id == project.id,
            FlaggedQuestion.normalized_text == normalized,
        )
    )
    existing = result.scalars().first()
    if existing is not None:
        existing.occurrence_count += 1
        return existing

    flagged = FlaggedQuestion(
        project_id=project.id,
        question_text=question,
        normalized_text=normalized,
    )
    session.add(flagged)
    await session.flush()
    return flagged


async def prepare(
    session: AsyncSession,
    project: Project,
    runtime: RagRuntime,
    question: str,
    history: Sequence[ChatTurn] = (),
    locale: str | None = None,
    on_stage: StageCallback | None = None,
) -> PreparedAnswer:
    async def stage(name: str, **detail: object) -> None:
        if on_stage is not None:
            await on_stage(name, detail)

    settings = get_settings()
    resolved_locale = resolve_locale(project, locale)
    trace = RetrievalTrace(
        original_query=question,
        confidence_threshold=project.confidence_threshold,
    )

    await stage("understand")
    question_embedding: list[float] | None = None
    if settings.semantic_cache_enabled:
        question_embedding = await runtime.embeddings.aembed_query(question)
        cached = await cache.lookup(
            session,
            project,
            runtime.search,
            runtime.embeddings,
            question,
            trace,
            embedding=question_embedding,
        )
        if cached is not None:
            answer, citations = cached
            await stage("cache_hit", sources=len(citations))
            return PreparedAnswer(
                trace=trace,
                locale=resolved_locale,
                citations=citations,
                answer=answer,
                question_embedding=question_embedding,
            )

    started = time.perf_counter()
    rewritten = await rewrite_query(runtime.chat_model, question, history)
    trace.timings_ms["rewrite"] = elapsed_ms(started)
    trace.rewritten_query = rewritten

    await stage("search", query=rewritten)
    retriever = Retriever(
        session,
        project,
        runtime.search,
        runtime.embeddings,
        candidates=settings.retrieval_candidates,
    )
    chunks = await retriever.retrieve(
        rewritten,
        trace,
        embedding=question_embedding if rewritten == question else None,
    )

    await stage("rerank", candidates=len(chunks))
    chunks = await rerank(
        rewritten,
        chunks,
        trace,
        model_name=settings.rerank_model,
        enabled=settings.rerank_enabled,
    )
    chunks = chunks[: settings.retrieval_top_k]

    confidence = max((chunk.score for chunk in chunks), default=0.0)
    trace.confidence_score = confidence

    if confidence < project.confidence_threshold:
        await stage(
            "abstain",
            confidence=round(confidence, 2),
            threshold=project.confidence_threshold,
        )
        trace.answered = False
        trace.refusal_reason = "low_confidence"
        await flag_question(session, project, question)
        return PreparedAnswer(
            trace=trace,
            locale=resolved_locale,
            chunks=chunks,
            answer=refusal_text(resolved_locale),
            confidence=confidence,
            question_embedding=question_embedding,
        )

    await stage("compose", sources=len(chunks), confidence=round(confidence, 2))
    return PreparedAnswer(
        trace=trace,
        locale=resolved_locale,
        chunks=chunks,
        citations=build_citations(chunks),
        messages=build_messages(project, chunks, question, history, resolved_locale),
        confidence=confidence,
        question_embedding=question_embedding,
    )


def _message_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
        return "".join(parts)
    return ""


async def stream_answer(runtime: RagRuntime, prepared: PreparedAnswer) -> AsyncIterator[str]:
    if prepared.messages is None:
        if prepared.answer:
            yield prepared.answer
        return

    started = time.perf_counter()
    async for chunk in runtime.chat_model.astream(prepared.messages):
        text = _message_text(chunk.content)
        if text:
            yield text
    prepared.trace.timings_ms["generate"] = elapsed_ms(started)
