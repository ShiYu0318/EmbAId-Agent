import re
import time
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from ..config import get_settings

WINDOW_SECONDS = 60


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if get_settings().is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _identity(self, request: Request) -> str | None:
        key = request.headers.get("x-api-key")
        if key:
            return f"key:{key[:16]}"
        if request.url.path.startswith("/auth/"):
            client = request.client
            return f"ip:{client.host}" if client else None
        return None

    def _limit_for(self, request: Request) -> int:
        settings = get_settings()
        key = request.headers.get("x-api-key", "")
        if key.startswith("sk_"):
            return settings.rate_limit_secret
        if key:
            return settings.rate_limit_publishable
        return settings.rate_limit_publishable

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        identity = self._identity(request)
        if identity is None:
            return await call_next(request)

        limit = self._limit_for(request)
        now = time.monotonic()
        window = self._hits[identity]
        while window and now - window[0] > WINDOW_SECONDS:
            window.popleft()

        if len(window) >= limit:
            retry_after = int(WINDOW_SECONDS - (now - window[0])) + 1
            return Response(
                content='{"detail":{"code":"rate_limited","message":"rate limit exceeded"}}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        window.append(now)
        return await call_next(request)


# Endpoints the embeddable widget calls from customers' websites. Any site may reach them;
# the publishable key's allowed origins (api/deps.py) decide whether the call is served.
PUBLIC_WIDGET_PATHS = re.compile(r"^/v1/(chat|widget-config|messages/[^/]+/feedback)$")


class SplitCORSMiddleware:
    """Open CORS for the widget's public endpoints, the configured origins for everything else.

    The dashboard API keeps credentialed CORS limited to CORS_ORIGINS, while the widget,
    which authenticates with an X-API-Key header and sends no cookies, works on any site.
    """

    def __init__(self, app: ASGIApp, dashboard_origins: list[str]) -> None:
        self.public = CORSMiddleware(
            app,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type", "X-API-Key", "X-App-Id"],
        )
        self.private = CORSMiddleware(
            app,
            allow_origins=dashboard_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and PUBLIC_WIDGET_PATHS.match(scope.get("path", "")):
            await self.public(scope, receive, send)
        else:
            await self.private(scope, receive, send)
