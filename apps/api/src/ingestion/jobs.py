import asyncio
import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import (
    Document,
    DocumentChunk,
    IngestionSource,
    Project,
    WebhookDelivery,
    WebhookEndpoint,
)
from ..db.session import session_scope
from ..search.base import IndexedChunk
from ..security.api_keys import sign_payload
from ..tasks.queue import enqueue
from . import runtime
from .chunking import chunk_text
from .connectors import build_connector
from .contextual import contextualize, embedding_inputs
from .loaders import load_document
from .web import crawl_site, expand_sitemap, fetch_page

EMBED_BATCH_SIZE = 64
ERROR_MAX_CHARS = 2000
WEBHOOK_MAX_ATTEMPTS = 3
WEBHOOK_BACKOFF_SECONDS = 1.0
WEBHOOK_TIMEOUT_SECONDS = 15.0
WEBHOOK_USER_AGENT = "proprAI-Chat-Webhooks/0.1"
SIGNATURE_HEADER = "x-proprai-signature"
EVENT_HEADER = "x-proprai-event"
DELIVERY_HEADER = "x-proprai-delivery"


def utcnow() -> datetime:
    return datetime.now(UTC)


def content_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def storage_key_for(project_id: str, document_id: str, filename: str) -> str:
    return f"{project_id}/{document_id}/{filename}"


def canonical_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _truncate(message: str) -> str:
    return message[:ERROR_MAX_CHARS]


async def ingest_document(
    ctx: dict[str, Any], document_id: str, force: bool = False
) -> dict[str, Any]:
    async with session_scope() as session:
        document = await session.get(Document, document_id)
        if document is None:
            return {"status": "missing", "document_id": document_id}

        project = await session.get(Project, document.project_id)
        if project is None:
            return {"status": "missing", "document_id": document_id}

        try:
            text, title = await _document_text(ctx, document)
        except Exception as exc:
            document.status = "failed"
            document.error = _truncate(f"{type(exc).__name__}: {exc}")
            return {"status": "failed", "document_id": document_id, "error": str(exc)}

        if not text.strip():
            document.status = "failed"
            document.error = "no extractable text"
            return {"status": "failed", "document_id": document_id, "error": "no extractable text"}

        if title and not document.storage_key:
            document.title = title[:500]

        digest = content_digest(text)
        if not force and document.content_hash == digest and document.status == "ready":
            document.last_verified_at = utcnow()
            return {"status": "skipped", "document_id": document_id, "chunks": 0}

        try:
            chunk_count = await _index_document(ctx, session, project, document, text)
        except Exception as exc:
            document.status = "failed"
            document.error = _truncate(f"{type(exc).__name__}: {exc}")
            return {"status": "failed", "document_id": document_id, "error": str(exc)}

        document.content_hash = digest
        document.status = "ready"
        document.error = None
        document.last_verified_at = utcnow()

        return {"status": "ready", "document_id": document_id, "chunks": chunk_count}


async def _document_text(ctx: dict[str, Any], document: Document) -> tuple[str, str]:
    if document.storage_key:
        store = runtime.storage(ctx)
        data = await store.get(document.storage_key)
        loaded = load_document(data, filename=document.storage_key)
        return loaded.text, loaded.title

    if document.url:
        page = await fetch_page(document.url, fetcher=runtime.page_fetcher(ctx))
        return page.text, page.title

    raise ValueError("document has neither stored content nor a url")


async def _index_document(
    ctx: dict[str, Any],
    session: AsyncSession,
    project: Project,
    document: Document,
    text: str,
) -> int:
    settings = get_settings()
    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("document produced no chunks")

    contextual = await contextualize(
        chunks,
        text,
        model=runtime.chat_model(ctx, project),
        enabled=settings.contextual_embedding_enabled,
    )
    vectors = await _embed(runtime.embeddings(ctx, project), embedding_inputs(chunks, contextual))

    backend = runtime.search_backend(ctx)
    await session.execute(
        delete(DocumentChunk).where(
            DocumentChunk.document_id == document.id,
            DocumentChunk.project_id == project.id,
        )
    )
    await backend.delete_document(project.id, document.id)

    rows = [
        DocumentChunk(
            document_id=document.id,
            project_id=project.id,
            ordinal=ordinal,
            content=chunk,
            contextual_content=context,
            meta={"title": document.title, "url": document.url},
        )
        for ordinal, (chunk, context) in enumerate(zip(chunks, contextual, strict=True))
    ]
    session.add_all(rows)
    await session.flush()

    await backend.upsert(
        [
            IndexedChunk(
                chunk_id=row.id,
                project_id=project.id,
                document_id=document.id,
                text=row.contextual_content or row.content,
                embedding=vector,
                trust_score=row.trust_score,
                metadata={"title": document.title, "url": document.url, "ordinal": row.ordinal},
            )
            for row, vector in zip(rows, vectors, strict=True)
        ]
    )
    return len(rows)


async def _embed(model: Any, texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start : start + EMBED_BATCH_SIZE]
        vectors.extend(await model.aembed_documents(batch))
    return vectors


async def ingest_source(ctx: dict[str, Any], source_id: str) -> dict[str, Any]:
    async with session_scope() as session:
        source = await session.get(IngestionSource, source_id)
        if source is None:
            return {"status": "missing", "source_id": source_id}

        project = await session.get(Project, source.project_id)
        if project is None:
            return {"status": "missing", "source_id": source_id}

        try:
            document_ids = await _expand_source(ctx, session, source, project)
        except Exception as exc:
            source.status = "failed"
            source.last_error = _truncate(f"{type(exc).__name__}: {exc}")
            source.last_run_at = utcnow()
            return {"status": "failed", "source_id": source_id, "error": str(exc)}

        source.status = "ready"
        source.last_error = None
        source.last_run_at = utcnow()

    for document_id in document_ids:
        await dispatch_document(document_id, ctx)

    return {"status": "ready", "source_id": source_id, "documents": len(document_ids)}


async def _expand_source(
    ctx: dict[str, Any],
    session: AsyncSession,
    source: IngestionSource,
    project: Project,
) -> list[str]:
    if source.type == "upload":
        result = await session.execute(
            select(Document.id).where(
                Document.project_id == project.id,
                Document.source_id == source.id,
            )
        )
        return list(result.scalars().all())

    if source.type == "url_crawl":
        return await _expand_crawl(ctx, session, source, project)

    if source.type == "sitemap":
        return await _expand_sitemap(ctx, session, source, project)

    if source.type in {"notion", "google_docs"}:
        return await _expand_connector(ctx, session, source, project)

    raise ValueError(f"unsupported source type: {source.type}")


async def _expand_crawl(
    ctx: dict[str, Any],
    session: AsyncSession,
    source: IngestionSource,
    project: Project,
) -> list[str]:
    config = source.config or {}
    url = config.get("url")
    if not url:
        raise ValueError("url_crawl source requires a url in config")

    pages = await crawl_site(
        str(url),
        max_pages=int(config.get("max_pages", 25)),
        delay=float(config.get("delay", 0.5)),
        fetcher=runtime.page_fetcher(ctx),
        respect_robots=bool(config.get("respect_robots", True)),
    )

    store = runtime.storage(ctx)
    document_ids: list[str] = []
    for page in pages:
        if not page.text.strip():
            continue
        document = await _upsert_document(
            session, project.id, source.id, title=page.title, url=page.url
        )
        key = storage_key_for(project.id, document.id, "page.txt")
        await store.put(key, page.text.encode("utf-8"), "text/plain")
        document.storage_key = key
        document_ids.append(document.id)
    return document_ids


async def _expand_sitemap(
    ctx: dict[str, Any],
    session: AsyncSession,
    source: IngestionSource,
    project: Project,
) -> list[str]:
    config = source.config or {}
    url = config.get("url")
    if not url:
        raise ValueError("sitemap source requires a url in config")

    urls = await expand_sitemap(
        str(url),
        fetcher=runtime.page_fetcher(ctx),
        max_urls=int(config.get("max_pages", 25)),
    )

    document_ids: list[str] = []
    for page_url in urls:
        document = await _upsert_document(
            session, project.id, source.id, title=page_url, url=page_url
        )
        document_ids.append(document.id)
    return document_ids


async def _expand_connector(
    ctx: dict[str, Any],
    session: AsyncSession,
    source: IngestionSource,
    project: Project,
) -> list[str]:
    connector = build_connector(source.type, source.config or {}, runtime.connector_client(ctx))
    store = runtime.storage(ctx)

    document_ids: list[str] = []
    for entry in await connector.fetch():
        url = entry.url or f"{source.type}://{entry.external_id}"
        document = await _upsert_document(
            session, project.id, source.id, title=entry.title, url=url
        )
        key = storage_key_for(project.id, document.id, "content.txt")
        await store.put(key, entry.text.encode("utf-8"), "text/plain")
        document.storage_key = key
        document_ids.append(document.id)
    return document_ids


async def _upsert_document(
    session: AsyncSession,
    project_id: str,
    source_id: str,
    title: str,
    url: str,
) -> Document:
    result = await session.execute(
        select(Document).where(
            Document.project_id == project_id,
            Document.source_id == source_id,
            Document.url == url,
        )
    )
    document = result.scalars().first()
    if document is None:
        document = Document(
            project_id=project_id,
            source_id=source_id,
            title=title[:500],
            url=url,
            status="pending",
        )
        session.add(document)
        await session.flush()
        return document

    document.title = title[:500]
    return document


async def reindex_project(ctx: dict[str, Any], project_id: str) -> dict[str, Any]:
    async with session_scope() as session:
        project = await session.get(Project, project_id)
        if project is None:
            return {"status": "missing", "project_id": project_id}
        result = await session.execute(select(Document.id).where(Document.project_id == project_id))
        document_ids = list(result.scalars().all())

    reindexed = 0
    for document_id in document_ids:
        outcome = await ingest_document(ctx, document_id, force=True)
        if outcome.get("status") == "ready":
            reindexed += 1

    return {
        "status": "ready",
        "project_id": project_id,
        "documents": len(document_ids),
        "reindexed": reindexed,
    }


class _HttpxWebhookClient:
    async def post(self, url: str, content: bytes, headers: dict[str, str]) -> Any:
        import httpx

        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
            return await client.post(url, content=content, headers=headers)


async def deliver_webhook(ctx: dict[str, Any], delivery_id: str) -> dict[str, Any]:
    async with session_scope() as session:
        delivery = await session.get(WebhookDelivery, delivery_id)
        if delivery is None:
            return {"status": "missing", "delivery_id": delivery_id}

        endpoint = await session.get(WebhookEndpoint, delivery.endpoint_id)
        if endpoint is None:
            delivery.error = "endpoint no longer exists"
            return {"status": "failed", "delivery_id": delivery_id}

        body = canonical_payload(delivery.payload or {})
        headers = {
            "content-type": "application/json",
            "user-agent": WEBHOOK_USER_AGENT,
            EVENT_HEADER: delivery.event,
            DELIVERY_HEADER: delivery.id,
            SIGNATURE_HEADER: sign_payload(endpoint.secret, body),
        }
        client = runtime.webhook_client(ctx) or _HttpxWebhookClient()

        for attempt in range(1, WEBHOOK_MAX_ATTEMPTS + 1):
            delivery.attempts = attempt
            try:
                response = await client.post(endpoint.url, content=body, headers=headers)
                status_code = int(response.status_code)
                delivery.status_code = status_code
                if 200 <= status_code < 300:
                    delivery.error = None
                    return {
                        "status": "delivered",
                        "delivery_id": delivery_id,
                        "status_code": status_code,
                        "attempts": attempt,
                    }
                delivery.error = f"http {status_code}"
            except Exception as exc:
                delivery.error = _truncate(f"{type(exc).__name__}: {exc}")

            if attempt < WEBHOOK_MAX_ATTEMPTS:
                await asyncio.sleep(WEBHOOK_BACKOFF_SECONDS * 2 ** (attempt - 1))

        return {
            "status": "failed",
            "delivery_id": delivery_id,
            "status_code": delivery.status_code,
            "attempts": delivery.attempts,
        }


async def dispatch_document(document_id: str, ctx: dict[str, Any] | None = None) -> str | None:
    job_id = await enqueue("ingest_document", document_id)
    if job_id is None:
        await ingest_document(ctx or {}, document_id)
    return job_id


async def dispatch_source(source_id: str, ctx: dict[str, Any] | None = None) -> str | None:
    job_id = await enqueue("ingest_source", source_id)
    if job_id is None:
        await ingest_source(ctx or {}, source_id)
    return job_id


async def dispatch_reindex(project_id: str, ctx: dict[str, Any] | None = None) -> str | None:
    job_id = await enqueue("reindex_project", project_id)
    if job_id is None:
        await reindex_project(ctx or {}, project_id)
    return job_id


async def dispatch_webhook(delivery_id: str, ctx: dict[str, Any] | None = None) -> str | None:
    job_id = await enqueue("deliver_webhook", delivery_id)
    if job_id is None:
        await deliver_webhook(ctx or {}, delivery_id)
    return job_id
