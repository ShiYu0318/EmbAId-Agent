import os
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    from src.config import Settings, get_settings

    # Developer credentials and persistent databases must never configure unit tests.
    # Explicit _env_file fixtures and TEST_DATABASE_URL integration tests still work.
    setting_names = {name.casefold() for name in Settings.model_fields}
    for name in list(os.environ):
        if name.casefold() in setting_names:
            monkeypatch.delenv(name)
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET", "test-secret-" + "0" * 48)
    monkeypatch.setenv("QUEUE_ENABLED", "false")
    monkeypatch.setenv("SEARCH_BACKEND", "sqlite_faiss")
    monkeypatch.setenv("RERANK_ENABLED", "false")
    monkeypatch.setenv("CONTEXTUAL_EMBEDDING_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def app() -> AsyncIterator[FastAPI]:
    from src.db import session as session_module
    from src.main import create_app

    await session_module.dispose_engine()
    application = create_app()
    await session_module.create_all()
    yield application
    await session_module.dispose_engine()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


@pytest.fixture
async def authed_client(client: AsyncClient) -> AsyncClient:
    response = await client.post(
        "/auth/signup",
        json={"email": "owner@example.com", "password": "sup3r-secret-pass"},
    )
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client
