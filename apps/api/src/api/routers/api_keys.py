from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.models import ApiKey, User
from ...security import api_keys
from .. import validation
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import NotFound

router = APIRouter(prefix="/v1", tags=["api-keys"])

KeyType = Literal["publishable", "secret", "sandbox"]


class ApiKeyCreate(BaseModel):
    type: KeyType
    name: str = Field(default="default", min_length=1, max_length=120)
    allowed_origins: list[str] = Field(default_factory=list, max_length=50)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=10000)

    @field_validator("allowed_origins")
    @classmethod
    def _normalise_origins(cls, value: list[str]) -> list[str]:
        return validation.allowed_origins(value)


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    allowed_origins: list[str] | None = Field(default=None, max_length=50)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=10000)

    @field_validator("allowed_origins")
    @classmethod
    def _normalise_origins(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else validation.allowed_origins(value)


class ApiKeyPayload(BaseModel):
    id: str
    project_id: str
    name: str
    type: str
    key_prefix: str
    allowed_origins: list[str]
    rate_limit_per_minute: int
    revoked_at: datetime | None
    created_at: datetime


class ApiKeyCreatedPayload(ApiKeyPayload):
    key: str


def _key_payload(key: ApiKey) -> ApiKeyPayload:
    return ApiKeyPayload(
        id=key.id,
        project_id=key.project_id,
        name=key.name,
        type=key.type,
        key_prefix=key.key_prefix,
        allowed_origins=list(key.allowed_origins or []),
        rate_limit_per_minute=key.rate_limit_per_minute,
        revoked_at=key.revoked_at,
        created_at=key.created_at,
    )


def _default_rate_limit(key_type: str) -> int:
    settings = get_settings()
    if key_type == "secret":
        return settings.rate_limit_secret
    return settings.rate_limit_publishable


async def _owned_key(session: AsyncSession, user: User, project_id: str, key_id: str) -> ApiKey:
    project = await owned_project(session, user, project_id)
    result = await session.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.project_id == project.id)
    )
    key = result.scalars().first()
    if key is None:
        raise NotFound("api key not found")
    return key


@router.post(
    "/projects/{project_id}/api-keys",
    response_model=ApiKeyCreatedPayload,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    project_id: str, payload: ApiKeyCreate, user: CurrentUser, session: SessionDep
) -> ApiKeyCreatedPayload:
    project = await owned_project(session, user, project_id)
    raw, key_hash, key_prefix = api_keys.generate_key(payload.type)

    key = ApiKey(
        project_id=project.id,
        name=payload.name,
        type=payload.type,
        key_hash=key_hash,
        key_prefix=key_prefix,
        allowed_origins=payload.allowed_origins,
        rate_limit_per_minute=payload.rate_limit_per_minute or _default_rate_limit(payload.type),
    )
    session.add(key)
    await session.commit()

    return ApiKeyCreatedPayload(**_key_payload(key).model_dump(), key=raw)


@router.get("/projects/{project_id}/api-keys", response_model=list[ApiKeyPayload])
async def list_api_keys(
    project_id: str, user: CurrentUser, session: SessionDep
) -> list[ApiKeyPayload]:
    project = await owned_project(session, user, project_id)
    result = await session.execute(
        select(ApiKey).where(ApiKey.project_id == project.id).order_by(ApiKey.created_at.desc())
    )
    return [_key_payload(key) for key in result.scalars().all()]


@router.patch("/projects/{project_id}/api-keys/{key_id}", response_model=ApiKeyPayload)
async def update_api_key(
    project_id: str,
    key_id: str,
    payload: ApiKeyUpdate,
    user: CurrentUser,
    session: SessionDep,
) -> ApiKeyPayload:
    key = await _owned_key(session, user, project_id, key_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(key, field, value)

    await session.commit()
    return _key_payload(key)


@router.delete("/projects/{project_id}/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    project_id: str, key_id: str, user: CurrentUser, session: SessionDep
) -> Response:
    key = await _owned_key(session, user, project_id, key_id)
    if key.revoked_at is None:
        key.revoked_at = datetime.now(UTC)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
