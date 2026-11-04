import shutil
from pathlib import Path

import pytest

from src import setup
from src.config import Settings

EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


@pytest.fixture
def env_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    shutil.copy(EXAMPLE, tmp_path / ".env.example")
    # Environment variables win over the file; clear them so the file is what gets read.
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.setattr(setup, "missing_ollama_models", lambda base_url, wanted: [])
    return tmp_path / ".env"


def test_ollama_preset_writes_a_working_local_setup(env_path: Path) -> None:
    assert setup.run(env_path, "ollama", interactive=False) == 0

    settings = Settings(_env_file=env_path)
    assert len(settings.jwt_secret) == 64
    assert settings.default_chat_provider == "ollama"
    assert settings.default_embedding_model == "nomic-embed-text"
    assert settings.embedding_dimensions == 768
    assert settings.queue_enabled is False
    assert "# --- Models" in env_path.read_text()  # comments survive


def test_rerunning_keeps_the_secret_and_switches_models(env_path: Path) -> None:
    setup.run(env_path, "ollama", interactive=False)
    secret = Settings(_env_file=env_path).jwt_secret

    setup.run(env_path, "gemini", interactive=False)
    settings = Settings(_env_file=env_path)
    assert settings.jwt_secret == secret
    assert settings.default_chat_provider == "gemini"
    assert settings.embedding_dimensions == 3072


def test_interactive_run_stores_the_keys_it_asks_for(
    env_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    answers = iter(["2", "2"])  # Anthropic + OpenAI, then Claude Sonnet 5.5
    monkeypatch.setattr("builtins.input", lambda prompt="": next(answers))
    keys = iter(["sk-ant-test", ""])  # skip the OpenAI key
    monkeypatch.setattr(setup.getpass, "getpass", lambda prompt="": next(keys))

    setup.run(env_path, None, interactive=True)

    settings = Settings(_env_file=env_path)
    assert settings.default_chat_provider == "anthropic"
    assert settings.default_chat_model == "claude-sonnet-5-5"
    assert settings.anthropic_api_key == "sk-ant-test"
    assert not settings.openai_api_key


def test_set_value_keeps_trailing_comments() -> None:
    text = "QUEUE_ENABLED=false   # explained here\n"
    assert (
        setup.set_value(text, "QUEUE_ENABLED", "true") == "QUEUE_ENABLED=true   # explained here\n"
    )
    assert setup.set_value(text, "NEW_KEY", "x").endswith("NEW_KEY=x\n")
