from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, Response, status
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...db.models import Document, FlaggedQuestion, Organization, Project, User
from ...ingestion import jobs
from ...providers.registry import ProviderNotConfiguredError, build_chat_model
from ...storage import get_storage
from ..deps import CurrentUser, SessionDep, owned_project
from ..errors import ApiError, NotFound, ProviderUnavailable

router = APIRouter(prefix="/v1", tags=["knowledge-gaps"])

DRAFT_SYSTEM_PROMPT = (
    "你是一位知識庫維運助理。使用者提出的問題目前在知識庫中找不到答案。"
    "請草擬一則簡潔、實用、語氣中性的答覆，供管理者審閱後收錄。"
    "若你不確定事實內容，請明確指出需要人工補充的部分，不要杜撰。"
    "請以繁體中文作答。"
)


class GapPayload(BaseModel):
    id: str
    project_id: str
    question_text: str
    occurrence_count: int
    draft_answer: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class DraftPayload(BaseModel):
    id: str
    draft_answer: str
    status: str


class ApproveRequest(BaseModel):
    answer: str | None = Field(default=None, max_length=8000)
    title: str | None = Field(default=None, max_length=200)


class ApprovePayload(BaseModel):
    id: str
    status: str
    document_id: str


def _payload(gap: FlaggedQuestion) -> GapPayload:
    return GapPayload(
        id=gap.id,
        project_id=gap.project_id,
        question_text=gap.question_text,
        occurrence_count=gap.occurrence_count,
        draft_answer=gap.draft_answer,
        status=gap.status,
        created_at=gap.created_at,
        updated_at=gap.updated_at,
    )


async def _owned_gap(session: AsyncSession, user: User, gap_id: str) -> FlaggedQuestion:
    result = await session.execute(
        select(FlaggedQuestion)
        .join(Project, FlaggedQuestion.project_id == Project.id)
        .join(Organization, Project.org_id == Organization.id)
        .where(FlaggedQuestion.id == gap_id, Organization.owner_user_id == user.id)
    )
    gap = result.scalars().first()
    if gap is None:
        raise NotFound("knowledge gap not found")
    return gap


@router.get("/projects/{project_id}/knowledge-gaps", response_model=list[GapPayload])
async def list_gaps(
    project_id: str,
    user: CurrentUser,
    session: SessionDep,
    gap_status: Literal["open", "draft_ready", "resolved"] | None = Query(
        default=None, alias="status"
    ),
    limit: int = Query(default=50, le=200),
) -> list[GapPayload]:
    project = await owned_project(session, user, project_id)

    query = select(FlaggedQuestion).where(FlaggedQuestion.project_id == project.id)
    if gap_status:
        query = query.where(FlaggedQuestion.status == gap_status)

    result = await session.execute(
        query.order_by(
            FlaggedQuestion.occurrence_count.desc(), FlaggedQuestion.updated_at.desc()
        ).limit(limit)
    )
    return [_payload(gap) for gap in result.scalars().all()]


@router.post("/knowledge-gaps/{gap_id}/draft-answer", response_model=DraftPayload)
async def draft_answer(gap_id: str, user: CurrentUser, session: SessionDep) -> DraftPayload:
    gap = await _owned_gap(session, user, gap_id)
    project = await session.get(Project, gap.project_id)
    if project is None:
        raise NotFound("project not found")

    try:
        model = build_chat_model(project.chat_provider, project.chat_model, streaming=False)
    except ProviderNotConfiguredError as exc:
        raise ProviderUnavailable(str(exc)) from exc

    response = await model.ainvoke(
        [SystemMessage(content=DRAFT_SYSTEM_PROMPT), HumanMessage(content=gap.question_text)]
    )
    content = response.content if isinstance(response.content, str) else str(response.content)

    gap.draft_answer = content
    gap.status = "draft_ready"
    await session.commit()
    return DraftPayload(id=gap.id, draft_answer=content, status=gap.status)


@router.post("/knowledge-gaps/{gap_id}/approve", response_model=ApprovePayload)
async def approve_gap(
    gap_id: str, payload: ApproveRequest, user: CurrentUser, session: SessionDep
) -> ApprovePayload:
    gap = await _owned_gap(session, user, gap_id)
    answer = (payload.answer or gap.draft_answer or "").strip()
    if not answer:
        raise ApiError("an answer is required before approving")

    title = (payload.title or gap.question_text)[:500]
    document = Document(project_id=gap.project_id, title=title, status="pending")
    session.add(document)
    await session.flush()

    body = f"# {title}\n\n問題：{gap.question_text}\n\n{answer}\n"
    document.storage_key = jobs.storage_key_for(gap.project_id, document.id, "answer.md")
    await get_storage().put(document.storage_key, body.encode(), "text/markdown")

    gap.status = "resolved"
    gap.draft_answer = answer
    await session.commit()

    await jobs.dispatch_document(document.id)
    return ApprovePayload(id=gap.id, status=gap.status, document_id=document.id)


@router.delete("/knowledge-gaps/{gap_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_gap(gap_id: str, user: CurrentUser, session: SessionDep) -> Response:
    gap = await _owned_gap(session, user, gap_id)
    await session.delete(gap)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
