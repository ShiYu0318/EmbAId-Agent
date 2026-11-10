import re

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from ..config import get_settings
from ..security.rate_limit import SlidingWindowLimiter, key_identity
from ..security.rate_limit import limiter as shared_limiter

# The API only serves JSON, an event stream and one script, so its own responses may
# load nothing. The interactive docs pull their assets from a CDN and are left alone.
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
DOCS_PATHS = ("/docs", "/redoc")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        path = request.url.path
        if not path.startswith(DOCS_PATHS):
            response.headers.setdefault("Content-Security-Policy", API_CSP)
        response.headers.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        if path.startswith("/auth/"):
            response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if get_settings().is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


def _rate_limited(retry_after: int) -> Response:
    return Response(
        content='{"detail":{"code":"rate_limited","message":"rate limit exceeded"}}',
        status_code=429,
        media_type="application/json",
        headers={"Retry-After": str(retry_after)},
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Three sliding windows: per API key, per client address, and per address on /auth/.

    A key's own ``rate_limit_per_minute`` is registered by ``api.deps.key_context`` once
    the key has been verified; until then the default for its type applies. The address
    ceiling stops a client from minting fresh buckets with made-up keys.
    """

    def __init__(self, app: ASGIApp, limiter: SlidingWindowLimiter | None = None) -> None:
        super().__init__(app)
        self.limiter = limiter or shared_limiter

    @staticmethod
    def _default_limit(key: str) -> int:
        settings = get_settings()
        if key.startswith("sk_"):
            return settings.rate_limit_secret
        return settings.rate_limit_publishable

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)

        settings = get_settings()
        key = request.headers.get("x-api-key")
        host = request.client.host if request.client else None
        checks: list[tuple[str, int]] = []

        if key:
            if host and settings.rate_limit_per_ip > 0:
                checks.append((f"ip:{host}", settings.rate_limit_per_ip))
            identity = key_identity(key)
            limit = self.limiter.known_limit(identity) or self._default_limit(key)
            checks.append((identity, limit))
        elif host and request.url.path.startswith("/auth/"):
            checks.append((f"auth:{host}", settings.rate_limit_publishable))

        for identity, limit in checks:
            retry_after = self.limiter.hit(identity, limit)
            if retry_after is not None:
                return _rate_limited(retry_after)

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
