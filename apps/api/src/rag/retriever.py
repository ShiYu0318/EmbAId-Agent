import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from langchain_core.embeddings import Embeddings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Document, DocumentChunk, Project
from ..search.base import SearchBackend, SearchHit
from .text import lexical_query
from .timing import elapsed_ms
from .types import RetrievalTrace, RetrievedChunk

RRF_K = 60
TRUST_FLOOR = 0.5
STALE_PENALTY = 0.6
MAX_TRACE_HITS = 30


@dataclass(slots=True)
class FusedHit:
    chunk_id: str
    document_id: str
    rrf_score: float
    vector_score: float | None = None
    lexical_score: float | None = None
    vector_rank: int | None = None
    lexical_rank: int | None = None


def _hit_payload(hit: SearchHit, position: int) -> dict[str, Any]:
    return {
        "chunk_id": hit.chunk_id,
        "document_id": hit.document_id,
        "score": hit.score,
        "rank": hit.rank or position,
    }


def fuse(
    vector_hits: Sequence[SearchHit],
    lexical_hits: Sequence[SearchHit],
    k: int = RRF_K,
) -> list[FusedHit]:
    """Reciprocal rank fusion, normalised so a perfect hit in every list scores 1.0."""
    populated = [hits for hits in (vector_hits, lexical_hits) if hits]
    if not populated:
        return []

    normalizer = len(populated) / (k + 1)
    merged: dict[str, FusedHit] = {}

    for hits, is_vector in ((vector_hits, True), (lexical_hits, False)):
        for position, hit in enumerate(hits, start=1):
            rank = hit.rank or position
            fused = merged.get(hit.chunk_id)
            if fused is None:
                fused = FusedHit(chunk_id=hit.chunk_id, document_id=hit.document_id, rrf_score=0.0)
                merged[hit.chunk_id] = fused
            fused.rrf_score += 1.0 / (k + rank)
            if is_vector:
                fused.vector_score = hit.score
                fused.vector_rank = rank
            else:
                fused.lexical_score = hit.score
                fused.lexical_rank = rank

    for fused in merged.values():
        fused.rrf_score /= normalizer

    return sorted(merged.values(), key=lambda hit: hit.rrf_score, reverse=True)


def trust_weight(trust_score: float, is_stale: bool) -> float:
    trust = min(max(trust_score, 0.0), 1.0)
    weight = TRUST_FLOOR + (1.0 - TRUST_FLOOR) * trust
    if is_stale:
        weight *= STALE_PENALTY
    return weight


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def is_document_stale(document: Document, cutoff: datetime) -> bool:
    verified = document.last_verified_at or document.updated_at
    if verified is None:
        return False
    return _as_utc(verified) < cutoff


class Retriever:
    def __init__(
        self,
        session: AsyncSession,
        project: Project,
        search: SearchBackend,
        embeddings: Embeddings,
        *,
        candidates: int,
    ) -> None:
        self.session = session
        self.project = project
        self.search = search
        self.embeddings = embeddings
        self.candidates = candidates

    async def retrieve(
        self,
        query: str,
        trace: RetrievalTrace,
        *,
        embedding: list[float] | None = None,
    ) -> list[RetrievedChunk]:
        project_id = self.project.id

        started = time.perf_counter()
        if embedding is None:
            embedding = await self.embeddings.aembed_query(query)
        trace.timings_ms["embed"] = elapsed_ms(started)

        started = time.perf_counter()
        vector_hits, lexical_hits = await asyncio.gather(
            self.search.vector_search(project_id, embedding, self.candidates),
            self.search.lexical_search(project_id, lexical_query(query), self.candidates),
        )
        trace.timings_ms["search"] = elapsed_ms(started)
        trace.vector_hits = [
            _hit_payload(hit, position) for position, hit in enumerate(vector_hits, start=1)
        ]
        trace.lexical_hits = [
            _hit_payload(hit, position) for position, hit in enumerate(lexical_hits, start=1)
        ]

        started = time.perf_counter()
        fused = fuse(vector_hits, lexical_hits)
        trace.timings_ms["fuse"] = elapsed_ms(started)
        if not fused:
            trace.fused_hits = []
            return []

        started = time.perf_counter()
        rows = await self._load_rows([hit.chunk_id for hit in fused])
        trace.timings_ms["load"] = elapsed_ms(started)

        cutoff = datetime.now(UTC) - timedelta(days=self.project.staleness_days)
        chunks: list[RetrievedChunk] = []
        for hit in fused:
            row = rows.get(hit.chunk_id)
            if row is None:
                continue
            chunk, document = row
            stale = is_document_stale(document, cutoff)
            weight = trust_weight(chunk.trust_score, stale)
            chunks.append(
                RetrievedChunk(
                    chunk_id=chunk.id,
                    document_id=document.id,
                    document_title=document.title,
                    document_url=document.url,
                    content=chunk.content,
                    score=hit.rrf_score * weight,
                    vector_score=hit.vector_score,
                    lexical_score=hit.lexical_score,
                    trust_score=chunk.trust_score,
                    is_stale=stale,
                )
            )

        chunks.sort(key=lambda chunk: chunk.score, reverse=True)
        fused_by_id = {hit.chunk_id: hit for hit in fused}
        trace.fused_hits = [
            {
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "rrf_score": fused_by_id[chunk.chunk_id].rrf_score,
                "score": chunk.score,
                "vector_rank": fused_by_id[chunk.chunk_id].vector_rank,
                "lexical_rank": fused_by_id[chunk.chunk_id].lexical_rank,
                "trust_score": chunk.trust_score,
                "is_stale": chunk.is_stale,
            }
            for chunk in chunks[:MAX_TRACE_HITS]
        ]
        return chunks

    async def _load_rows(
        self, chunk_ids: Sequence[str]
    ) -> dict[str, tuple[DocumentChunk, Document]]:
        if not chunk_ids:
            return {}
        result = await self.session.execute(
            select(DocumentChunk, Document)
            .join(Document, Document.id == DocumentChunk.document_id)
            .where(
                DocumentChunk.id.in_(chunk_ids),
                DocumentChunk.project_id == self.project.id,
                Document.project_id == self.project.id,
                Document.enabled.isnot(False),
            )
        )
        return {chunk.id: (chunk, document) for chunk, document in result.all()}
