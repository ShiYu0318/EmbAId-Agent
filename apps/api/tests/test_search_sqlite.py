from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from src.search.base import IndexedChunk, SearchBackend
from src.search.factory import get_search_backend, set_search_backend
from src.search.sqlite_faiss import SqliteFaissBackend

HOURS = "台北門市的營業時間是早上九點到晚上六點"
RETURNS = "退貨政策需要在七天內提出申請"
OTHER_PROJECT = "另一個專案的機密營業資料"


@pytest.fixture
async def backend(tmp_path: Path) -> AsyncIterator[SqliteFaissBackend]:
    instance = SqliteFaissBackend(index_dir=tmp_path / "indices", cache_threshold=0.95)
    yield instance
    await instance.aclose()


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


async def seed(backend: SqliteFaissBackend) -> None:
    await backend.upsert(
        [
            chunk("c1", "proj_a", "doc_1", HOURS, [1.0, 0.0, 0.0]),
            chunk("c2", "proj_a", "doc_1", RETURNS, [0.0, 1.0, 0.0]),
            chunk("c3", "proj_b", "doc_9", OTHER_PROJECT, [1.0, 0.0, 0.0]),
        ]
    )


async def test_vector_search_orders_by_similarity(backend: SqliteFaissBackend) -> None:
    await seed(backend)

    hits = await backend.vector_search("proj_a", [0.95, 0.31, 0.0], limit=5)

    assert [hit.chunk_id for hit in hits] == ["c1", "c2"]
    assert hits[0].score > hits[1].score
    assert [hit.rank for hit in hits] == [1, 2]
    assert hits[0].document_id == "doc_1"


async def test_vector_search_respects_limit(backend: SqliteFaissBackend) -> None:
    await seed(backend)

    hits = await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=1)

    assert [hit.chunk_id for hit in hits] == ["c1"]


async def test_upsert_replaces_existing_chunk(backend: SqliteFaissBackend) -> None:
    await seed(backend)
    await backend.upsert([chunk("c1", "proj_a", "doc_1", HOURS, [0.0, 0.0, 1.0])])

    hits = await backend.vector_search("proj_a", [0.0, 0.0, 1.0], limit=5)

    assert hits[0].chunk_id == "c1"
    assert hits[0].score == pytest.approx(1.0, abs=1e-5)
    assert [hit.chunk_id for hit in hits].count("c1") == 1


async def test_lexical_search_finds_traditional_chinese_phrase(
    backend: SqliteFaissBackend,
) -> None:
    await seed(backend)

    hits = await backend.lexical_search("proj_a", "營業時間", limit=5)

    assert [hit.chunk_id for hit in hits] == ["c1"]
    assert hits[0].rank == 1


async def test_lexical_search_returns_nothing_for_unknown_terms(
    backend: SqliteFaissBackend,
) -> None:
    await seed(backend)

    assert await backend.lexical_search("proj_a", "宇宙飛船", limit=5) == []


async def test_vector_search_is_isolated_per_project(backend: SqliteFaissBackend) -> None:
    await seed(backend)

    hits = await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=10)

    assert "c3" not in [hit.chunk_id for hit in hits]


async def test_lexical_search_is_isolated_per_project(backend: SqliteFaissBackend) -> None:
    await seed(backend)

    hits = await backend.lexical_search("proj_a", "營業", limit=10)

    assert [hit.chunk_id for hit in hits] == ["c1"]
    assert await backend.lexical_search("proj_b", "營業", limit=10) != []


async def test_unknown_project_sees_nothing(backend: SqliteFaissBackend) -> None:
    await seed(backend)

    assert await backend.vector_search("proj_c", [1.0, 0.0, 0.0], limit=10) == []
    assert await backend.lexical_search("proj_c", "營業時間", limit=10) == []


async def test_delete_document_removes_only_that_document(backend: SqliteFaissBackend) -> None:
    await seed(backend)
    await backend.upsert([chunk("c4", "proj_a", "doc_2", HOURS, [0.0, 0.0, 1.0])])

    await backend.delete_document("proj_a", "doc_1")

    remaining = await backend.vector_search("proj_a", [0.0, 0.0, 1.0], limit=10)
    assert [hit.chunk_id for hit in remaining] == ["c4"]
    assert await backend.lexical_search("proj_a", "退貨政策", limit=10) == []
    assert [hit.chunk_id for hit in await backend.vector_search("proj_b", [1.0, 0.0, 0.0], 10)] == [
        "c3"
    ]


async def test_delete_project_removes_all_project_data(backend: SqliteFaissBackend) -> None:
    await seed(backend)
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    await backend.delete_project("proj_a")

    assert await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=10) == []
    assert await backend.lexical_search("proj_a", "營業時間", limit=10) == []
    assert await backend.cache_lookup("proj_a", [1.0, 0.0, 0.0]) is None
    assert [hit.chunk_id for hit in await backend.vector_search("proj_b", [1.0, 0.0, 0.0], 10)] == [
        "c3"
    ]


async def test_cache_lookup_hits_above_threshold(backend: SqliteFaissBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    result = await backend.cache_lookup("proj_a", [0.99, 0.05, 0.0])

    assert result is not None
    entry_id, similarity = result
    assert entry_id == "entry_1"
    assert similarity >= 0.95


async def test_cache_lookup_misses_below_threshold(backend: SqliteFaissBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    assert await backend.cache_lookup("proj_a", [0.0, 1.0, 0.0]) is None


async def test_cache_is_isolated_per_project(backend: SqliteFaissBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    assert await backend.cache_lookup("proj_b", [1.0, 0.0, 0.0]) is None


async def test_cache_clear_removes_entries(backend: SqliteFaissBackend) -> None:
    await backend.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])

    await backend.cache_clear("proj_a")

    assert await backend.cache_lookup("proj_a", [1.0, 0.0, 0.0]) is None


async def test_empty_index_returns_empty_results(backend: SqliteFaissBackend) -> None:
    assert await backend.vector_search("proj_a", [1.0, 0.0, 0.0], limit=5) == []
    assert await backend.lexical_search("proj_a", "營業時間", limit=5) == []
    assert await backend.cache_lookup("proj_a", [1.0, 0.0, 0.0]) is None
    await backend.delete_document("proj_a", "doc_1")
    await backend.delete_project("proj_a")
    await backend.upsert([])


async def test_search_with_mismatched_dimensions_returns_empty(
    backend: SqliteFaissBackend,
) -> None:
    await seed(backend)

    assert await backend.vector_search("proj_a", [1.0, 0.0], limit=5) == []


async def test_index_is_persisted_across_instances(tmp_path: Path) -> None:
    index_dir = tmp_path / "indices"
    writer = SqliteFaissBackend(index_dir=index_dir, cache_threshold=0.95)
    await seed(writer)
    await writer.cache_upsert("proj_a", "entry_1", [1.0, 0.0, 0.0])
    await writer.aclose()

    reader = SqliteFaissBackend(index_dir=index_dir, cache_threshold=0.95)
    try:
        vector_hits = await reader.vector_search("proj_a", [1.0, 0.0, 0.0], limit=5)
        lexical_hits = await reader.lexical_search("proj_a", "營業時間", limit=5)
        cached = await reader.cache_lookup("proj_a", [1.0, 0.0, 0.0])
    finally:
        await reader.aclose()

    assert vector_hits[0].chunk_id == "c1"
    assert [hit.chunk_id for hit in lexical_hits] == ["c1"]
    assert cached is not None and cached[0] == "entry_1"


async def test_backend_satisfies_protocol(backend: SqliteFaissBackend) -> None:
    assert isinstance(backend, SearchBackend)


async def test_factory_returns_injected_backend(backend: SqliteFaissBackend) -> None:
    set_search_backend(backend)
    try:
        assert get_search_backend() is backend
    finally:
        set_search_backend(None)


async def test_factory_defaults_to_sqlite_backend_and_caches() -> None:
    set_search_backend(None)
    try:
        first = get_search_backend()
        assert isinstance(first, SqliteFaissBackend)
        assert get_search_backend() is first
    finally:
        set_search_backend(None)
