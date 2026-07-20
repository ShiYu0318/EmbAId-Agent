import asyncio
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import aiosqlite
import faiss
import numpy as np

from ..config import get_settings
from ..rag.text import lexical_query, tokenize
from .base import IndexedChunk, SearchHit

_UNSAFE = re.compile(r"[^A-Za-z0-9_-]")

_FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
    chunk_id UNINDEXED,
    project_id UNINDEXED,
    document_id UNINDEXED,
    tokens,
    tokenize='unicode61'
)
"""


def _slug(project_id: str) -> str:
    digest = hashlib.sha256(project_id.encode("utf-8")).hexdigest()[:12]
    return f"{_UNSAFE.sub('_', project_id)[:48]}-{digest}"


def _match_expression(query: str) -> str:
    escaped = [token.replace('"', '""') for token in tokenize(query)]
    return " OR ".join(f'"{token}"' for token in escaped)


class _VectorStore:
    """FAISS IndexIDMap2 over IndexFlatIP with a JSON sidecar holding the key <-> int64 map."""

    def __init__(self, index_path: Path, meta_path: Path) -> None:
        self.index_path = index_path
        self.meta_path = meta_path
        self._index: faiss.Index | None = None
        self._dim = 0
        self._next_id = 1
        self._ids: dict[str, int] = {}
        self._groups: dict[str, str] = {}
        self._loaded = False

    def _reset(self) -> None:
        self._index = None
        self._dim = 0
        self._next_id = 1
        self._ids = {}
        self._groups = {}

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        if not (self.index_path.exists() and self.meta_path.exists()):
            return
        try:
            meta: dict[str, Any] = json.loads(self.meta_path.read_text(encoding="utf-8"))
            index = faiss.read_index(str(self.index_path))
        except Exception:
            self._reset()
            return
        self._index = index
        self._dim = int(meta.get("dim", 0))
        self._next_id = int(meta.get("next_id", 1))
        self._ids = {key: int(value) for key, value in meta.get("ids", {}).items()}
        self._groups = dict(meta.get("groups", {}))

    def _save(self) -> None:
        if self._index is None:
            return
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(self._index, str(self.index_path))
        payload = {
            "dim": self._dim,
            "next_id": self._next_id,
            "ids": self._ids,
            "groups": self._groups,
        }
        self.meta_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def _drop(self, keys: list[str]) -> int:
        removable = [self._ids[key] for key in keys if key in self._ids]
        if not removable or self._index is None:
            return 0
        self._index.remove_ids(np.asarray(removable, dtype="int64"))
        for key in keys:
            self._ids.pop(key, None)
            self._groups.pop(key, None)
        return len(removable)

    def add(self, items: list[tuple[str, str | None, list[float]]]) -> None:
        self._load()
        if not items:
            return
        dim = len(items[0][2])
        if dim == 0:
            return
        if self._index is None:
            self._dim = dim
            self._index = faiss.IndexIDMap2(faiss.IndexFlatIP(dim))
        if dim != self._dim:
            raise ValueError(
                f"embedding dimension {dim} does not match index dimension {self._dim}"
            )

        self._drop([key for key, _, _ in items])
        vectors = np.asarray([embedding for _, _, embedding in items], dtype="float32")
        faiss.normalize_L2(vectors)
        assigned: list[int] = []
        for key, group, _ in items:
            assigned.append(self._next_id)
            self._ids[key] = self._next_id
            if group is not None:
                self._groups[key] = group
            self._next_id += 1
        self._index.add_with_ids(vectors, np.asarray(assigned, dtype="int64"))
        self._save()

    def remove_group(self, group: str) -> None:
        self._load()
        keys = [key for key, value in self._groups.items() if value == group]
        if self._drop(keys):
            self._save()

    def search(self, embedding: list[float], limit: int) -> list[tuple[str, str | None, float]]:
        self._load()
        if self._index is None or self._index.ntotal == 0 or limit <= 0:
            return []
        if len(embedding) != self._dim:
            return []
        query = np.asarray([embedding], dtype="float32")
        faiss.normalize_L2(query)
        scores, ids = self._index.search(query, min(limit, self._index.ntotal))
        reverse = {value: key for key, value in self._ids.items()}
        hits: list[tuple[str, str | None, float]] = []
        for score, raw_id in zip(scores[0], ids[0], strict=True):
            if raw_id == -1:
                continue
            key = reverse.get(int(raw_id))
            if key is None:
                continue
            hits.append((key, self._groups.get(key), float(score)))
        return hits

    def clear(self) -> None:
        self._loaded = True
        self._reset()
        self.index_path.unlink(missing_ok=True)
        self.meta_path.unlink(missing_ok=True)


class SqliteFaissBackend:
    def __init__(
        self,
        index_dir: str | Path | None = None,
        cache_threshold: float | None = None,
    ) -> None:
        settings = get_settings()
        self._dir = Path(index_dir if index_dir is not None else settings.faiss_index_dir)
        self._threshold = (
            settings.semantic_cache_threshold if cache_threshold is None else cache_threshold
        )
        self._lock = asyncio.Lock()
        self._stores: dict[str, _VectorStore] = {}
        self._connection: aiosqlite.Connection | None = None

    def _store(self, project_id: str, kind: str) -> _VectorStore:
        key = f"{kind}:{project_id}"
        store = self._stores.get(key)
        if store is None:
            slug = _slug(project_id)
            suffix = "" if kind == "chunks" else f".{kind}"
            store = _VectorStore(
                self._dir / f"{slug}{suffix}.faiss",
                self._dir / f"{slug}{suffix}.json",
            )
            self._stores[key] = store
        return store

    async def _db(self) -> aiosqlite.Connection:
        if self._connection is None:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._connection = await aiosqlite.connect(self._dir / "lexical.sqlite")
            await self._connection.execute(_FTS_SCHEMA)
            await self._connection.commit()
        return self._connection

    async def aclose(self) -> None:
        async with self._lock:
            if self._connection is not None:
                await self._connection.close()
                self._connection = None

    async def upsert(self, chunks: list[IndexedChunk]) -> None:
        if not chunks:
            return
        async with self._lock:
            grouped: dict[str, list[IndexedChunk]] = defaultdict(list)
            for chunk in chunks:
                grouped[chunk.project_id].append(chunk)

            for project_id, project_chunks in grouped.items():
                items = [
                    (chunk.chunk_id, chunk.document_id, chunk.embedding) for chunk in project_chunks
                ]
                await asyncio.to_thread(self._store(project_id, "chunks").add, items)

            db = await self._db()
            await db.executemany(
                "DELETE FROM chunk_fts WHERE chunk_id = ?",
                [(chunk.chunk_id,) for chunk in chunks],
            )
            await db.executemany(
                "INSERT INTO chunk_fts (chunk_id, project_id, document_id, tokens)"
                " VALUES (?, ?, ?, ?)",
                [
                    (
                        chunk.chunk_id,
                        chunk.project_id,
                        chunk.document_id,
                        lexical_query(chunk.text),
                    )
                    for chunk in chunks
                ],
            )
            await db.commit()

    async def delete_document(self, project_id: str, document_id: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._store(project_id, "chunks").remove_group, document_id)
            db = await self._db()
            await db.execute(
                "DELETE FROM chunk_fts WHERE project_id = ? AND document_id = ?",
                (project_id, document_id),
            )
            await db.commit()

    async def delete_project(self, project_id: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._store(project_id, "chunks").clear)
            await asyncio.to_thread(self._store(project_id, "cache").clear)
            db = await self._db()
            await db.execute("DELETE FROM chunk_fts WHERE project_id = ?", (project_id,))
            await db.commit()

    async def vector_search(
        self, project_id: str, embedding: list[float], limit: int
    ) -> list[SearchHit]:
        async with self._lock:
            matches = await asyncio.to_thread(
                self._store(project_id, "chunks").search, embedding, limit
            )
        return [
            SearchHit(chunk_id=chunk_id, document_id=document_id or "", score=score, rank=rank)
            for rank, (chunk_id, document_id, score) in enumerate(matches, start=1)
        ]

    async def lexical_search(self, project_id: str, query: str, limit: int) -> list[SearchHit]:
        expression = _match_expression(query)
        if not expression or limit <= 0:
            return []
        async with self._lock:
            db = await self._db()
            try:
                cursor = await db.execute(
                    "SELECT chunk_id, document_id, -bm25(chunk_fts) AS score FROM chunk_fts"
                    " WHERE chunk_fts MATCH ? AND project_id = ?"
                    " ORDER BY score DESC LIMIT ?",
                    (expression, project_id, limit),
                )
            except aiosqlite.OperationalError:
                return []
            rows = await cursor.fetchall()
            await cursor.close()
        return [
            SearchHit(chunk_id=row[0], document_id=row[1], score=float(row[2]), rank=rank)
            for rank, row in enumerate(rows, start=1)
        ]

    async def cache_upsert(self, project_id: str, entry_id: str, embedding: list[float]) -> None:
        async with self._lock:
            await asyncio.to_thread(
                self._store(project_id, "cache").add, [(entry_id, None, embedding)]
            )

    async def cache_lookup(
        self, project_id: str, embedding: list[float]
    ) -> tuple[str, float] | None:
        async with self._lock:
            matches = await asyncio.to_thread(self._store(project_id, "cache").search, embedding, 1)
        if not matches:
            return None
        entry_id, _, similarity = matches[0]
        if similarity < self._threshold:
            return None
        return entry_id, similarity

    async def cache_clear(self, project_id: str) -> None:
        async with self._lock:
            await asyncio.to_thread(self._store(project_id, "cache").clear)
