from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_title: str
    document_url: str | None
    content: str
    score: float
    vector_score: float | None = None
    lexical_score: float | None = None
    rerank_score: float | None = None
    trust_score: float = 1.0
    is_stale: bool = False


@dataclass(slots=True)
class Citation:
    chunk_id: str
    document_id: str
    title: str
    url: str | None
    snippet: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
        }


@dataclass(slots=True)
class RetrievalTrace:
    original_query: str
    rewritten_query: str | None = None
    cache_hit: bool = False
    cache_similarity: float | None = None
    vector_hits: list[dict[str, Any]] = field(default_factory=list)
    lexical_hits: list[dict[str, Any]] = field(default_factory=list)
    fused_hits: list[dict[str, Any]] = field(default_factory=list)
    reranked_hits: list[dict[str, Any]] = field(default_factory=list)
    confidence_score: float | None = None
    confidence_threshold: float | None = None
    answered: bool = True
    refusal_reason: str | None = None
    timings_ms: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "original_query": self.original_query,
            "rewritten_query": self.rewritten_query,
            "cache_hit": self.cache_hit,
            "cache_similarity": self.cache_similarity,
            "vector_hits": self.vector_hits,
            "lexical_hits": self.lexical_hits,
            "fused_hits": self.fused_hits,
            "reranked_hits": self.reranked_hits,
            "confidence_score": self.confidence_score,
            "confidence_threshold": self.confidence_threshold,
            "answered": self.answered,
            "refusal_reason": self.refusal_reason,
            "timings_ms": self.timings_ms,
        }


@dataclass(slots=True)
class RetrievalResult:
    chunks: list[RetrievedChunk]
    trace: RetrievalTrace
    cached_answer: str | None = None
    cached_citations: list[Citation] = field(default_factory=list)

    @property
    def confidence(self) -> float:
        return max((chunk.score for chunk in self.chunks), default=0.0)


@dataclass(slots=True)
class ChatTurn:
    role: str
    content: str
