from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt

from ..config import get_settings

ALGORITHM = "HS256"
TokenType = Literal["access", "refresh"]


class InvalidTokenError(ValueError):
    pass


def _encode(subject: str, token_type: TokenType, ttl: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    return _encode(user_id, "access", timedelta(minutes=settings.jwt_access_ttl_minutes))


def create_refresh_token(user_id: str) -> str:
    settings = get_settings()
    return _encode(user_id, "refresh", timedelta(days=settings.jwt_refresh_ttl_days))


def decode_token(token: str, expected_type: TokenType) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise InvalidTokenError("unexpected token type")

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise InvalidTokenError("missing subject")
    return subject
