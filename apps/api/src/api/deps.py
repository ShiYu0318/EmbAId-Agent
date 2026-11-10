from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import ApiKey, Organization, Project, User
from ..db.session import get_session
from ..security import api_keys, tokens
from ..security.rate_limit import key_identity, limiter
from .errors import Forbidden, NotFound, Unauthorized

SessionDep = Annotated[AsyncSession, Depends(get_session)]


@dataclass(slots=True)
class KeyContext:
    api_key: ApiKey
    project: Project

    @property
    def is_sandbox(self) -> bool:
        return self.api_key.type == "sandbox"

    @property
    def can_manage(self) -> bool:
        return self.api_key.type == "secret"


async def current_user(
    session: SessionDep,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized()

    token = authorization.split(" ", 1)[1].strip()
    try:
        user_id = tokens.decode_token(token, "access")
    except tokens.InvalidTokenError as exc:
        raise Unauthorized(str(exc)) from exc

    user = await session.get(User, user_id)
    if user is None:
        raise Unauthorized("user no longer exists")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


async def owned_organization(session: AsyncSession, user: User) -> Organization:
    result = await session.execute(
        select(Organization).where(Organization.owner_user_id == user.id)
    )
    organization = result.scalars().first()
    if organization is None:
        raise NotFound("organization not found")
    return organization


async def owned_project(session: AsyncSession, user: User, project_id: str) -> Project:
    result = await session.execute(
        select(Project)
        .join(Organization, Project.org_id == Organization.id)
        .where(Project.id == project_id, Organization.owner_user_id == user.id)
    )
    project = result.scalars().first()
    if project is None:
        raise NotFound("project not found")
    return project


async def key_context(
    request: Request,
    session: SessionDep,
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> KeyContext:
    if not x_api_key:
        raise Unauthorized("missing X-API-Key header")

    if api_keys.key_type_of(x_api_key) is None:
        raise Unauthorized("malformed api key")

    result = await session.execute(
        select(ApiKey).where(ApiKey.key_hash == api_keys.hash_key(x_api_key))
    )
    key = result.scalars().first()
    if key is None or key.revoked_at is not None:
        raise Unauthorized("invalid api key")

    if key.type in {"publishable", "sandbox"} and key.allowed_origins:
        origin = request.headers.get("origin") or request.headers.get("x-app-id")
        if origin not in key.allowed_origins:
            raise Forbidden("origin not allowed for this key")

    # From the next request on, the middleware enforces this key's own limit.
    limiter.remember_limit(key_identity(x_api_key), key.rate_limit_per_minute)

    project = await session.get(Project, key.project_id)
    if project is None:
        raise NotFound("project not found")

    return KeyContext(api_key=key, project=project)


KeyDep = Annotated[KeyContext, Depends(key_context)]


async def management_key_context(context: KeyDep) -> KeyContext:
    if not context.can_manage:
        raise Forbidden("this endpoint requires a secret key")
    return context


ManagementKeyDep = Annotated[KeyContext, Depends(management_key_context)]
