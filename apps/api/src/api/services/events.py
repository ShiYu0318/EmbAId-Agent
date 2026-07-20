import json
from contextlib import suppress
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import WebhookDelivery, WebhookEndpoint
from ...security.api_keys import sign_payload
from ...tasks.queue import enqueue

SUPPORTED_EVENTS: tuple[str, ...] = (
    "document.indexed",
    "source.failed",
    "conversation.started",
    "knowledge_gap.created",
)

TEST_EVENT = "webhook.test"


def encode_payload(event: str, payload: dict[str, Any]) -> bytes:
    return json.dumps(
        {"event": event, "data": payload},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode()


def signature_for(secret: str, event: str, payload: dict[str, Any]) -> str:
    return sign_payload(secret, encode_payload(event, payload))


async def create_delivery(
    session: AsyncSession,
    endpoint: WebhookEndpoint,
    event: str,
    payload: dict[str, Any],
) -> WebhookDelivery:
    delivery = WebhookDelivery(endpoint_id=endpoint.id, event=event, payload=payload)
    session.add(delivery)
    await session.flush()
    return delivery


async def dispatch(delivery_id: str) -> bool:
    if await enqueue("deliver_webhook", delivery_id) is not None:
        return True

    from ...ingestion.jobs import deliver_webhook

    with suppress(NotImplementedError):
        await deliver_webhook({}, delivery_id)
    return False


async def emit(
    session: AsyncSession,
    project_id: str,
    event: str,
    payload: dict[str, Any],
) -> list[WebhookDelivery]:
    result = await session.execute(
        select(WebhookEndpoint).where(
            WebhookEndpoint.project_id == project_id,
            WebhookEndpoint.active.is_(True),
        )
    )
    endpoints = [
        endpoint for endpoint in result.scalars().all() if event in endpoint.subscribed_events
    ]
    if not endpoints:
        return []

    deliveries = [
        await create_delivery(session, endpoint, event, payload) for endpoint in endpoints
    ]
    for delivery in deliveries:
        await dispatch(delivery.id)
    return deliveries
