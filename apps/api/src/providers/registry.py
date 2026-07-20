from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

from ..config import get_settings


class ProviderNotConfiguredError(RuntimeError):
    pass


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

    raise ProviderNotConfiguredError(f"unknown embedding provider: {provider}")
