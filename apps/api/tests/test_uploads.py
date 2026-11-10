from pathlib import Path

import pytest
from httpx import AsyncClient

from src.api.routers import sources
from src.ingestion.jobs import safe_filename, storage_key_for
from src.storage import LocalStorage, StorageKeyError


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("..\\..\\windows\\system32\\cfg.txt", "cfg.txt"),
        ("/abs/path/report.pdf", "report.pdf"),
        ("退貨 政策.md", "退貨 政策.md"),
        ("a\x00b<script>.txt", "a_b_script_.txt"),
        ("...", "document"),
        ("", "document"),
        (None, "document"),
    ],
)
def test_safe_filename(raw: str | None, expected: str) -> None:
    assert safe_filename(raw) == expected


def test_safe_filename_keeps_extension_when_truncating() -> None:
    name = safe_filename("x" * 400 + ".pdf")
    assert len(name) <= 120
    assert name.endswith(".pdf")


def test_storage_key_is_three_segments() -> None:
    assert storage_key_for("proj_1", "doc_1", "../../x.txt").split("/") == [
        "proj_1",
        "doc_1",
        "x.txt",
    ]


async def test_local_storage_rejects_escaping_keys(tmp_path: Path) -> None:
    storage = LocalStorage(str(tmp_path / "objects"))
    await storage.put("proj/doc/file.txt", b"ok", "text/plain")
    assert await storage.get("proj/doc/file.txt") == b"ok"

    for key in ("../outside.txt", "proj/../../outside.txt", "/etc/passwd", ""):
        with pytest.raises(StorageKeyError):
            await storage.put(key, b"x", "text/plain")
    assert not (tmp_path / "outside.txt").exists()


async def test_oversized_upload_is_rejected(
    authed_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sources, "MAX_UPLOAD_BYTES", 1024)
    monkeypatch.setattr(sources, "UPLOAD_CHUNK_BYTES", 256)
    project = await authed_client.post("/v1/projects", json={"name": "KB"})

    response = await authed_client.post(
        f"/v1/projects/{project.json()['id']}/documents/upload",
        files={"file": ("big.txt", b"x" * 5000, "text/plain")},
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "payload_too_large"
