from fastapi import FastAPI
from httpx import AsyncClient

from src.api.deps import KeyDep


def _mount_key_probe(app: FastAPI) -> str:
    path = "/test-key-probe"

    @app.get(path)
    async def probe(context: KeyDep) -> dict[str, str]:
        return {"project_id": context.project.id}

    return path


async def _create_project(client: AsyncClient, name: str = "keys") -> str:
    response = await client.post("/v1/projects", json={"name": name})
    return response.json()["id"]


async def _second_owner_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/auth/signup",
        json={"email": "outsider@example.com", "password": "an0ther-secret-pass"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_create_key_returns_raw_key_once(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)

    created = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "secret", "name": "server"}
    )

    assert created.status_code == 201
    body = created.json()
    raw = body["key"]
    assert raw.startswith("sk_")
    assert body["key_prefix"]
    assert raw.startswith(body["key_prefix"])
    assert "key_hash" not in body

    listed = await authed_client.get(f"/v1/projects/{project_id}/api-keys")
    assert listed.status_code == 200
    entry = listed.json()[0]
    assert "key" not in entry
    assert "key_hash" not in entry
    assert entry["key_prefix"] == body["key_prefix"]
    assert raw not in listed.text

    fetched = await authed_client.get(f"/v1/projects/{project_id}/api-keys")
    assert raw not in fetched.text


async def test_default_rate_limits_per_key_type(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)

    secret = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "secret"}
    )
    publishable = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "publishable"}
    )
    sandbox = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "sandbox"}
    )

    assert secret.json()["rate_limit_per_minute"] == 200
    assert publishable.json()["rate_limit_per_minute"] == 20
    assert sandbox.json()["rate_limit_per_minute"] == 20


async def test_create_key_honours_explicit_rate_limit(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)

    created = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys",
        json={"type": "publishable", "rate_limit_per_minute": 5},
    )

    assert created.json()["rate_limit_per_minute"] == 5


async def test_create_key_rejects_unknown_type(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)

    response = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "master"}
    )

    assert response.status_code == 422


async def test_key_authenticates_until_revoked(app: FastAPI, authed_client: AsyncClient) -> None:
    path = _mount_key_probe(app)
    project_id = await _create_project(authed_client)
    created = await authed_client.post(
        f"/v1/projects/{project_id}/api-keys", json={"type": "secret"}
    )
    raw = created.json()["key"]
    key_id = created.json()["id"]

    ok = await authed_client.get(path, headers={"X-API-Key": raw})
    assert ok.status_code == 200
    assert ok.json()["project_id"] == project_id

    revoked = await authed_client.delete(f"/v1/projects/{project_id}/api-keys/{key_id}")
    assert revoked.status_code == 204

    denied = await authed_client.get(path, headers={"X-API-Key": raw})
    assert denied.status_code == 401


async def test_revoked_key_is_kept_for_audit(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)
    key_id = (
        await authed_client.post(f"/v1/projects/{project_id}/api-keys", json={"type": "sandbox"})
    ).json()["id"]

    await authed_client.delete(f"/v1/projects/{project_id}/api-keys/{key_id}")

    listed = await authed_client.get(f"/v1/projects/{project_id}/api-keys")
    entries = listed.json()
    assert len(entries) == 1
    assert entries[0]["id"] == key_id
    assert entries[0]["revoked_at"] is not None


async def test_update_key_metadata(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)
    key_id = (
        await authed_client.post(
            f"/v1/projects/{project_id}/api-keys", json={"type": "publishable"}
        )
    ).json()["id"]

    response = await authed_client.patch(
        f"/v1/projects/{project_id}/api-keys/{key_id}",
        json={
            "name": "widget",
            "allowed_origins": ["https://example.com"],
            "rate_limit_per_minute": 60,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "widget"
    assert body["allowed_origins"] == ["https://example.com"]
    assert body["rate_limit_per_minute"] == 60
    assert "key" not in body


async def test_keys_are_scoped_to_project_owner(authed_client: AsyncClient) -> None:
    project_id = await _create_project(authed_client)
    key_id = (
        await authed_client.post(f"/v1/projects/{project_id}/api-keys", json={"type": "secret"})
    ).json()["id"]
    headers = await _second_owner_headers(authed_client)

    assert (
        await authed_client.get(f"/v1/projects/{project_id}/api-keys", headers=headers)
    ).status_code == 404
    assert (
        await authed_client.post(
            f"/v1/projects/{project_id}/api-keys", json={"type": "secret"}, headers=headers
        )
    ).status_code == 404
    assert (
        await authed_client.patch(
            f"/v1/projects/{project_id}/api-keys/{key_id}", json={"name": "x"}, headers=headers
        )
    ).status_code == 404
    assert (
        await authed_client.delete(f"/v1/projects/{project_id}/api-keys/{key_id}", headers=headers)
    ).status_code == 404


async def test_key_from_another_project_is_not_addressable(authed_client: AsyncClient) -> None:
    first_id = await _create_project(authed_client, "first")
    second_id = await _create_project(authed_client, "second")
    key_id = (
        await authed_client.post(f"/v1/projects/{first_id}/api-keys", json={"type": "secret"})
    ).json()["id"]

    response = await authed_client.patch(
        f"/v1/projects/{second_id}/api-keys/{key_id}", json={"name": "x"}
    )

    assert response.status_code == 404


async def test_unknown_key_is_rejected(app: FastAPI, authed_client: AsyncClient) -> None:
    path = _mount_key_probe(app)

    assert (await authed_client.get(path)).status_code == 401
    assert (await authed_client.get(path, headers={"X-API-Key": "nope"})).status_code == 401
    assert (
        await authed_client.get(path, headers={"X-API-Key": "sk_does_not_exist"})
    ).status_code == 401
