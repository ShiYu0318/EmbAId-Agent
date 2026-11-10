from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ...db.models import Document, IngestionSource
from ...ingestion import jobs
from ...security.outbound import UnsafeUrlError, check_url
from ...storage import get_storage
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import ApiError, NotFound
from .documents import purge_document

router = APIRouter(prefix="/v1", tags=["ingestion"])

SourceType = Literal["upload", "url_crawl", "sitemap", "notion", "google_docs"]
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024


class UploadTooLarge(ApiError):
    code = "payload_too_large"

    def __init__(self) -> None:
        super().__init__("uploaded file exceeds the size limit", 413)


class SourceCreate(BaseModel):
    type: SourceType
    config: dict[str, Any] = Field(default_factory=dict)
    schedule: str | None = Field(default=None, max_length=40)


class SourcePayload(BaseModel):
    id: str
    project_id: str
    type: str
    config: dict[str, Any]
    schedule: str | None
    status: str
    last_run_at: datetime | None
    last_error: str | None
    created_at: datetime


def _payload(source: IngestionSource) -> SourcePayload:
    return SourcePayload(
        id=source.id,
        project_id=source.project_id,
        type=source.type,
        config=_redact(source.config),
        schedule=source.schedule,
        status=source.status,
        last_run_at=source.last_run_at,
        last_error=source.last_error,
        created_at=source.created_at,
    )


def _redact(config: dict[str, Any]) -> dict[str, Any]:
    secret_keys = {"token", "api_key", "access_token", "refresh_token", "client_secret"}
    return {
        key: ("***" if key in secret_keys and value else value) for key, value in config.items()
    }


def _validate_config(source_type: str, config: dict[str, Any]) -> None:
    if source_type in {"url_crawl", "sitemap"}:
        url = config.get("url")
        if not url or not isinstance(url, str):
            raise ApiError(f"{source_type} sources require a url in config")
        try:
            check_url(url)
        except UnsafeUrlError as exc:
            raise ApiError(f"source url rejected: {exc}") from exc
    if source_type == "notion" and not config.get("token"):
        raise ApiError("notion sources require a token in config")
    if source_type == "google_docs" and not config.get("document_ids"):
        raise ApiError("google_docs sources require document_ids in config")


async def _owned_source(session: SessionDep, user: CurrentUser, source_id: str) -> IngestionSource:
    source = await session.get(IngestionSource, source_id)
    if source is None:
        raise NotFound("source not found")
    await owned_project(session, user, source.project_id)
    return source


@router.post(
    "/projects/{project_id}/sources",
    response_model=SourcePayload,
    status_code=status.HTTP_201_CREATED,
)
async def create_source(
    project_id: str,
    payload: SourceCreate,
    session: SessionDep,
    user: CurrentUser,
    background: BackgroundTasks,
) -> SourcePayload:
    project = await owned_project(session, user, project_id)
    if payload.type == "upload":
        raise ApiError("upload sources are created through the file upload endpoint")

    _validate_config(payload.type, payload.config)

    source = IngestionSource(
        project_id=project.id,
        type=payload.type,
        config=payload.config,
        schedule=payload.schedule,
        status="pending",
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)

    background.add_task(jobs.dispatch_source, source.id)
    return _payload(source)


@router.get("/projects/{project_id}/sources", response_model=list[SourcePayload])
async def list_sources(
    project_id: str, session: SessionDep, user: CurrentUser
) -> list[SourcePayload]:
    project = await owned_project(session, user, project_id)
    result = await session.execute(
        select(IngestionSource)
        .where(IngestionSource.project_id == project.id)
        .order_by(IngestionSource.created_at.desc())
    )
    return [_payload(source) for source in result.scalars().all()]


@router.get("/sources/{source_id}", response_model=SourcePayload)
async def get_source(source_id: str, session: SessionDep, user: CurrentUser) -> SourcePayload:
    return _payload(await _owned_source(session, user, source_id))


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: str, session: SessionDep, user: CurrentUser) -> None:
    source = await _owned_source(session, user, source_id)
    result = await session.execute(select(Document).where(Document.source_id == source.id))
    for document in result.scalars().all():
        await purge_document(session, document)
    await session.delete(source)
    await session.commit()


@router.post("/sources/{source_id}/reindex", response_model=SourcePayload)
async def reindex_source(
    source_id: str, session: SessionDep, user: CurrentUser, background: BackgroundTasks
) -> SourcePayload:
    source = await _owned_source(session, user, source_id)
    source.status = "pending"
    await session.commit()
    await session.refresh(source)

    background.add_task(jobs.dispatch_source, source.id)
    return _payload(source)


async def _read_capped(file: UploadFile) -> bytes:
    """Read the upload in chunks and stop as soon as it passes the limit."""
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise UploadTooLarge()
    buffer = bytearray()
    while chunk := await file.read(UPLOAD_CHUNK_BYTES):
        buffer.extend(chunk)
        if len(buffer) > MAX_UPLOAD_BYTES:
            raise UploadTooLarge()
    return bytes(buffer)


@router.post(
    "/projects/{project_id}/documents/upload",
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    project_id: str,
    session: SessionDep,
    user: CurrentUser,
    background: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
) -> dict[str, str]:
    project = await owned_project(session, user, project_id)

    data = await _read_capped(file)
    if not data:
        raise ApiError("uploaded file is empty")

    filename = jobs.safe_filename(file.filename)
    document = Document(
        project_id=project.id,
        title=(title or filename)[:500],
        status="pending",
    )
    session.add(document)
    await session.flush()

    document.storage_key = jobs.storage_key_for(project.id, document.id, filename)
    await get_storage().put(
        document.storage_key, data, file.content_type or "application/octet-stream"
    )
    await session.commit()

    background.add_task(jobs.dispatch_document, document.id)
    return {"document_id": document.id, "status": "queued"}


@router.post("/projects/{project_id}/reindex")
async def reindex_project(
    project_id: str, session: SessionDep, user: CurrentUser, background: BackgroundTasks
) -> dict[str, str]:
    project = await owned_project(session, user, project_id)
    background.add_task(jobs.dispatch_reindex, project.id)
    return {"project_id": project.id, "status": "queued"}
