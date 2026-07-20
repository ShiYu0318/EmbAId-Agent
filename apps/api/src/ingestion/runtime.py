from typing import Any

from ..db.models import Project
from ..search.base import SearchBackend
from ..storage import ObjectStorage, get_storage
from .web import PageFetcher

_overrides: dict[str, Any] = {}

_SEARCH_FACTORIES = ("get_search_backend", "build_search_backend", "search_backend")


class SearchBackendUnavailableError(RuntimeError):
    pass


def set_overrides(**values: Any) -> None:
    _overrides.update({key: value for key, value in values.items() if value is not None})


def clear_overrides() -> None:
    _overrides.clear()


def _resolve(ctx: dict[str, Any] | None, key: str) -> Any:
    value = (ctx or {}).get(key)
    return value if value is not None else _overrides.get(key)


def search_backend(ctx: dict[str, Any] | None = None) -> SearchBackend:
    backend = _resolve(ctx, "search_backend")
    if backend is not None:
        return backend

    from .. import search

    for name in _SEARCH_FACTORIES:
        factory = getattr(search, name, None)
        if callable(factory):
            return factory()

    raise SearchBackendUnavailableError(
        "no search backend is configured; inject one via ingestion.runtime.set_overrides"
    )


def embeddings(ctx: dict[str, Any] | None, project: Project) -> Any:
    override = _resolve(ctx, "embeddings")
    if override is not None:
        return override

    from ..providers.registry import build_embeddings

    return build_embeddings(project.embedding_provider, project.embedding_model)


def chat_model(ctx: dict[str, Any] | None, project: Project) -> Any | None:
    override = _resolve(ctx, "chat_model")
    if override is not None:
        return override

    from ..providers.registry import ProviderNotConfiguredError, build_chat_model

    try:
        return build_chat_model(project.chat_provider, project.chat_model, streaming=False)
    except ProviderNotConfiguredError:
        return None


def storage(ctx: dict[str, Any] | None = None) -> ObjectStorage:
    override = _resolve(ctx, "storage")
    return override if override is not None else get_storage()


def page_fetcher(ctx: dict[str, Any] | None = None) -> PageFetcher | None:
    return _resolve(ctx, "page_fetcher")


def connector_client(ctx: dict[str, Any] | None = None) -> Any | None:
    return _resolve(ctx, "connector_client")


def webhook_client(ctx: dict[str, Any] | None = None) -> Any | None:
    return _resolve(ctx, "webhook_client")
