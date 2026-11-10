import secrets
from datetime import datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db.models import Organization, Project, User, WebhookDelivery, WebhookEndpoint
from ...security.outbound import UnsafeUrlError, check_url
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import ApiError, NotFound
from ..services import events

router = APIRouter(prefix="/v1", tags=["webhooks"])


class WebhookCreate(BaseModel):
    url: str = Field(max_length=2000)
    subscribed_events: list[str] = Field(default_factory=list)


class WebhookUpdate(BaseModel):
    url: str | None = Field(default=None, max_length=2000)
    subscribed_events: list[str] | None = None
    active: bool | None = None


class WebhookPayload(BaseModel):
    id: str
    project_id: str
    url: str
    subscribed_events: list[str]
    active: bool
    created_at: datetime


class WebhookCreated(WebhookPayload):
    secret: str


class DeliveryPayload(BaseModel):
    id: str
    endpoint_id: str
    event: str
    status_code: int | None
    attempts: int
    error: str | None
    created_at: datetime


def _payload(endpoint: WebhookEndpoint) -> WebhookPayload:
    return WebhookPayload(
        id=endpoint.id,
        project_id=endpoint.project_id,
        url=endpoint.url,
        subscribed_events=endpoint.subscribed_events,
        active=endpoint.active,
        created_at=endpoint.created_at,
    )


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ApiError("webhook url must be an absolute http or https url")
    try:
        check_url(url)
    except UnsafeUrlError as exc:
        raise ApiError(f"webhook url rejected: {exc}") from exc
    if parsed.scheme != "https" and get_settings().is_production:
        raise ApiError("webhook url must use https in production")


def _validate_events(names: list[str]) -> None:
    unknown = [name for name in names if name not in events.SUPPORTED_EVENTS]
    if unknown:
        supported = ", ".join(events.SUPPORTED_EVENTS)
        raise ApiError(f"unsupported events: {', '.join(unknown)}. supported: {supported}")


async def _owned_endpoint(session: AsyncSession, user: User, endpoint_id: str) -> WebhookEndpoint:
    result = await session.execute(
        select(WebhookEndpoint)
        .join(Project, WebhookEndpoint.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(WebhookEndpoint.id == endpoint_id, Organization.owner_user_id == user.id)
    )
    endpoint = result.scalars().first()
    if endpoint is None:
        raise NotFound("webhook endpoint not found")
    return endpoint


@router.get("/webhook-events", response_model=list[str])
async def supported_events(user: CurrentUser) -> list[str]:
    return list(events.SUPPORTED_EVENTS)


@router.post(
    "/projects/{project_id}/webhooks",
    response_model=WebhookCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_webhook(
    project_id: str, payload: WebhookCreate, user: CurrentUser, session: SessionDep
) -> WebhookCreated:
    project = await owned_project(session, user, project_id)
    _validate_url(payload.url)
    _validate_events(payload.subscribed_events)

    secret = secrets.token_urlsafe(32)
    endpoint = WebhookEndpoint(
        project_id=project.id,
        url=payload.url,
        secret=secret,
        subscribed_events=payload.subscribed_events,
    )
    session.add(endpoint)
    await session.commit()

    return WebhookCreated(**_payload(endpoint).model_dump(), secret=secret)


@router.get("/projects/{project_id}/webhooks", response_model=list[WebhookPayload])
async def list_webhooks(
    project_id: str, user: CurrentUser, session: SessionDep
) -> list[WebhookPayload]:
    project = await owned_project(session, user, project_id)
    result = await session.execute(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.project_id == project.id)
        .order_by(WebhookEndpoint.created_at.desc())
    )
    return [_payload(endpoint) for endpoint in result.scalars().all()]


@router.patch("/webhooks/{endpoint_id}", response_model=WebhookPayload)
async def update_webhook(
    endpoint_id: str, payload: WebhookUpdate, user: CurrentUser, session: SessionDep
) -> WebhookPayload:
    endpoint = await _owned_endpoint(session, user, endpoint_id)

    if payload.url is not None:
        _validate_url(payload.url)
        endpoint.url = payload.url
    if payload.subscribed_events is not None:
        _validate_events(payload.subscribed_events)
        endpoint.subscribed_events = payload.subscribed_events
    if payload.active is not None:
        endpoint.active = payload.active

    await session.commit()
    return _payload(endpoint)


@router.delete("/webhooks/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(endpoint_id: str, user: CurrentUser, session: SessionDep) -> Response:
    endpoint = await _owned_endpoint(session, user, endpoint_id)
    await session.delete(endpoint)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/webhooks/{endpoint_id}/test", response_model=DeliveryPayload)
async def test_webhook(endpoint_id: str, user: CurrentUser, session: SessionDep) -> DeliveryPayload:
    endpoint = await _owned_endpoint(session, user, endpoint_id)
    delivery = await events.create_delivery(
        session, endpoint, events.TEST_EVENT, {"project_id": endpoint.project_id}
    )
    await session.commit()
    await events.dispatch(delivery.id)
    await session.refresh(delivery)

    return DeliveryPayload(
        id=delivery.id,
        endpoint_id=delivery.endpoint_id,
        event=delivery.event,
        status_code=delivery.status_code,
        attempts=delivery.attempts,
        error=delivery.error,
        created_at=delivery.created_at,
    )


@router.get("/webhooks/{endpoint_id}/deliveries", response_model=list[DeliveryPayload])
async def list_deliveries(
    endpoint_id: str,
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=50, le=200),
) -> list[DeliveryPayload]:
    endpoint = await _owned_endpoint(session, user, endpoint_id)
    result = await session.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.endpoint_id == endpoint.id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
    )
    return [
        DeliveryPayload(
            id=delivery.id,
            endpoint_id=delivery.endpoint_id,
            event=delivery.event,
            status_code=delivery.status_code,
            attempts=delivery.attempts,
            error=delivery.error,
            created_at=delivery.created_at,
        )
        for delivery in result.scalars().all()
    ]
