"""Qdrant search backend (SEARCH_BACKEND=qdrant, needs `uv sync --extra qdrant`).

Two collections: chunks, holding a dense vector for semantic search and a sparse term vector
for keyword search, and the semantic cache. Keyword search mirrors BM25: the API tokenizes text
with the same tokenizer as the other backends (jieba for Chinese), weights term frequency with
BM25's saturation, and Qdrant applies inverse document frequency on the server (Modifier.IDF).
Collections are created on first write, sized by the vectors actually received.
"""

import logging
import uuid
import zlib
from collections import Counter
from typing import Any

from ..config import get_settings
from ..rag.text import tokenize
from .base import IndexedChunk, SearchHit

logger = logging.getLogger(__name__)

_DENSE = "dense"
_LEXICAL = "lexical"
_ID_NAMESPACE = uuid.UUID("3f1a6c52-6a9d-4f0e-9a43-6a1f6d0e2b7c")
_BM25_K1 = 1.2


def _point_id(key: str) -> str:
    # Qdrant ids are integers or UUIDs; derive a stable UUID from our string ids.
    return str(uuid.uuid5(_ID_NAMESPACE, key))


def _term_index(term: str) -> int:
    return zlib.crc32(term.encode("utf-8")) & 0x7FFFFFFF


def _document_terms(text: str) -> tuple[list[int], list[float]]:
    counts = Counter(_term_index(term) for term in tokenize(text))
    indices = sorted(counts)
    # BM25 term-frequency saturation (b = 0); Qdrant multiplies in the IDF.
    values = [counts[i] * (_BM25_K1 + 1) / (counts[i] + _BM25_K1) for i in indices]
    return indices, values


def _query_terms(text: str) -> tuple[list[int], list[float]]:
    indices = sorted({_term_index(term) for term in tokenize(text)})
    return indices, [1.0] * len(indices)


class QdrantBackend:
    def __init__(
        self,
        url: str | None = None,
        api_key: str | None = None,
        collection_prefix: str | None = None,
        cache_threshold: float | None = None,
    ) -> None:
        from qdrant_client import AsyncQdrantClient, models

        settings = get_settings()
        self._models = models
        url = url or settings.qdrant_url
        self._local = url == ":memory:"
        # ":memory:" runs Qdrant inside this process: handy for tests and quick trials.
        self._client = (
            AsyncQdrantClient(location=":memory:")
            if url == ":memory:"
            else AsyncQdrantClient(url=url, api_key=api_key or settings.qdrant_api_key)
        )
        prefix = collection_prefix or settings.qdrant_collection_prefix
        self._chunks = f"{prefix}_chunks"
        self._cache = f"{prefix}_cache"
        self._threshold = (
            cache_threshold if cache_threshold is not None else settings.semantic_cache_threshold
        )
        self._ready: set[str] = set()

    # --- collections ----------------------------------------------------------

    async def _exists(self, name: str) -> bool:
        if name in self._ready:
            return True
        if await self._client.collection_exists(name):
            self._ready.add(name)
            return True
        return False

    async def _ensure(self, name: str, dimensions: int, lexical: bool) -> None:
        if await self._exists(name):
            return
        models = self._models
        await self._client.create_collection(
            name,
            vectors_config={
                _DENSE: models.VectorParams(size=dimensions, distance=models.Distance.COSINE)
            },
            sparse_vectors_config=(
                {_LEXICAL: models.SparseVectorParams(modifier=models.Modifier.IDF)}
                if lexical
                else None
            ),
        )
        if not self._local:  # payload indexes only exist on a Qdrant server
            for field in ("project_id", "document_id"):
                await self._client.create_payload_index(
                    name, field_name=field, field_schema=models.PayloadSchemaType.KEYWORD
                )
        self._ready.add(name)

    def _filter(self, project_id: str, document_id: str | None = None) -> Any:
        models = self._models
        must = [models.FieldCondition(key="project_id", match=models.MatchValue(value=project_id))]
        if document_id is not None:
            must.append(
                models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id))
            )
        return models.Filter(must=must)

    async def _delete(self, collection: str, selector: Any) -> None:
        if await self._exists(collection):
            await self._client.delete(
                collection, points_selector=self._models.FilterSelector(filter=selector)
            )

    # --- chunks ---------------------------------------------------------------

    async def upsert(self, chunks: list[IndexedChunk]) -> None:
        if not chunks:
            return
        models = self._models
        await self._ensure(self._chunks, len(chunks[0].embedding), lexical=True)
        points = []
        for chunk in chunks:
            indices, values = _document_terms(chunk.text)
            vectors: dict[str, Any] = {_DENSE: chunk.embedding}
            if indices:
                vectors[_LEXICAL] = models.SparseVector(indices=indices, values=values)
            points.append(
                models.PointStruct(
                    id=_point_id(chunk.chunk_id),
                    vector=vectors,
                    payload={
                        "chunk_id": chunk.chunk_id,
                        "project_id": chunk.project_id,
                        "document_id": chunk.document_id,
                        "trust_score": chunk.trust_score,
                        "metadata": chunk.metadata,
                    },
                )
            )
        await self._client.upsert(self._chunks, points=points)

    async def delete_document(self, project_id: str, document_id: str) -> None:
        await self._delete(self._chunks, self._filter(project_id, document_id))

    async def delete_project(self, project_id: str) -> None:
        for collection in (self._chunks, self._cache):
            await self._delete(collection, self._filter(project_id))

    async def _query(
        self, collection: str, query: Any, using: str, project_id: str, limit: int
    ) -> list[Any]:
        if limit <= 0 or not await self._exists(collection):
            return []
        try:
            response = await self._client.query_points(
                collection,
                query=query,
                using=using,
                query_filter=self._filter(project_id),
                limit=limit,
                with_payload=True,
            )
        except Exception as exc:  # e.g. a query vector of the wrong size
            logger.warning("qdrant %s search failed: %s", using, exc)
            return []
        return list(response.points)

    @staticmethod
    def _hits(points: list[Any]) -> list[SearchHit]:
        return [
            SearchHit(
                chunk_id=point.payload["chunk_id"],
                document_id=point.payload["document_id"],
                score=float(point.score),
                rank=rank,
            )
            for rank, point in enumerate(points, start=1)
        ]

    async def vector_search(
        self, project_id: str, embedding: list[float], limit: int
    ) -> list[SearchHit]:
        return self._hits(await self._query(self._chunks, embedding, _DENSE, project_id, limit))

    async def lexical_search(self, project_id: str, query: str, limit: int) -> list[SearchHit]:
        indices, values = _query_terms(query)
        if not indices:
            return []
        sparse = self._models.SparseVector(indices=indices, values=values)
        return self._hits(await self._query(self._chunks, sparse, _LEXICAL, project_id, limit))

    # --- semantic cache -------------------------------------------------------

    async def cache_upsert(self, project_id: str, entry_id: str, embedding: list[float]) -> None:
        await self._ensure(self._cache, len(embedding), lexical=False)
        await self._client.upsert(
            self._cache,
            points=[
                self._models.PointStruct(
                    id=_point_id(entry_id),
                    vector={_DENSE: embedding},
                    payload={"entry_id": entry_id, "project_id": project_id},
                )
            ],
        )

    async def cache_lookup(
        self, project_id: str, embedding: list[float]
    ) -> tuple[str, float] | None:
        points = await self._query(self._cache, embedding, _DENSE, project_id, 1)
        if not points or float(points[0].score) < self._threshold:
            return None
        return str(points[0].payload["entry_id"]), float(points[0].score)

    async def cache_clear(self, project_id: str) -> None:
        await self._delete(self._cache, self._filter(project_id))

    async def aclose(self) -> None:
        await self._client.close()
