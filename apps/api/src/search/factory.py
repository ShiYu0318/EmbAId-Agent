from ..config import get_settings
from .base import SearchBackend

_backend: SearchBackend | None = None


def get_search_backend() -> SearchBackend:
    global _backend
    if _backend is None:
        backend = get_settings().search_backend
        if backend == "postgres":
            from .postgres import PostgresBackend

            _backend = PostgresBackend()
        elif backend == "qdrant":
            try:
                from .qdrant import QdrantBackend
            except ImportError as exc:
                raise RuntimeError(
                    "SEARCH_BACKEND=qdrant needs the qdrant extra: uv sync --extra qdrant"
                ) from exc

            _backend = QdrantBackend()
        else:
            from .sqlite_faiss import SqliteFaissBackend

            _backend = SqliteFaissBackend()
    return _backend


async def prepare_search_backend() -> None:
    """Create the backend's tables and indexes if it keeps any (pgvector does)."""
    ensure_schema = getattr(get_search_backend(), "ensure_schema", None)
    if ensure_schema is not None:
        await ensure_schema()


def set_search_backend(backend: SearchBackend | None) -> None:
    global _backend
    _backend = backend
