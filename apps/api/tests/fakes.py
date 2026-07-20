from collections.abc import AsyncIterator, Sequence
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.messages import AIMessageChunk, BaseMessage

from src.search.base import IndexedChunk, SearchHit


class FakeEmbeddings(Embeddings):
    def __init__(self, dimensions: int = 8) -> None:
        self.dimensions = dimensions
        self.calls: list[str] = []

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        for index, char in enumerate(text):
            vector[index % self.dimensions] += (ord(char) % 17) / 17
        norm = sum(value * value for value in vector) ** 0.5 or 1.0
        return [value / norm for value in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        self.calls.append(text)
        return self._vector(text)

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return self.embed_documents(texts)

    async def aembed_query(self, text: str) -> list[float]:
        return self.embed_query(text)


class FakeChatModel:
    def __init__(self, reply: str = "這是根據知識庫的回答。", tokens: int = 4) -> None:
        self.reply = reply
        self.tokens = tokens
        self.prompts: list[list[BaseMessage]] = []

    async def astream(self, messages: list[BaseMessage], **kwargs: Any) -> AsyncIterator[Any]:
        self.prompts.append(messages)
        size = max(1, len(self.reply) // self.tokens)
        for start in range(0, len(self.reply), size):
            yield AIMessageChunk(content=self.reply[start : start + size])

    async def ainvoke(self, messages: Any, **kwargs: Any) -> AIMessageChunk:
        self.prompts.append(messages)
        return AIMessageChunk(content=self.reply)


class FakeSearchBackend:
    def __init__(self) -> None:
        self.chunks: dict[str, IndexedChunk] = {}
        self.cache: dict[str, tuple[str, list[float]]] = {}
        self.vector_results: list[SearchHit] | None = None
        self.lexical_results: list[SearchHit] | None = None
        self.cache_result: tuple[str, float] | None = None

    async def upsert(self, chunks: list[IndexedChunk]) -> None:
        for chunk in chunks:
            self.chunks[chunk.chunk_id] = chunk

    async def delete_document(self, project_id: str, document_id: str) -> None:
        self.chunks = {
            key: value
            for key, value in self.chunks.items()
            if not (value.project_id == project_id and value.document_id == document_id)
        }

    async def delete_project(self, project_id: str) -> None:
        self.chunks = {
            key: value for key, value in self.chunks.items() if value.project_id != project_id
        }

    def _scored(self, project_id: str, limit: int) -> list[SearchHit]:
        hits = []
        for rank, chunk in enumerate(
            [c for c in self.chunks.values() if c.project_id == project_id][:limit]
        ):
            hits.append(
                SearchHit(
                    chunk_id=chunk.chunk_id,
                    document_id=chunk.document_id,
                    score=1.0 - rank * 0.1,
                    rank=rank,
                )
            )
        return hits

    async def vector_search(
        self, project_id: str, embedding: Sequence[float], limit: int
    ) -> list[SearchHit]:
        if self.vector_results is not None:
            return self.vector_results
        return self._scored(project_id, limit)

    async def lexical_search(self, project_id: str, query: str, limit: int) -> list[SearchHit]:
        if self.lexical_results is not None:
            return self.lexical_results
        return self._scored(project_id, limit)

    async def cache_upsert(
        self, project_id: str, entry_id: str, embedding: Sequence[float]
    ) -> None:
        self.cache[entry_id] = (project_id, list(embedding))

    async def cache_lookup(
        self, project_id: str, embedding: Sequence[float]
    ) -> tuple[str, float] | None:
        return self.cache_result

    async def cache_clear(self, project_id: str) -> None:
        self.cache.clear()
