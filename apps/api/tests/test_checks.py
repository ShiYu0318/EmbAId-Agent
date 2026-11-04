import pytest

from src.config import Settings
from src.providers import checks


class FakeEmbeddings:
    def __init__(self, size: int) -> None:
        self.size = size

    async def aembed_query(self, text: str) -> list[float]:
        return [0.0] * self.size


@pytest.mark.parametrize(("actual", "status"), [(768, "ok"), (1024, "mismatch")])
async def test_reports_whether_dimensions_match(
    monkeypatch: pytest.MonkeyPatch, actual: int, status: str
) -> None:
    monkeypatch.setattr(checks, "build_embeddings", lambda p, m: FakeEmbeddings(actual))
    result = await checks.check_embedding_dimensions(
        Settings(embedding_dimensions=768, search_backend="postgres")
    )
    assert result["status"] == status
    assert result["actual_dimensions"] == actual
    assert checks.embedding_check()["status"] == status


async def test_an_unreachable_provider_is_reported_not_raised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(provider: str, model: str) -> FakeEmbeddings:
        raise RuntimeError("openai_api_key is not set")

    monkeypatch.setattr(checks, "build_embeddings", broken)
    result = await checks.check_embedding_dimensions(Settings())
    assert result["status"] == "unavailable"
    assert "openai_api_key" in result["detail"]
