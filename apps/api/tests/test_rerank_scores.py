import pytest

from src.rag import rerank as rerank_module
from src.rag.types import RetrievalTrace, RetrievedChunk


class FakeEncoder:
    def __init__(self, scores: list[float]) -> None:
        self.scores = scores

    def predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        return self.scores[: len(pairs)]


def chunk(chunk_id: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id="doc",
        document_title="Doc",
        document_url=None,
        content=f"content of {chunk_id}",
        score=0.1,
    )


async def run(monkeypatch: pytest.MonkeyPatch, scores: list[float]) -> list[RetrievedChunk]:
    monkeypatch.setattr(rerank_module, "_ENCODER_CACHE", {"model": FakeEncoder(scores)})
    chunks = [chunk(f"c{index}") for index in range(len(scores))]
    trace = RetrievalTrace(original_query="question")
    return await rerank_module.rerank("question", chunks, trace, model_name="model")


async def test_probabilities_from_the_encoder_are_kept_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ranked = await run(monkeypatch, [0.0, 0.7767, 0.02])

    assert [item.chunk_id for item in ranked] == ["c1", "c2", "c0"]
    assert [item.rerank_score for item in ranked] == [0.7767, 0.02, 0.0]


async def test_irrelevant_passages_score_below_a_default_confidence_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ranked = await run(monkeypatch, [0.01, 0.03])

    assert max(item.score for item in ranked) < 0.35


async def test_raw_logits_are_converted_to_probabilities(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ranked = await run(monkeypatch, [-6.0, 4.0, 0.0])

    assert [item.chunk_id for item in ranked] == ["c1", "c2", "c0"]
    assert ranked[0].rerank_score == pytest.approx(0.982, abs=1e-3)
    assert ranked[1].rerank_score == pytest.approx(0.5)
    assert ranked[2].rerank_score == pytest.approx(0.0025, abs=1e-4)
