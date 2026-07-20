import logging
import time
from collections.abc import Sequence
from typing import Any

from langchain_core.embeddings import Embeddings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import Project, SemanticCacheEntry
from ..search.base import SearchBackend
from .timing import elapsed_ms
from .types import Citation, RetrievalTrace

logger = logging.getLogger(__name__)


def serialize_citations(citations: Sequence[Citation]) -> dict[str, Any]:
    return {"items": [citation.as_dict() for citation in citations]}


def deserialize_citations(payload: Any) -> list[Citation]:
    items = payload.get("items", []) if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        return []
    citations: list[Citation] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        citations.append(
            Citation(
                chunk_id=str(item.get("chunk_id", "")),
                document_id=str(item.get("document_id", "")),
                title=str(item.get("title", "")),
                url=item.get("url"),
                snippet=str(item.get("snippet", "")),
            )
        )
    return citations


async def lookup(
    session: AsyncSession,
    project: Project,
    search: SearchBackend,
    embeddings: Embeddings,
    question: str,
    trace: RetrievalTrace,
    *,
    embedding: list[float] | None = None,
) -> tuple[str, list[Citation]] | None:
    settings = get_settings()
    if not settings.semantic_cache_enabled:
        return None

    started = time.perf_counter()
    try:
        if embedding is None:
            embedding = await embeddings.aembed_query(question)
        match = await search.cache_lookup(project.id, embedding)
    except Exception as exc:
        logger.warning("semantic cache lookup failed: %s", exc)
        return None
    finally:
        trace.timings_ms["cache_lookup"] = elapsed_ms(started)

    if match is None:
        return None

    entry_id, similarity = match
    if similarity < settings.semantic_cache_threshold:
        return None

    result = await session.execute(
        select(SemanticCacheEntry).where(
            SemanticCacheEntry.id == entry_id,
            SemanticCacheEntry.project_id == project.id,
        )
    )
    entry = result.scalars().first()
    if entry is None:
        return None

    entry.hit_count += 1
    trace.cache_hit = True
    trace.cache_similarity = similarity
    return entry.answer, deserialize_citations(entry.citations)


async def store(
    session: AsyncSession,
    project: Project,
    search: SearchBackend,
    embeddings: Embeddings,
    question: str,
    answer: str,
    citations: Sequence[Citation],
    *,
    embedding: list[float] | None = None,
) -> None:
    settings = get_settings()
    if not settings.semantic_cache_enabled or not answer.strip():
        return

    try:
        if embedding is None:
            embedding = await embeddings.aembed_query(question)
        entry = SemanticCacheEntry(
            project_id=project.id,
            question=question,
            answer=answer,
            citations=serialize_citations(citations),
        )
        session.add(entry)
        await session.flush()
        await search.cache_upsert(project.id, entry.id, embedding)
    except Exception as exc:
        logger.warning("semantic cache store failed: %s", exc)
