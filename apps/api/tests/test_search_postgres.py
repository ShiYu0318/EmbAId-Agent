import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from src.search.base import IndexedChunk, SearchBackend
from src.search.postgres import PostgresBackend

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set")

HOURS = "台北門市的營業時間是早上九點到晚上六點"
RETURNS = "退貨政策需要在七天內提出申請"
OTHER_PROJECT = "另一個專案的機密營業資料"


@pytest.fixture
async def backend() -> AsyncIterator[PostgresBackend]:
    engine = create_async_engine(str(TEST_DATABASE_URL))
    instance = PostgresBackend(engine=engine, dimensions=3, cache_threshold=0.95)
    await instance.ensure_schema()
    await instance.delete_project("proj_a")
    await instance.delete_project("proj_b")
    try:
        yield instance
    finally:
        await instance.delete_project("proj_a")
        await instance.delete_project("proj_b")
        await engine.dispose()


def chunk(
    chunk_id: str,
    project_id: str,
    document_id: str,
    text: str,
    embedding: list[float],
) -> IndexedChunk:
    return IndexedChunk(
        chunk_id=chunk_id,
        project_id=project_id,
        document_id=document_id,
        text=text,
        embedding=embedding,
    )


async def seed(backend: PostgresBackend) -> None:
    await backend.upsert(
        [
            chunk("c1", "proj_a", "doc_1", HOURS, [1.0, 0.0, 0.0]),
            chunk("c2", "proj_a", "doc_1", RETURNS, [0.0, 1.0, 0.0]),
            chunk("c3", "proj_b", "doc_9", OTHER_PROJECT, [1.0, 0.0, 0.0]),
        ]
    )


async def test_backend_satisfies_protocol(backend: PostgresBackend) -> None:
    assert isinstance(backend, SearchBackend)


async def test_vector_search_orders_by_similarity(backend: PostgresBackend) -> None:
    await seed(backend)

    hits = await backend.vector_search("proj_a", [0.95, 0.31, 0.0], limit=5)

    assert [hit.chunk_id for hit in hits] == ["c1", "c2"]
    assert hits[0].score > hits[1].score


async def test_lexical_search_finds_traditional_chinese_phrase(backend: PostgresBackend) -> None:
    await seed(backend)

    hits = await backend.lexical_search("proj_a", "營業時間", limit=5)

    assert [hit.chunk_id for hit in hits] == ["c1"]


async def test_search_is_isolated_per_project(backend: PostgresBackend) -> None:
    await seed(backend)

    vector_hits = await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=10)
    lexical_hits = await backend.lexical_search("proj_a", "營業", limit=10)

    assert "c3" not in [hit.chunk_id for hit in vector_hits]
    assert "c3" not in [hit.chunk_id for hit in lexical_hits]


async def test_delete_document_removes_only_that_document(backend: PostgresBackend) -> None:
    await seed(backend)

    await backend.delete_document("proj_a", "doc_1")

    assert await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=10) == []
    assert [hit.chunk_id for hit in await backend.vector_search("proj_b", [1.0, 0.0, 0.0], 10)] == [
        "c3"
    ]


async def test_delete_project_removes_all_project_data(backend: PostgresBackend) -> None:
    await seed(backend)
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    await backend.delete_project("proj_a")

    assert await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=10) == []
    assert await backend.lexical_search("proj_a", "營業時間", limit=10) == []
    assert await backend.cache_lookup("proj_a", [1.0, 0.0, 0.0]) is None


async def test_cache_lookup_hits_above_threshold(backend: PostgresBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    result = await backend.cache_lookup("proj_a", [0.99, 0.05, 0.0])

    assert result is not None
    assert result[0] == "entry_1"
    assert result[1] >= 0.95


async def test_cache_lookup_misses_below_threshold(backend: PostgresBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    assert await backend.cache_lookup("proj_a", [0.0, 1.0, 0.0]) is None


async def test_cache_is_isolated_per_project(backend: PostgresBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    assert await backend.cache_lookup("proj_b", [1.0, 0.0, 0.0]) is None


async def test_empty_index_returns_empty_results(backend: PostgresBackend) -> None:
    assert await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=5) == []
    assert await backend.lexical_search("proj_a", "營業時間", limit=5) == []
    assert await backend.cache_lookup("proj_a", [1.0, 0.0, 0.0]) is None
