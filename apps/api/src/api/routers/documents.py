from datetime import datetime

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import Organization, Project, Tag, User
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import Conflict, NotFound

router = APIRouter(prefix="/v1", tags=["documents"])


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TagUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TagPayload(BaseModel):
    id: str
    project_id: str
    name: str
    created_at: datetime


def _tag_payload(tag: Tag) -> TagPayload:
    return TagPayload(
        id=tag.id, project_id=tag.project_id, name=tag.name, created_at=tag.created_at
    )


async def _owned_tag(session: AsyncSession, user: User, tag_id: str) -> Tag:
    result = await session.execute(
        select(Tag)
        .join(Project, Tag.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(Tag.id == tag_id, Organization.owner_user_id == user.id)
    )
    tag = result.scalars().first()
    if tag is None:
        raise NotFound("tag not found")
    return tag


@router.get("/projects/{project_id}/tags", response_model=list[TagPayload])
async def list_tags(project_id: str, user: CurrentUser, session: SessionDep) -> list[TagPayload]:
    project = await owned_project(session, user, project_id)
    result = await session.execute(
        select(Tag).where(Tag.project_id == project.id).order_by(Tag.name)
    )
    return [_tag_payload(tag) for tag in result.scalars().all()]


@router.post(
    "/projects/{project_id}/tags", response_model=TagPayload, status_code=status.HTTP_201_CREATED
)
async def create_tag(
    project_id: str, payload: TagCreate, user: CurrentUser, session: SessionDep
) -> TagPayload:
    project = await owned_project(session, user, project_id)
    tag = Tag(project_id=project.id, name=payload.name)
    session.add(tag)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise Conflict("a tag with this name already exists in this project") from exc
    return _tag_payload(tag)


@router.patch("/tags/{tag_id}", response_model=TagPayload)
async def update_tag(
    tag_id: str, payload: TagUpdate, user: CurrentUser, session: SessionDep
) -> TagPayload:
    tag = await _owned_tag(session, user, tag_id)
    tag.name = payload.name
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise Conflict("a tag with this name already exists in this project") from exc
    return _tag_payload(tag)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: str, user: CurrentUser, session: SessionDep) -> Response:
    tag = await _owned_tag(session, user, tag_id)
    await session.delete(tag)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
