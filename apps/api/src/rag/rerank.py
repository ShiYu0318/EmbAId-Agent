import asyncio
import logging
import math
import time
from typing import Any

import httpx

from ..config import get_settings
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


# Hosted rerankers share one request shape: {model, query, documents, top_n} in, a list of
# {index, relevance_score} out.
HOSTED_RERANKERS: dict[str, tuple[str, str, str]] = {
    # provider: (endpoint, key setting, default model)
    "cohere": ("https://api.cohere.com/v2/rerank", "cohere_api_key", "rerank-v3.5"),
    "jina": ("https://api.jina.ai/v1/rerank", "jina_api_key", "jina-reranker-v2-base-multilingual"),
}


async def _hosted_scores(provider: str, query: str, documents: list[str]) -> list[float] | None:
    """Relevance per document from a hosted reranker, or None to keep the fused order."""
    settings = get_settings()
    endpoint, key_setting, default_model = HOSTED_RERANKERS[provider]
    key = getattr(settings, key_setting)
    if not key:
        logger.warning(
            "RERANK_PROVIDER=%s but %s is not set; keeping fused order", provider, key_setting
        )
        return None
    payload = {
        "model": settings.rerank_api_model or default_model,
        "query": query,
        "documents": documents,
        "top_n": len(documents),
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                endpoint, json=payload, headers={"Authorization": f"Bearer {key}"}
            )
            response.raise_for_status()
            results = response.json()["results"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.warning("%s reranking failed (%s); keeping fused order", provider, exc)
        return None
    scores = [0.0] * len(documents)
    for item in results:
        index = int(item["index"])
        if 0 <= index < len(scores):
            scores[index] = min(1.0, max(0.0, float(item["relevance_score"])))
    return scores


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
    provider = get_settings().rerank_provider
    if provider in HOSTED_RERANKERS:
        scores = await _hosted_scores(provider, query, [chunk.content for chunk in chunks])
        if scores is None:
            return chunks
    else:
        encoder = await asyncio.to_thread(_load_encoder, model_name)
        if encoder is None:
            return chunks
        pairs = [(query, chunk.content) for chunk in chunks]
        try:
            raw_scores = await asyncio.to_thread(encoder.predict, pairs)
        except Exception as exc:
            logger.warning("reranking failed (%s); keeping fused order", exc)
            return chunks
        scores = [_sigmoid(float(raw)) for raw in raw_scores]

    for chunk, score in zip(chunks, scores, strict=False):
        chunk.rerank_score = score
        chunk.score = score

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
