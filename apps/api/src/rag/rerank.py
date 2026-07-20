import asyncio
import logging
import math
import time
from typing import Any

from .timing import elapsed_ms
from .types import RetrievalTrace, RetrievedChunk

logger = logging.getLogger(__name__)

_ENCODER_CACHE: dict[str, Any] = {}


def _import_cross_encoder() -> Any:
    from sentence_transformers import CrossEncoder

    return CrossEncoder


def _load_encoder(model_name: str) -> Any:
    """Return a cross-encoder, or None when the optional extra is unavailable.

    A failed load is cached so the warning is emitted only once per model.
    """
    if model_name in _ENCODER_CACHE:
        return _ENCODER_CACHE[model_name]
    try:
        encoder = _import_cross_encoder()(model_name)
    except Exception as exc:
        logger.info(
            "reranker unavailable for model %s (%s); keeping fused order. "
            "Install the 'rerank' extra to enable it.",
            model_name,
            exc,
        )
        _ENCODER_CACHE[model_name] = None
        return None
    _ENCODER_CACHE[model_name] = encoder
    return encoder


def _sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exponential = math.exp(value)
    return exponential / (1.0 + exponential)


async def rerank(
    query: str,
    chunks: list[RetrievedChunk],
    trace: RetrievalTrace,
    *,
    model_name: str,
    enabled: bool = True,
) -> list[RetrievedChunk]:
    if not enabled or not chunks:
        return chunks

    started = time.perf_counter()
    encoder = await asyncio.to_thread(_load_encoder, model_name)
    if encoder is None:
        return chunks

    pairs = [(query, chunk.content) for chunk in chunks]
    try:
        raw_scores = await asyncio.to_thread(encoder.predict, pairs)
    except Exception as exc:
        logger.warning("reranking failed (%s); keeping fused order", exc)
        return chunks

    for chunk, raw in zip(chunks, raw_scores, strict=False):
        chunk.rerank_score = _sigmoid(float(raw))
        chunk.score = chunk.rerank_score

    ranked = sorted(chunks, key=lambda chunk: chunk.score, reverse=True)
    trace.timings_ms["rerank"] = elapsed_ms(started)
    trace.reranked_hits = [
        {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "rerank_score": chunk.rerank_score,
        }
        for chunk in ranked
    ]
    return ranked
