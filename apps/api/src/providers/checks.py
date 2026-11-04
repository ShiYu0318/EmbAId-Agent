"""Startup check: does EMBEDDING_DIMENSIONS match what the embedding model really returns?

A wrong value only shows up later as a failed upload ("expected N dimensions"), so the API
measures the default embedding model once at startup and reports the result in /health.
"""

import asyncio
import logging
from typing import Any

from ..config import Settings, get_settings
from .registry import build_embeddings

logger = logging.getLogger(__name__)
TIMEOUT_SECONDS = 20

_result: dict[str, Any] = {"status": "pending"}


def embedding_check() -> dict[str, Any]:
    return dict(_result)


async def check_embedding_dimensions(settings: Settings | None = None) -> dict[str, Any]:
    global _result
    settings = settings or get_settings()
    result: dict[str, Any] = {
        "provider": settings.default_embedding_provider,
        "model": settings.default_embedding_model,
        "configured_dimensions": settings.embedding_dimensions,
    }
    try:
        embeddings = build_embeddings(
            settings.default_embedding_provider, settings.default_embedding_model
        )
        vector = await asyncio.wait_for(
            embeddings.aembed_query("dimension check"), timeout=TIMEOUT_SECONDS
        )
    except Exception as exc:  # unreachable provider, missing key, unknown model...
        result.update(status="unavailable", detail=f"{type(exc).__name__}: {exc}"[:300])
        _result = result
        return result

    actual = len(vector)
    result["actual_dimensions"] = actual
    if actual == settings.embedding_dimensions:
        result["status"] = "ok"
    else:
        result["status"] = "mismatch"
        # Only the pgvector column has a fixed size; FAISS adapts to the vectors it gets.
        if settings.search_backend == "postgres":
            logger.warning(
                "EMBEDDING_DIMENSIONS=%s but %s returns %s-dimensional vectors; "
                "set EMBEDDING_DIMENSIONS=%s or uploads will fail",
                settings.embedding_dimensions,
                settings.default_embedding_model,
                actual,
                actual,
            )
    _result = result
    return result
