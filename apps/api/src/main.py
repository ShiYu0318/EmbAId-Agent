from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from .api.middleware import RateLimitMiddleware, SecurityHeadersMiddleware, SplitCORSMiddleware
from .config import get_settings
from .db.session import create_all, dispose_engine
from .providers.registry import provider_status
from .search.factory import prepare_search_backend

MIN_SECRET_LENGTH = 32

API_ROOT = Path(__file__).resolve().parents[1]


def widget_bundle() -> Path | None:
    """Find the built widget: explicit path, then the Docker image copy, then the monorepo."""
    configured = get_settings().widget_bundle_path
    candidates = [Path(configured)] if configured else []
    candidates += [
        API_ROOT / "static" / "widget.js",
        API_ROOT.parent / "widget" / "dist" / "widget.js",
    ]
    return next((path for path in candidates if path.is_file()), None)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await create_all()
    await prepare_search_backend()
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
        title="EmbAId Agent API",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        SplitCORSMiddleware,
        dashboard_origins=settings.cors_origin_list,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)

    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment)

    register_routers(app)

    # Self-hosted installs serve the embeddable widget themselves, so an embed snippet only
    # ever points at the operator's own API and never at a third-party CDN.
    @app.get("/widget.js", tags=["system"], include_in_schema=False)
    async def widget_script() -> FileResponse:
        bundle = widget_bundle()
        if bundle is None:
            raise HTTPException(
                status_code=404,
                detail="widget.js has not been built: run `pnpm --filter @embaid/widget build`",
            )
        return FileResponse(
            bundle,
            media_type="application/javascript",
            headers={"Cache-Control": "public, max-age=300"},
        )

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "environment": settings.environment,
            "search_backend": settings.search_backend,
            "providers": provider_status(settings),
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
