from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt

from ...config import get_settings

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_TTL_SECONDS = 600
SCOPE = "openid email profile"


class OAuthError(RuntimeError):
    pass


@dataclass(slots=True)
class GoogleProfile:
    sub: str
    email: str
    name: str | None
    picture: str | None


def _sign_state(next_path: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "purpose": "google_oauth",
        "next": next_path,
        "iat": now,
        "exp": now + timedelta(seconds=STATE_TTL_SECONDS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_state(state: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise OAuthError("invalid or expired state") from exc
    if payload.get("purpose") != "google_oauth":
        raise OAuthError("invalid state")
    next_path = payload.get("next", "/")
    return next_path if isinstance(next_path, str) else "/"


def authorization_url(next_path: str = "/") -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "online",
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "state": _sign_state(next_path),
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


async def exchange_code(code: str) -> GoogleProfile:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code != 200:
            raise OAuthError(
                f"token exchange failed ({token_response.status_code}): {token_response.text}"
            )

        access_token = token_response.json().get("access_token")
        if not access_token:
            raise OAuthError("no access token returned")

        userinfo_response = await client.get(
            USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {access_token}"}
        )
        if userinfo_response.status_code != 200:
            raise OAuthError(
                f"userinfo failed ({userinfo_response.status_code}): {userinfo_response.text}"
            )

    info = userinfo_response.json()
    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise OAuthError("google profile is missing required fields")

    return GoogleProfile(
        sub=str(sub),
        email=str(email).lower(),
        name=info.get("name"),
        picture=info.get("picture"),
    )
