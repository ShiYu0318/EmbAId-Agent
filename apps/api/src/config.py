from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "staging", "production"] = "development"
    api_public_url: str = "http://localhost:8000"
    dashboard_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    database_url: str = "sqlite+aiosqlite:///./data/proprai.sqlite"
    search_backend: Literal["sqlite_faiss", "postgres"] = "sqlite_faiss"
    faiss_index_dir: str = "./data/indices"

    redis_url: str = "redis://localhost:6379"
    queue_enabled: bool = True

    jwt_secret: str = "change-me-in-production"
    jwt_access_ttl_minutes: int = 30
    jwt_refresh_ttl_days: int = 30

    storage_endpoint_url: str | None = None
    storage_bucket: str = "proprai"
    storage_access_key: str | None = None
    storage_secret_key: str | None = None
    storage_region: str = "us-east-1"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"

    default_chat_provider: Literal["anthropic", "openai", "ollama"] = "anthropic"
    default_chat_model: str = "claude-sonnet-5"
    default_embedding_provider: Literal["openai", "ollama"] = "openai"
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

    sentry_dsn: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
