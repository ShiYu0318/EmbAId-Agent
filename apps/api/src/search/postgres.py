import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from ..config import get_settings
from ..rag.text import lexical_query, tokenize
from .base import IndexedChunk, SearchHit

_CHUNK_TABLE = "search_chunks"
_CACHE_TABLE = "search_cache"


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def _tsquery(query: str) -> str:
    escaped = [token.replace("'", "''") for token in tokenize(query)]
    return " | ".join(f"'{token}'" for token in escaped)


class PostgresBackend:
    def __init__(
        self,
        engine: AsyncEngine | None = None,
        dimensions: int | None = None,
        cache_threshold: float | None = None,
    ) -> None:
        settings = get_settings()
        self._engine = engine
        self._dim = int(dimensions if dimensions is not None else settings.embedding_dimensions)
        self._threshold = (
            settings.semantic_cache_threshold if cache_threshold is None else cache_threshold
        )

    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            from ..db.session import get_engine

            self._engine = get_engine()
        return self._engine

    async def ensure_schema(self) -> None:
        statements = [
            "CREATE EXTENSION IF NOT EXISTS vector",
            f"""
            CREATE TABLE IF NOT EXISTS {_CHUNK_TABLE} (
                chunk_id text PRIMARY KEY,
                project_id text NOT NULL,
                document_id text NOT NULL,
                content text NOT NULL DEFAULT '',
                tokens text NOT NULL DEFAULT '',
                trust_score double precision NOT NULL DEFAULT 1.0,
                metadata jsonb NOT NULL DEFAULT '{{}}'::jsonb,
                embedding vector({self._dim}) NOT NULL,
                tokens_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', tokens)) STORED
            )
            """,
            f"CREATE INDEX IF NOT EXISTS {_CHUNK_TABLE}_project_idx"
            f" ON {_CHUNK_TABLE} (project_id)",
            f"CREATE INDEX IF NOT EXISTS {_CHUNK_TABLE}_document_idx"
            f" ON {_CHUNK_TABLE} (project_id, document_id)",
            f"CREATE INDEX IF NOT EXISTS {_CHUNK_TABLE}_tsv_idx"
            f" ON {_CHUNK_TABLE} USING gin (tokens_tsv)",
            f"""
            CREATE TABLE IF NOT EXISTS {_CACHE_TABLE} (
                entry_id text PRIMARY KEY,
                project_id text NOT NULL,
                embedding vector({self._dim}) NOT NULL
            )
            """,
            f"CREATE INDEX IF NOT EXISTS {_CACHE_TABLE}_project_idx"
            f" ON {_CACHE_TABLE} (project_id)",
        ]
        async with self.engine.begin() as conn:
            for statement in statements:
                await conn.execute(text(statement))

        await self._ensure_vector_index(f"{_CHUNK_TABLE}_embedding_idx", _CHUNK_TABLE)
        await self._ensure_vector_index(f"{_CACHE_TABLE}_embedding_idx", _CACHE_TABLE)

    async def _ensure_vector_index(self, name: str, table: str) -> None:
        for method in ("hnsw", "ivfflat"):
            try:
                async with self.engine.begin() as conn:
                    await conn.execute(
                        text(
                            f"CREATE INDEX IF NOT EXISTS {name} ON {table}"
                            f" USING {method} (embedding vector_cosine_ops)"
                        )
                    )
                return
            except Exception:
                continue

    async def upsert(self, chunks: list[IndexedChunk]) -> None:
        if not chunks:
            return
        statement = text(
            f"INSERT INTO {_CHUNK_TABLE}"
            " (chunk_id, project_id, document_id, content, tokens, trust_score,"
            " metadata, embedding)"
            " VALUES (:chunk_id, :project_id, :document_id, :content, :tokens, :trust_score,"
            " CAST(:metadata AS jsonb), CAST(:embedding AS vector))"
            " ON CONFLICT (chunk_id) DO UPDATE SET"
            " project_id = EXCLUDED.project_id,"
            " document_id = EXCLUDED.document_id,"
            " content = EXCLUDED.content,"
            " tokens = EXCLUDED.tokens,"
            " trust_score = EXCLUDED.trust_score,"
            " metadata = EXCLUDED.metadata,"
            " embedding = EXCLUDED.embedding"
        )
        params = [
            {
                "chunk_id": chunk.chunk_id,
                "project_id": chunk.project_id,
                "document_id": chunk.document_id,
                "content": chunk.text,
                "tokens": lexical_query(chunk.text),
                "trust_score": chunk.trust_score,
                "metadata": json.dumps(chunk.metadata, ensure_ascii=False),
                "embedding": _vector_literal(chunk.embedding),
            }
            for chunk in chunks
        ]
        async with self.engine.begin() as conn:
            await conn.execute(statement, params)

    async def delete_document(self, project_id: str, document_id: str) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(
                text(
                    f"DELETE FROM {_CHUNK_TABLE}"
                    " WHERE project_id = :project_id AND document_id = :document_id"
                ),
                {"project_id": project_id, "document_id": document_id},
            )

    async def delete_project(self, project_id: str) -> None:
        async with self.engine.begin() as conn:
            for table in (_CHUNK_TABLE, _CACHE_TABLE):
                await conn.execute(
                    text(f"DELETE FROM {table} WHERE project_id = :project_id"),
                    {"project_id": project_id},
                )

    async def vector_search(
        self, project_id: str, embedding: list[float], limit: int
    ) -> list[SearchHit]:
        if limit <= 0:
            return []
        async with self.engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT chunk_id, document_id,"
                    " 1 - (embedding <=> CAST(:embedding AS vector)) AS score"
                    f" FROM {_CHUNK_TABLE} WHERE project_id = :project_id"
                    " ORDER BY embedding <=> CAST(:embedding AS vector) LIMIT :limit"
                ),
                {
                    "embedding": _vector_literal(embedding),
                    "project_id": project_id,
                    "limit": limit,
                },
            )
            rows = result.all()
        return [
            SearchHit(chunk_id=row[0], document_id=row[1], score=float(row[2]), rank=rank)
            for rank, row in enumerate(rows, start=1)
        ]

    async def lexical_search(self, project_id: str, query: str, limit: int) -> list[SearchHit]:
        expression = _tsquery(query)
        if not expression or limit <= 0:
            return []
        async with self.engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT chunk_id, document_id, ts_rank(tokens_tsv, query) AS score"
                    f" FROM {_CHUNK_TABLE}, to_tsquery('simple', :expression) AS query"
                    " WHERE project_id = :project_id AND tokens_tsv @@ query"
                    " ORDER BY score DESC LIMIT :limit"
                ),
                {"expression": expression, "project_id": project_id, "limit": limit},
            )
            rows = result.all()
        return [
            SearchHit(chunk_id=row[0], document_id=row[1], score=float(row[2]), rank=rank)
            for rank, row in enumerate(rows, start=1)
        ]

    async def cache_upsert(self, project_id: str, entry_id: str, embedding: list[float]) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(
                text(
                    f"INSERT INTO {_CACHE_TABLE} (entry_id, project_id, embedding)"
                    " VALUES (:entry_id, :project_id, CAST(:embedding AS vector))"
                    " ON CONFLICT (entry_id) DO UPDATE SET"
                    " project_id = EXCLUDED.project_id, embedding = EXCLUDED.embedding"
                ),
                {
                    "entry_id": entry_id,
                    "project_id": project_id,
                    "embedding": _vector_literal(embedding),
                },
            )

    async def cache_lookup(
        self, project_id: str, embedding: list[float]
    ) -> tuple[str, float] | None:
        async with self.engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT entry_id, 1 - (embedding <=> CAST(:embedding AS vector)) AS similarity"
                    f" FROM {_CACHE_TABLE} WHERE project_id = :project_id"
                    " ORDER BY embedding <=> CAST(:embedding AS vector) LIMIT 1"
                ),
                {"embedding": _vector_literal(embedding), "project_id": project_id},
            )
            row = result.first()
        if row is None:
            return None
        similarity = float(row[1])
        if similarity < self._threshold:
            return None
        return str(row[0]), similarity

    async def cache_clear(self, project_id: str) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(
                text(f"DELETE FROM {_CACHE_TABLE} WHERE project_id = :project_id"),
                {"project_id": project_id},
            )
