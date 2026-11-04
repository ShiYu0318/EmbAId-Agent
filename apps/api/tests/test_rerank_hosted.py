import httpx
import pytest

from src.config import Settings
from src.rag import rerank as rerank_module
from src.rag.rerank import rerank
from src.rag.types import RetrievalTrace, RetrievedChunk


def _chunk(chunk_id: str, content: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id="doc",
        document_title="Policy",
        document_url=None,
        content=content,
        score=0.1,
    )


@pytest.fixture
def cohere(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    monkeypatch.setattr(
        rerank_module,
        "get_settings",
        lambda: Settings(rerank_provider="cohere", cohere_api_key="co-key"),
    )
    sent: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append({"url": str(request.url), "auth": request.headers["authorization"]})
        return httpx.Response(
            200,
            json={
                "results": [
                    {"index": 1, "relevance_score": 0.91},
                    {"index": 0, "relevance_score": 0.12},
                ]
            },
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        rerank_module.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    return sent


async def test_hosted_reranker_orders_by_its_scores(cohere: list[dict]) -> None:
    chunks = [_chunk("a", "運費說明"), _chunk("b", "退貨在 21 天內申請")]
    ranked = await rerank(
        "退貨期限", chunks, RetrievalTrace(original_query="退貨期限"), model_name="x"
    )

    assert [c.chunk_id for c in ranked] == ["b", "a"]
    assert ranked[0].score == pytest.approx(0.91)
    assert cohere[0]["url"] == "https://api.cohere.com/v2/rerank"
    assert cohere[0]["auth"] == "Bearer co-key"


async def test_missing_key_keeps_the_fused_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rerank_module, "get_settings", lambda: Settings(rerank_provider="jina"))
    chunks = [_chunk("a", "x"), _chunk("b", "y")]
    ranked = await rerank("q", chunks, RetrievalTrace(original_query="q"), model_name="x")
    assert [c.chunk_id for c in ranked] == ["a", "b"]
