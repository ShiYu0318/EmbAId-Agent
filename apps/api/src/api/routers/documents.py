import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import (
    Document,
    DocumentChunk,
    DocumentTag,
    Organization,
    Project,
    Tag,
    User,
)
from ...search.factory import get_search_backend
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


class ChunkPayload(BaseModel):
    id: str
    ordinal: int
    content: str
    trust_score: float


class DocumentPayload(BaseModel):
    id: str
    project_id: str
    source_id: str | None
    title: str
    url: str | None
    status: str
    error: str | None
    enabled: bool
    chunk_count: int
    token_count: int
    is_stale: bool
    last_verified_at: datetime | None
    created_at: datetime
    tags: list[str] = Field(default_factory=list)


class DocumentDetail(DocumentPayload):
    chunks: list[ChunkPayload] = Field(default_factory=list)


def _staleness_cutoff(project: Project) -> datetime:
    return datetime.now(UTC) - timedelta(days=project.staleness_days)


def _is_stale(document: Document, cutoff: datetime) -> bool:
    if document.last_verified_at is None:
        return True
    verified = document.last_verified_at
    if verified.tzinfo is None:
        verified = verified.replace(tzinfo=UTC)
    return verified < cutoff


def _estimate_tokens(char_count: int) -> int:
    return math.ceil(char_count / 4)


async def _chunk_stats(session: AsyncSession, document_id: str) -> tuple[int, int]:
    row = (
        await session.execute(
            select(
                func.count(DocumentChunk.id),
                func.coalesce(func.sum(func.length(DocumentChunk.content)), 0),
            ).where(DocumentChunk.document_id == document_id)
        )
    ).one()
    return int(row[0]), int(row[1])


def _document_payload(
    document: Document, chunk_count: int, char_count: int, cutoff: datetime, tags: list[str]
) -> DocumentPayload:
    return DocumentPayload(
        id=document.id,
        project_id=document.project_id,
        source_id=document.source_id,
        title=document.title,
        url=document.url,
        status=document.status,
        error=document.error,
        enabled=document.enabled,
        chunk_count=chunk_count,
        token_count=_estimate_tokens(char_count),
        is_stale=_is_stale(document, cutoff),
        last_verified_at=document.last_verified_at,
        created_at=document.created_at,
        tags=tags,
    )


async def _owned_document(session: AsyncSession, user: User, document_id: str) -> Document:
    result = await session.execute(
        select(Document)
        .join(Project, Document.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(Document.id == document_id, Organization.owner_user_id == user.id)
    )
    document = result.scalars().first()
    if document is None:
        raise NotFound("document not found")
    return document


async def _tags_for(session: AsyncSession, document_ids: list[str]) -> dict[str, list[str]]:
    if not document_ids:
        return {}
    result = await session.execute(
        select(DocumentTag.document_id, Tag.name)
        .join(Tag, DocumentTag.tag_id == Tag.id)
        .where(DocumentTag.document_id.in_(document_ids))
    )
    mapping: dict[str, list[str]] = {}
    for document_id, name in result.all():
        mapping.setdefault(document_id, []).append(name)
    return mapping


@router.get("/projects/{project_id}/documents", response_model=list[DocumentPayload])
async def list_documents(
    project_id: str,
    user: CurrentUser,
    session: SessionDep,
    document_status: str | None = Query(default=None, alias="status"),
    stale_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[DocumentPayload]:
    project = await owned_project(session, user, project_id)
    cutoff = _staleness_cutoff(project)

    query = select(Document).where(Document.project_id == project.id)
    if document_status:
        query = query.where(Document.status == document_status)
    if stale_only:
        # Filter in the query, before paging: filtering a fetched page would hide stale
        # documents that sit beyond it and return short pages.
        query = query.where(
            or_(Document.last_verified_at.is_(None), Document.last_verified_at < cutoff)
        )

    result = await session.execute(
        query.order_by(Document.created_at.desc()).limit(limit).offset(offset)
    )
    documents = list(result.scalars().all())

    stats = (
        await session.execute(
            select(
                DocumentChunk.document_id,
                func.count(DocumentChunk.id),
                func.coalesce(func.sum(func.length(DocumentChunk.content)), 0),
            )
            .where(DocumentChunk.document_id.in_([d.id for d in documents]))
            .group_by(DocumentChunk.document_id)
        )
    ).all()
    counts = {document_id: int(count) for document_id, count, _ in stats}
    chars = {document_id: int(char_count) for document_id, _, char_count in stats}
    tags = await _tags_for(session, [d.id for d in documents])

    return [
        _document_payload(
            document,
            counts.get(document.id, 0),
            chars.get(document.id, 0),
            cutoff,
            tags.get(document.id, []),
        )
        for document in documents
    ]


@router.get("/documents/{document_id}", response_model=DocumentDetail)
async def get_document(document_id: str, user: CurrentUser, session: SessionDep) -> DocumentDetail:
    document = await _owned_document(session, user, document_id)
    project = await session.get(Project, document.project_id)
    if project is None:
        raise NotFound("project not found")

    result = await session.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.ordinal)
    )
    chunks = list(result.scalars().all())
    tags = await _tags_for(session, [document.id])
    char_count = sum(len(chunk.content) for chunk in chunks)

    base = _document_payload(
        document, len(chunks), char_count, _staleness_cutoff(project), tags.get(document.id, [])
    )
    return DocumentDetail(
        **base.model_dump(),
        chunks=[
            ChunkPayload(
                id=chunk.id,
                ordinal=chunk.ordinal,
                content=chunk.content,
                trust_score=chunk.trust_score,
            )
            for chunk in chunks
        ],
    )


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    enabled: bool | None = None


@router.patch("/documents/{document_id}", response_model=DocumentPayload)
async def update_document(
    document_id: str, payload: DocumentUpdate, user: CurrentUser, session: SessionDep
) -> DocumentPayload:
    document = await _owned_document(session, user, document_id)
    project = await session.get(Project, document.project_id)
    if project is None:
        raise NotFound("project not found")

    if payload.title is not None:
        document.title = payload.title
    if payload.enabled is not None:
        document.enabled = payload.enabled
    await session.commit()

    chunk_count, char_count = await _chunk_stats(session, document.id)
    tags = await _tags_for(session, [document.id])
    return _document_payload(
        document, chunk_count, char_count, _staleness_cutoff(project), tags.get(document.id, [])
    )


async def purge_document(session: AsyncSession, document: Document) -> None:
    await get_search_backend().delete_document(document.project_id, document.id)
    await session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    await session.delete(document)


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str, user: CurrentUser, session: SessionDep) -> Response:
    document = await _owned_document(session, user, document_id)
    await purge_document(session, document)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/documents/{document_id}/verify", response_model=DocumentPayload)
async def verify_document(
    document_id: str, user: CurrentUser, session: SessionDep
) -> DocumentPayload:
    document = await _owned_document(session, user, document_id)
    project = await session.get(Project, document.project_id)
    if project is None:
        raise NotFound("project not found")

    document.last_verified_at = datetime.now(UTC)
    await session.commit()

    chunk_count, char_count = await _chunk_stats(session, document.id)
    tags = await _tags_for(session, [document.id])
    return _document_payload(
        document, chunk_count, char_count, _staleness_cutoff(project), tags.get(document.id, [])
    )


class DocumentTagUpdate(BaseModel):
    tag_ids: list[str] = Field(default_factory=list)


@router.put("/documents/{document_id}/tags", response_model=DocumentPayload)
async def set_document_tags(
    document_id: str, payload: DocumentTagUpdate, user: CurrentUser, session: SessionDep
) -> DocumentPayload:
    document = await _owned_document(session, user, document_id)
    project = await session.get(Project, document.project_id)
    if project is None:
        raise NotFound("project not found")

    if payload.tag_ids:
        result = await session.execute(
            select(Tag.id).where(Tag.id.in_(payload.tag_ids), Tag.project_id == document.project_id)
        )
        valid = set(result.scalars().all())
        missing = set(payload.tag_ids) - valid
        if missing:
            raise NotFound("one or more tags do not belong to this project")

    await session.execute(delete(DocumentTag).where(DocumentTag.document_id == document.id))
    session.add_all(
        [DocumentTag(document_id=document.id, tag_id=tag_id) for tag_id in payload.tag_ids]
    )
    await session.commit()

    chunk_count, char_count = await _chunk_stats(session, document.id)
    tags = await _tags_for(session, [document.id])
    return _document_payload(
        document, chunk_count, char_count, _staleness_cutoff(project), tags.get(document.id, [])
    )
