from functools import lru_cache
from typing import Any, Literal

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "staging", "production"] = "development"
    api_public_url: str = "http://localhost:8000"
    dashboard_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    database_url: str = "sqlite+aiosqlite:///./data/embaid.sqlite"
    search_backend: Literal["sqlite_faiss", "postgres"] = "sqlite_faiss"
    faiss_index_dir: str = "./data/indices"

    redis_url: str = "redis://localhost:6379"
    queue_enabled: bool = True

    jwt_secret: str = "change-me-in-production"
    jwt_access_ttl_minutes: int = 30
    jwt_refresh_ttl_days: int = 30

    storage_endpoint_url: str | None = None
    storage_bucket: str = "embaid"
    storage_access_key: str | None = None
    storage_secret_key: str | None = None
    storage_region: str = "us-east-1"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    # OpenAI-compatible services (see providers/registry.py)
    openrouter_api_key: str | None = None
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    deepseek_api_key: str | None = None
    openai_compatible_base_url: str | None = None
    openai_compatible_api_key: str | None = None

    default_chat_provider: Literal[
        "anthropic",
        "openai",
        "ollama",
        "openrouter",
        "groq",
        "gemini",
        "deepseek",
        "openai_compatible",
    ] = "anthropic"
    default_chat_model: str = "claude-sonnet-5"
    default_embedding_provider: Literal["openai", "ollama", "gemini", "openai_compatible"] = (
        "openai"
    )
    default_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    rerank_enabled: bool = True
    rerank_model: str = "BAAI/bge-reranker-v2-m3"
    retrieval_candidates: int = 30
    retrieval_top_k: int = 6
    confidence_threshold: float = 0.35
    semantic_cache_enabled: bool = True
    semantic_cache_threshold: float = 0.95
    contextual_embedding_enabled: bool = True
    document_staleness_days: int = 180

    rate_limit_publishable: int = 20
    rate_limit_secret: int = 200

    google_client_id: str | None = None
    google_client_secret: str | None = None
    oauth_redirect_base: str = "http://localhost:8000"

    sentry_dsn: str | None = None
    # Built widget served at /widget.js; found automatically in the monorepo and Docker image.
    widget_bundle_path: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _comment_means_unset(cls, value: Any, info: ValidationInfo) -> Any:
        # `KEY=   # note` reads as the value "# note" in a .env file: treat it as unset.
        if isinstance(value, str) and value.strip().startswith("#"):
            return cls.model_fields[info.field_name].default
        return value

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_redirect_uri(self) -> str:
        return f"{self.oauth_redirect_base.rstrip('/')}/auth/oauth/google/callback"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
