import pytest
from httpx import AsyncClient

from src.config import Settings
from src.providers import registry
from src.providers.registry import (
    CHAT_PROVIDERS,
    EMBEDDING_PROVIDERS,
    ProviderNotConfiguredError,
    build_chat_model,
    build_embeddings,
    provider_status,
)


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    current = Settings(
        groq_api_key="gsk_test",
        gemini_api_key="gem_test",
        openai_compatible_base_url="http://localhost:1234/v1",
    )
    monkeypatch.setattr(registry, "get_settings", lambda: current)
    return current


@pytest.mark.parametrize(
    ("provider", "base_url"),
    [
        ("groq", "https://api.groq.com/openai/v1"),
        ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/"),
        ("openai_compatible", "http://localhost:1234/v1"),
    ],
)
def test_compatible_chat_models_point_at_their_service(
    settings: Settings, provider: str, base_url: str
) -> None:
    model = build_chat_model(provider, "some-model")
    assert model.openai_api_base == base_url
    assert model.model_name == "some-model"


def test_missing_key_names_the_setting(settings: Settings) -> None:
    with pytest.raises(ProviderNotConfiguredError, match="openrouter_api_key"):
        build_chat_model("openrouter", "anthropic/claude-sonnet-5")


def test_self_hosted_compatible_server_needs_no_key(settings: Settings) -> None:
    model = build_chat_model("openai_compatible", "local-model")
    assert model.openai_api_key.get_secret_value() == "not-needed"


def test_gemini_embeddings_send_raw_text(settings: Settings) -> None:
    embeddings = build_embeddings("gemini", "gemini-embedding-001")
    assert embeddings.check_embedding_ctx_length is False


def test_chat_only_services_are_not_embedding_providers() -> None:
    assert {"groq", "openrouter", "deepseek"} <= set(CHAT_PROVIDERS)
    assert not {"groq", "openrouter", "deepseek"} & set(EMBEDDING_PROVIDERS)
    with pytest.raises(ProviderNotConfiguredError):
        build_embeddings("groq", "anything")


def test_status_reports_each_provider(settings: Settings) -> None:
    status = provider_status(settings)
    assert status["groq"] and status["gemini"] and status["openai_compatible"]
    assert not status["openrouter"] and not status["deepseek"]


async def test_projects_accept_compatible_providers(authed_client: AsyncClient) -> None:
    created = await authed_client.post(
        "/v1/projects",
        json={"name": "Groq", "chat_provider": "groq", "chat_model": "llama-3.3-70b-versatile"},
    )
    assert created.status_code == 201
    assert created.json()["chat_provider"] == "groq"

    rejected = await authed_client.patch(
        f"/v1/projects/{created.json()['id']}", json={"embedding_provider": "groq"}
    )
    assert rejected.status_code == 400


def test_a_comment_after_an_empty_setting_is_not_a_value() -> None:
    settings = Settings(groq_api_key="# https://console.groq.com/keys")
    assert settings.groq_api_key is None
    assert provider_status(settings)["groq"] is False
