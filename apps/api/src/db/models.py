from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from . import ids


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[str]: JSON}


def _now_column(**kwargs: Any) -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), **kwargs)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.user_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), default=None)
    google_sub: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, default=None
    )
    display_name: Mapped[str | None] = mapped_column(String(120), default=None)
    avatar_url: Mapped[str | None] = mapped_column(String(500), default=None)
    locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    created_at: Mapped[datetime] = _now_column()

    organizations: Mapped[list["Organization"]] = relationship(back_populates="owner")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.org_id)
    name: Mapped[str] = mapped_column(String(160))
    owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = _now_column()

    owner: Mapped[User] = relationship(back_populates="organizations")
    projects: Mapped[list["Project"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.project_id)
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    template: Mapped[str | None] = mapped_column(String(40), default=None)
    system_prompt: Mapped[str | None] = mapped_column(Text, default=None)
    chat_provider: Mapped[str] = mapped_column(String(40), default="anthropic")
    chat_model: Mapped[str] = mapped_column(String(120), default="claude-sonnet-5")
    embedding_provider: Mapped[str] = mapped_column(String(40), default="openai")
    embedding_model: Mapped[str] = mapped_column(String(120), default="text-embedding-3-small")
    default_locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    widget_config: Mapped[dict[str, Any]] = mapped_column(default=dict)
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.35)
    staleness_days: Mapped[int] = mapped_column(Integer, default=180)
    created_at: Mapped[datetime] = _now_column()

    organization: Mapped[Organization] = relationship(back_populates="projects")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.api_key_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120), default="default")
    type: Mapped[str] = mapped_column(String(20))
    key_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(24), index=True)
    allowed_origins: Mapped[list[str]] = mapped_column(default=list)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=20)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = _now_column()


class IngestionSource(Base):
    __tablename__ = "ingestion_sources"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.source_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(40))
    config: Mapped[dict[str, Any]] = mapped_column(default=dict)
    schedule: Mapped[str | None] = mapped_column(String(40), default=None)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_error: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = _now_column()


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.document_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str | None] = mapped_column(
        ForeignKey("ingestion_sources.id", ondelete="SET NULL"), default=None, index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(String(2000), default=None)
    storage_key: Mapped[str | None] = mapped_column(String(500), default=None)
    content_hash: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    error: Mapped[str | None] = mapped_column(Text, default=None)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = _now_column()
    updated_at: Mapped[datetime] = _now_column(onupdate=func.now())

    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_tag_project_name"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.tag_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = _now_column()


class DocumentTag(Base):
    __tablename__ = "document_tags"

    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.chunk_id)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str] = mapped_column(String(40), index=True)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[str] = mapped_column(Text)
    contextual_content: Mapped[str | None] = mapped_column(Text, default=None)
    trust_score: Mapped[float] = mapped_column(Float, default=1.0)
    meta: Mapped[dict[str, Any]] = mapped_column("metadata", default=dict)
    created_at: Mapped[datetime] = _now_column()

    document: Mapped[Document] = relationship(back_populates="chunks")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.conversation_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(20), default="widget")
    visitor_id: Mapped[str | None] = mapped_column(String(80), default=None, index=True)
    is_sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str | None] = mapped_column(String(300), default=None)
    locale: Mapped[str] = mapped_column(String(10), default="zh-TW")
    started_at: Mapped[datetime] = _now_column()
    last_message_at: Mapped[datetime] = _now_column(onupdate=func.now())

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.message_id)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[dict[str, Any]] = mapped_column(default=dict)
    confidence_score: Mapped[float | None] = mapped_column(Float, default=None)
    retrieval_trace: Mapped[dict[str, Any]] = mapped_column(default=dict)
    feedback: Mapped[str | None] = mapped_column(String(10), default=None)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _now_column()

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class FlaggedQuestion(Base):
    __tablename__ = "flagged_questions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.flagged_question_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    question_text: Mapped[str] = mapped_column(Text)
    normalized_text: Mapped[str] = mapped_column(String(500), index=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    draft_answer: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = _now_column()
    updated_at: Mapped[datetime] = _now_column(onupdate=func.now())


class SemanticCacheEntry(Base):
    __tablename__ = "semantic_cache"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.cache_entry_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    citations: Mapped[dict[str, Any]] = mapped_column(default=dict)
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _now_column()


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.webhook_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(2000))
    secret: Mapped[str] = mapped_column(String(120))
    subscribed_events: Mapped[list[str]] = mapped_column(default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = _now_column()


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.delivery_id)
    endpoint_id: Mapped[str] = mapped_column(
        ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), index=True
    )
    event: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict[str, Any]] = mapped_column(default=dict)
    status_code: Mapped[int | None] = mapped_column(Integer, default=None)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = _now_column()
