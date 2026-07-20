from fastapi import APIRouter, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from ...db.models import Organization, User
from ...security import passwords, tokens
from ..deps import CurrentUser, SessionDep
from ..errors import ApiError, Conflict, Unauthorized

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
    if user is None or not passwords.verify_password(user.password_hash, payload.password):
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
