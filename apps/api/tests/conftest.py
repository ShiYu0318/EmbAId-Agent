import os
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 48)
os.environ.setdefault("QUEUE_ENABLED", "false")
os.environ.setdefault("SEARCH_BACKEND", "sqlite_faiss")


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
