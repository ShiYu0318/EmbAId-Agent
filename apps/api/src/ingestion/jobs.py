from typing import Any


async def ingest_source(ctx: dict[str, Any], source_id: str) -> dict[str, Any]:
    raise NotImplementedError


async def ingest_document(ctx: dict[str, Any], document_id: str) -> dict[str, Any]:
    raise NotImplementedError


async def reindex_project(ctx: dict[str, Any], project_id: str) -> dict[str, Any]:
    raise NotImplementedError


async def deliver_webhook(ctx: dict[str, Any], delivery_id: str) -> dict[str, Any]:
    raise NotImplementedError
