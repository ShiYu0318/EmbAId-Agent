from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db.session import create_all, dispose_engine

MIN_SECRET_LENGTH = 32


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await create_all()
    yield
    await dispose_engine()


def verify_production_config() -> None:
    settings = get_settings()
    if not settings.is_production:
        return
    if (
        len(settings.jwt_secret) < MIN_SECRET_LENGTH
        or settings.jwt_secret == "change-me-in-production"
    ):
        raise RuntimeError("JWT_SECRET must be at least 32 characters in production")
    if "*" in settings.cors_origin_list:
        raise RuntimeError("CORS_ORIGINS must not be a wildcard in production")


def create_app() -> FastAPI:
    settings = get_settings()
    verify_production_config()

    app = FastAPI(
        title="proprAI Chat API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment)

    register_routers(app)

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "environment": settings.environment,
            "search_backend": settings.search_backend,
            "providers": {
                "anthropic": bool(settings.anthropic_api_key),
                "openai": bool(settings.openai_api_key),
                "ollama": bool(settings.ollama_base_url),
            },
        }

    return app


def register_routers(app: FastAPI) -> None:
    from .api.routers import (
        analytics,
        api_keys,
        auth,
        chat,
        conversations,
        documents,
        knowledge_gaps,
        messages,
        projects,
        sources,
        webhooks,
    )

    for module in (
        auth,
        projects,
        api_keys,
        sources,
        documents,
        chat,
        conversations,
        messages,
        knowledge_gaps,
        analytics,
        webhooks,
    ):
        app.include_router(module.router)


app = create_app()
