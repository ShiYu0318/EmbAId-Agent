from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable


@dataclass(slots=True)
class IndexedChunk:
    chunk_id: str
    project_id: str
    document_id: str
    text: str
    embedding: list[float]
    trust_score: float = 1.0
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class SearchHit:
    chunk_id: str
    document_id: str
    score: float
    rank: int


@runtime_checkable
class SearchBackend(Protocol):
    async def upsert(self, chunks: list[IndexedChunk]) -> None: ...

    async def delete_document(self, project_id: str, document_id: str) -> None: ...

    async def delete_project(self, project_id: str) -> None: ...

    async def vector_search(
        self, project_id: str, embedding: list[float], limit: int
    ) -> list[SearchHit]: ...

    async def lexical_search(self, project_id: str, query: str, limit: int) -> list[SearchHit]: ...

    async def cache_upsert(
        self, project_id: str, entry_id: str, embedding: list[float]
    ) -> None: ...

    async def cache_lookup(
        self, project_id: str, embedding: list[float]
    ) -> tuple[str, float] | None: ...

    async def cache_clear(self, project_id: str) -> None: ...
