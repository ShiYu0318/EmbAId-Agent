import os
import subprocess
import sys
from pathlib import Path

import pytest

from src.config import Settings


def test_developer_dotenv_does_not_configure_tests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / ".env").write_text(
        "ENVIRONMENT=production\n"
        "DEFAULT_CHAT_PROVIDER=ollama\n"
        "GOOGLE_CLIENT_ID=developer-client\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)

    settings = Settings()

    assert settings.environment == "development"
    assert settings.default_chat_provider == "anthropic"
    assert settings.google_client_id is None
    assert settings.database_url == "sqlite+aiosqlite:///:memory:"


def test_exported_mixed_case_settings_are_isolated() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "tests/test_environment.py::test_developer_dotenv_does_not_configure_tests",
        ],
        cwd=Path(__file__).resolve().parents[1],
        env={
            **os.environ,
            "environment": "production",
            "DeFaUlT_ChAt_PrOvIdEr": "ollama",
            "GoOgLe_ClIeNt_Id": "developer-client",
        },
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stdout + result.stderr
