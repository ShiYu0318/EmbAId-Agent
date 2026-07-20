from ..config import get_settings
from .base import SearchBackend

_backend: SearchBackend | None = None


def get_search_backend() -> SearchBackend:
    global _backend
    if _backend is None:
        if get_settings().search_backend == "postgres":
            from .postgres import PostgresBackend

            _backend = PostgresBackend()
        else:
            from .sqlite_faiss import SqliteFaissBackend

            _backend = SqliteFaissBackend()
    return _backend


def set_search_backend(backend: SearchBackend | None) -> None:
    global _backend
    _backend = backend
