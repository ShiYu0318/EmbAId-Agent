from datetime import datetime
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ...config import get_settings
from ...db.models import Organization, Project
from ...providers.registry import CHAT_PROVIDERS, EMBEDDING_PROVIDERS
from ..deps import CurrentUser, SessionDep, owned_organization, owned_project
from ..errors import ApiError
from ..services.templates import PersonaTemplate, get_template, list_templates, template_keys

router = APIRouter(prefix="/v1", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    template: str | None = Field(default=None, max_length=40)
    system_prompt: str | None = None
    chat_provider: str | None = Field(default=None, max_length=40)
    chat_model: str | None = Field(default=None, max_length=120)
    embedding_provider: str | None = Field(default=None, max_length=40)
    embedding_model: str | None = Field(default=None, max_length=120)
    default_locale: str = Field(default="zh-TW", max_length=10)
    confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    staleness_days: int | None = Field(default=None, ge=1, le=3650)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    system_prompt: str | None = None
    chat_provider: str | None = Field(default=None, max_length=40)
    chat_model: str | None = Field(default=None, max_length=120)
    embedding_provider: str | None = Field(default=None, max_length=40)
    embedding_model: str | None = Field(default=None, max_length=120)
    default_locale: str | None = Field(default=None, max_length=10)
    confidence_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    staleness_days: int | None = Field(default=None, ge=1, le=3650)


class ProjectPayload(BaseModel):
    id: str
    org_id: str
    name: str
    template: str | None
    system_prompt: str | None
    chat_provider: str
    chat_model: str
    embedding_provider: str
    embedding_model: str
    default_locale: str
    widget_config: dict[str, Any]
    confidence_threshold: float
    staleness_days: int
    created_at: datetime


class WidgetConfigPayload(BaseModel):
    greeting: str = Field(default="", max_length=500)
    suggested_questions: list[str] = Field(default_factory=list, max_length=10)
    bot_name: str = Field(default="", max_length=80)
    bot_avatar_url: str | None = Field(default=None, max_length=2000)
    persona: str = Field(default="", max_length=500)
    accent_color: str = Field(default="#0033ff", max_length=20)


class TemplatePayload(BaseModel):
    key: str
    name: str
    description: str
    system_prompt: str
    greeting: str
    suggested_questions: list[str]
    bot_name: str
    persona: str


def _project_payload(project: Project) -> ProjectPayload:
    return ProjectPayload(
        id=project.id,
        org_id=project.org_id,
        name=project.name,
        template=project.template,
        system_prompt=project.system_prompt,
        chat_provider=project.chat_provider,
        chat_model=project.chat_model,
        embedding_provider=project.embedding_provider,
        embedding_model=project.embedding_model,
        default_locale=project.default_locale,
        widget_config=project.widget_config or {},
        confidence_threshold=project.confidence_threshold,
        staleness_days=project.staleness_days,
        created_at=project.created_at,
    )


def _template_payload(template: PersonaTemplate) -> TemplatePayload:
    return TemplatePayload(
        key=template.key,
        name=template.name,
        description=template.description,
        system_prompt=template.system_prompt,
        greeting=template.greeting,
        suggested_questions=list(template.suggested_questions),
        bot_name=template.bot_name,
        persona=template.persona,
    )


def _validate_providers(chat_provider: str | None, embedding_provider: str | None) -> None:
    if chat_provider is not None and chat_provider not in CHAT_PROVIDERS:
        raise ApiError(f"chat_provider must be one of {', '.join(CHAT_PROVIDERS)}")

    if embedding_provider is None:
        return
    if embedding_provider == "anthropic":
        raise ApiError(
            "anthropic does not offer an embedding model; "
            f"embedding_provider must be one of {', '.join(EMBEDDING_PROVIDERS)}"
        )
    if embedding_provider not in EMBEDDING_PROVIDERS:
        raise ApiError(f"embedding_provider must be one of {', '.join(EMBEDDING_PROVIDERS)}")


def _resolve_template(key: str | None) -> PersonaTemplate | None:
    if key is None:
        return None
    template = get_template(key)
    if template is None:
        raise ApiError(f"unknown template; available templates: {', '.join(template_keys())}")
    return template


@router.get("/project-templates", response_model=list[TemplatePayload])
async def list_project_templates(user: CurrentUser) -> list[TemplatePayload]:
    return [_template_payload(template) for template in list_templates()]


@router.post("/projects", response_model=ProjectPayload, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, user: CurrentUser, session: SessionDep
) -> ProjectPayload:
    organization = await owned_organization(session, user)
    _validate_providers(payload.chat_provider, payload.embedding_provider)
    template = _resolve_template(payload.template)

    settings = get_settings()
    fallback_threshold = (
        template.confidence_threshold if template else settings.confidence_threshold
    )
    fallback_staleness = template.staleness_days if template else settings.document_staleness_days

    project = Project(
        org_id=organization.id,
        name=payload.name,
        template=template.key if template else None,
        system_prompt=payload.system_prompt or (template.system_prompt if template else None),
        chat_provider=payload.chat_provider or settings.default_chat_provider,
        chat_model=payload.chat_model or settings.default_chat_model,
        embedding_provider=payload.embedding_provider or settings.default_embedding_provider,
        embedding_model=payload.embedding_model or settings.default_embedding_model,
        default_locale=payload.default_locale,
        widget_config=template.widget_config() if template else {},
        confidence_threshold=(
            payload.confidence_threshold
            if payload.confidence_threshold is not None
            else fallback_threshold
        ),
        staleness_days=(
            payload.staleness_days if payload.staleness_days is not None else fallback_staleness
        ),
    )
    session.add(project)
    await session.commit()
    return _project_payload(project)


@router.get("/projects", response_model=list[ProjectPayload])
async def list_projects(user: CurrentUser, session: SessionDep) -> list[ProjectPayload]:
    result = await session.execute(
        select(Project)
        .join(Organization, Project.org_id == Organization.id)
        .where(Organization.owner_user_id == user.id)
        .order_by(Project.created_at.desc())
    )
    return [_project_payload(project) for project in result.scalars().all()]


@router.get("/projects/{project_id}", response_model=ProjectPayload)
async def get_project(project_id: str, user: CurrentUser, session: SessionDep) -> ProjectPayload:
    project = await owned_project(session, user, project_id)
    return _project_payload(project)


@router.patch("/projects/{project_id}", response_model=ProjectPayload)
async def update_project(
    project_id: str, payload: ProjectUpdate, user: CurrentUser, session: SessionDep
) -> ProjectPayload:
    project = await owned_project(session, user, project_id)
    _validate_providers(payload.chat_provider, payload.embedding_provider)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await session.commit()
    return _project_payload(project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, user: CurrentUser, session: SessionDep) -> Response:
    project = await owned_project(session, user, project_id)
    await session.delete(project)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/widget-config", response_model=WidgetConfigPayload)
async def get_widget_config(
    project_id: str, user: CurrentUser, session: SessionDep
) -> WidgetConfigPayload:
    project = await owned_project(session, user, project_id)
    return WidgetConfigPayload(**(project.widget_config or {}))


@router.put("/projects/{project_id}/widget-config", response_model=WidgetConfigPayload)
async def replace_widget_config(
    project_id: str, payload: WidgetConfigPayload, user: CurrentUser, session: SessionDep
) -> WidgetConfigPayload:
    project = await owned_project(session, user, project_id)
    project.widget_config = payload.model_dump()
    await session.commit()
    return payload
