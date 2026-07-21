from urllib.parse import urlencode

from fastapi import APIRouter, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.models import Organization, User
from ...security import passwords, tokens
from ..deps import CurrentUser, SessionDep
from ..errors import ApiError, Conflict, Unauthorized
from ..services import google_oauth

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    display_name: str | None = Field(default=None, max_length=120)
    organization_name: str | None = Field(default=None, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserPayload(BaseModel):
    id: str
    email: str
    display_name: str | None
    locale: str


class TokenPayload(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPayload


def _tokens_for(user: User) -> TokenPayload:
    return TokenPayload(
        access_token=tokens.create_access_token(user.id),
        refresh_token=tokens.create_refresh_token(user.id),
        user=UserPayload(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            locale=user.locale,
        ),
    )


@router.post("/signup", response_model=TokenPayload, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, session: SessionDep) -> TokenPayload:
    existing = await session.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalars().first() is not None:
        raise Conflict("an account with this email already exists")

    try:
        password_hash = passwords.hash_password(payload.password)
    except passwords.WeakPasswordError as exc:
        raise ApiError(str(exc)) from exc

    user = User(
        email=payload.email.lower(),
        password_hash=password_hash,
        display_name=payload.display_name,
    )
    session.add(user)
    await session.flush()

    session.add(
        Organization(
            name=payload.organization_name or f"{user.email.split('@')[0]} workspace",
            owner_user_id=user.id,
        )
    )
    await session.commit()
    return _tokens_for(user)


@router.post("/login", response_model=TokenPayload)
async def login(payload: LoginRequest, session: SessionDep) -> TokenPayload:
    result = await session.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalars().first()
    if (
        user is None
        or user.password_hash is None
        or not passwords.verify_password(user.password_hash, payload.password)
    ):
        raise Unauthorized("invalid email or password")

    if passwords.needs_rehash(user.password_hash):
        user.password_hash = passwords.hash_password(payload.password)
        await session.commit()

    return _tokens_for(user)


@router.post("/refresh", response_model=TokenPayload)
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPayload:
    try:
        user_id = tokens.decode_token(payload.refresh_token, "refresh")
    except tokens.InvalidTokenError as exc:
        raise Unauthorized(str(exc)) from exc

    user = await session.get(User, user_id)
    if user is None:
        raise Unauthorized("user no longer exists")
    return _tokens_for(user)


@router.get("/me", response_model=UserPayload)
async def me(user: CurrentUser) -> UserPayload:
    return UserPayload(
        id=user.id, email=user.email, display_name=user.display_name, locale=user.locale
    )


class ProvidersPayload(BaseModel):
    google: bool


@router.get("/providers", response_model=ProvidersPayload)
async def providers() -> ProvidersPayload:
    return ProvidersPayload(google=get_settings().google_oauth_enabled)


async def _upsert_google_user(session: AsyncSession, profile: google_oauth.GoogleProfile) -> User:
    result = await session.execute(select(User).where(User.google_sub == profile.sub))
    user = result.scalars().first()
    if user is not None:
        return user

    result = await session.execute(select(User).where(User.email == profile.email))
    user = result.scalars().first()
    if user is not None:
        user.google_sub = profile.sub
        if profile.picture and not user.avatar_url:
            user.avatar_url = profile.picture
        await session.commit()
        return user

    user = User(
        email=profile.email,
        google_sub=profile.sub,
        display_name=profile.name,
        avatar_url=profile.picture,
    )
    session.add(user)
    await session.flush()
    session.add(
        Organization(
            name=f"{profile.email.split('@')[0]} workspace",
            owner_user_id=user.id,
        )
    )
    await session.commit()
    return user


@router.get("/oauth/google")
async def google_login(next: str = Query(default="/")) -> RedirectResponse:
    if not get_settings().google_oauth_enabled:
        raise ApiError("google login is not configured")
    return RedirectResponse(google_oauth.authorization_url(next))


@router.get("/oauth/google/callback")
async def google_callback(
    session: SessionDep,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    settings = get_settings()
    dashboard = settings.dashboard_url.rstrip("/")

    def failure(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{dashboard}/login?{urlencode({'oauth_error': reason})}")

    if error or not code or not state:
        return failure(error or "oauth_cancelled")

    try:
        next_path = google_oauth.verify_state(state)
        profile = await google_oauth.exchange_code(code)
    except google_oauth.OAuthError:
        return failure("oauth_failed")

    user = await _upsert_google_user(session, profile)
    issued = _tokens_for(user)

    query = urlencode(
        {
            "access_token": issued.access_token,
            "refresh_token": issued.refresh_token,
            "next": next_path,
        }
    )
    return RedirectResponse(f"{dashboard}/oauth/callback?{query}")
