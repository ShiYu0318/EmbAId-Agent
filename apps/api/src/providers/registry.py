import importlib
from dataclasses import dataclass
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

from ..config import Settings, get_settings


class ProviderNotConfiguredError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class CompatibleProvider:
    """A service that speaks the OpenAI API at its own base URL."""

    base_url: str | None  # None: read OPENAI_COMPATIBLE_BASE_URL
    key_setting: str
    embeddings: bool
    key_required: bool = True


# One adapter covers every OpenAI-compatible service; each entry is just an address and a key.
COMPATIBLE_PROVIDERS: dict[str, CompatibleProvider] = {
    "openrouter": CompatibleProvider("https://openrouter.ai/api/v1", "openrouter_api_key", False),
    "groq": CompatibleProvider("https://api.groq.com/openai/v1", "groq_api_key", False),
    "gemini": CompatibleProvider(
        "https://generativelanguage.googleapis.com/v1beta/openai/", "gemini_api_key", True
    ),
    "deepseek": CompatibleProvider("https://api.deepseek.com", "deepseek_api_key", False),
    # Anything else with an OpenAI-style API: vLLM, LM Studio, Together, Mistral, a gateway...
    "openai_compatible": CompatibleProvider(
        None, "openai_compatible_api_key", True, key_required=False
    ),
}

# Enterprise clouds; Bedrock and Vertex need optional extras (uv sync --extra bedrock / vertex).
CLOUD_PROVIDERS: tuple[str, ...] = ("azure_openai", "bedrock", "vertex")

CHAT_PROVIDERS: tuple[str, ...] = (
    "anthropic",
    "openai",
    "ollama",
    *COMPATIBLE_PROVIDERS,
    *CLOUD_PROVIDERS,
)
EMBEDDING_PROVIDERS: tuple[str, ...] = (
    "openai",
    "ollama",
    *(name for name, spec in COMPATIBLE_PROVIDERS.items() if spec.embeddings),
    *CLOUD_PROVIDERS,
)


def _module(name: str, extra: str) -> Any:
    try:
        return importlib.import_module(name)
    except ImportError as exc:
        raise ProviderNotConfiguredError(
            f"{name} is not installed: run `uv sync --extra {extra}`"
        ) from exc


def _cloud_ready(provider: str, settings: Settings) -> None:
    """Raise ProviderNotConfiguredError unless the cloud provider can be used."""
    if provider == "azure_openai":
        if not (settings.azure_openai_endpoint and settings.azure_openai_api_key):
            raise ProviderNotConfiguredError(
                "azure_openai_endpoint and azure_openai_api_key must be set"
            )
    elif provider == "bedrock":
        if not settings.aws_region:
            raise ProviderNotConfiguredError("aws_region is not set")
        _module("langchain_aws", "bedrock")
    elif provider == "vertex":
        if not settings.google_cloud_project:
            raise ProviderNotConfiguredError("google_cloud_project is not set")
        _module("langchain_google_vertexai", "vertex")


def _compatible_endpoint(name: str, settings: Settings) -> tuple[str, str]:
    spec = COMPATIBLE_PROVIDERS[name]
    base_url = spec.base_url or settings.openai_compatible_base_url
    if not base_url:
        raise ProviderNotConfiguredError("openai_compatible_base_url is not set")
    key = getattr(settings, spec.key_setting)
    if not key:
        if spec.key_required:
            raise ProviderNotConfiguredError(f"{spec.key_setting} is not set")
        key = "not-needed"  # many self-hosted servers ignore the key
    return base_url, key


def provider_status(settings: Settings | None = None) -> dict[str, bool]:
    """Which providers have what they need to be used."""
    settings = settings or get_settings()
    status = {
        "anthropic": bool(settings.anthropic_api_key),
        "openai": bool(settings.openai_api_key),
        "ollama": bool(settings.ollama_base_url),
    }
    for name in COMPATIBLE_PROVIDERS:
        try:
            _compatible_endpoint(name, settings)
            status[name] = True
        except ProviderNotConfiguredError:
            status[name] = False
    for name in CLOUD_PROVIDERS:
        try:
            _cloud_ready(name, settings)
            status[name] = True
        except ProviderNotConfiguredError:
            status[name] = False
    return status


def build_chat_model(provider: str, model: str, streaming: bool = True) -> BaseChatModel:
    settings = get_settings()

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise ProviderNotConfiguredError("anthropic_api_key is not set")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model,
            api_key=settings.anthropic_api_key,
            streaming=streaming,
            max_tokens=2048,
        )

    if provider == "openai":
        if not settings.openai_api_key:
            raise ProviderNotConfiguredError("openai_api_key is not set")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=model, api_key=settings.openai_api_key, streaming=streaming)

    if provider == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(model=model, base_url=settings.ollama_base_url)

    if provider in COMPATIBLE_PROVIDERS:
        from langchain_openai import ChatOpenAI

        base_url, key = _compatible_endpoint(provider, settings)
        return ChatOpenAI(model=model, api_key=key, base_url=base_url, streaming=streaming)

    if provider in CLOUD_PROVIDERS:
        _cloud_ready(provider, settings)
        if provider == "azure_openai":
            from langchain_openai import AzureChatOpenAI

            return AzureChatOpenAI(
                azure_deployment=model,  # Azure addresses models by deployment name
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
                streaming=streaming,
            )
        if provider == "bedrock":
            aws = _module("langchain_aws", "bedrock")
            return aws.ChatBedrockConverse(model_id=model, region_name=settings.aws_region)
        vertex = _module("langchain_google_vertexai", "vertex")
        return vertex.ChatVertexAI(
            model_name=model,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
            streaming=streaming,
        )

    raise ProviderNotConfiguredError(f"unknown chat provider: {provider}")


def build_embeddings(provider: str, model: str) -> Embeddings:
    settings = get_settings()

    if provider == "openai":
        if not settings.openai_api_key:
            raise ProviderNotConfiguredError("openai_api_key is not set")
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(model=model, api_key=settings.openai_api_key)

    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(model=model, base_url=settings.ollama_base_url)

    if provider in COMPATIBLE_PROVIDERS and COMPATIBLE_PROVIDERS[provider].embeddings:
        from langchain_openai import OpenAIEmbeddings

        base_url, key = _compatible_endpoint(provider, settings)
        # Send raw text: OpenAI's tokenizer-based chunking does not apply to other models.
        return OpenAIEmbeddings(
            model=model, api_key=key, base_url=base_url, check_embedding_ctx_length=False
        )

    if provider in CLOUD_PROVIDERS:
        _cloud_ready(provider, settings)
        if provider == "azure_openai":
            from langchain_openai import AzureOpenAIEmbeddings

            return AzureOpenAIEmbeddings(
                azure_deployment=model,
                azure_endpoint=settings.azure_openai_endpoint,
                api_key=settings.azure_openai_api_key,
                api_version=settings.azure_openai_api_version,
            )
        if provider == "bedrock":
            aws = _module("langchain_aws", "bedrock")
            return aws.BedrockEmbeddings(model_id=model, region_name=settings.aws_region)
        vertex = _module("langchain_google_vertexai", "vertex")
        return vertex.VertexAIEmbeddings(
            model_name=model,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )

    raise ProviderNotConfiguredError(f"unknown embedding provider: {provider}")
