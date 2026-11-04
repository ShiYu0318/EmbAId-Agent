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


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> Settings:
    current = Settings(
        azure_openai_endpoint="https://example.openai.azure.com",
        azure_openai_api_key="az-key",
        aws_region="us-east-1",
        google_cloud_project="my-project",
    )
    monkeypatch.setattr(registry, "get_settings", lambda: current)
    return current


def test_azure_uses_the_deployment_name(cloud: Settings) -> None:
    model = build_chat_model("azure_openai", "my-gpt-deployment")
    assert model.deployment_name == "my-gpt-deployment"
    assert model.azure_endpoint == "https://example.openai.azure.com"
    embeddings = build_embeddings("azure_openai", "my-embedding-deployment")
    assert embeddings.deployment == "my-embedding-deployment"


def test_bedrock_uses_the_configured_region(cloud: Settings) -> None:
    pytest.importorskip("langchain_aws")
    model = build_chat_model("bedrock", "anthropic.claude-sonnet-5")
    assert model.model_id == "anthropic.claude-sonnet-5"
    assert model.region_name == "us-east-1"


def test_vertex_passes_project_and_location(
    cloud: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    created: dict[str, object] = {}

    class FakeVertex:
        @staticmethod
        def ChatVertexAI(**kwargs: object) -> dict[str, object]:  # noqa: N802
            created.update(kwargs)
            return kwargs

    monkeypatch.setattr(registry, "_module", lambda name, extra: FakeVertex)
    build_chat_model("vertex", "gemini-3.8-flash")
    assert created["project"] == "my-project"
    assert created["location"] == "us-central1"


def test_missing_extra_says_how_to_install_it(
    cloud: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def missing(name: str) -> object:
        raise ImportError(name)

    monkeypatch.setattr(registry.importlib, "import_module", missing)
    with pytest.raises(ProviderNotConfiguredError, match="uv sync --extra vertex"):
        build_chat_model("vertex", "gemini-3.8-flash")


def test_cloud_providers_report_missing_settings() -> None:
    status = provider_status(Settings())
    assert not status["azure_openai"] and not status["bedrock"] and not status["vertex"]


def test_claude_has_room_to_think_before_answering(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(registry, "get_settings", lambda: Settings(anthropic_api_key="sk-ant"))
    model = build_chat_model("anthropic", "claude-sonnet-5-5")
    assert model.max_tokens >= 16000
    payload = model._get_request_payload([("user", "hi")])
    assert "temperature" not in payload  # Claude Sonnet 5.5 rejects non-default sampling
