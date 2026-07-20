from httpx import AsyncClient


async def test_signup_returns_tokens_and_creates_organization(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/signup",
        json={"email": "Founder@Example.com", "password": "sup3r-secret-pass"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "founder@example.com"
    assert body["access_token"]
    assert body["refresh_token"]


async def test_signup_rejects_duplicate_email(client: AsyncClient) -> None:
    payload = {"email": "dupe@example.com", "password": "sup3r-secret-pass"}
    await client.post("/auth/signup", json=payload)
    response = await client.post("/auth/signup", json=payload)

    assert response.status_code == 409


async def test_signup_rejects_weak_password(client: AsyncClient) -> None:
    response = await client.post(
        "/auth/signup", json={"email": "weak@example.com", "password": "abcdefghijkl"}
    )

    assert response.status_code == 400


async def test_login_and_me_roundtrip(client: AsyncClient) -> None:
    await client.post(
        "/auth/signup", json={"email": "user@example.com", "password": "sup3r-secret-pass"}
    )

    login = await client.post(
        "/auth/login", json={"email": "user@example.com", "password": "sup3r-secret-pass"}
    )
    assert login.status_code == 200

    token = login.json()["access_token"]
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "user@example.com"


async def test_login_rejects_bad_password(client: AsyncClient) -> None:
    await client.post(
        "/auth/signup", json={"email": "victim@example.com", "password": "sup3r-secret-pass"}
    )

    response = await client.post(
        "/auth/login", json={"email": "victim@example.com", "password": "wrong-password-1"}
    )
    assert response.status_code == 401


async def test_refresh_token_issues_new_access_token(client: AsyncClient) -> None:
    signup = await client.post(
        "/auth/signup", json={"email": "refresh@example.com", "password": "sup3r-secret-pass"}
    )
    refresh_token = signup.json()["refresh_token"]

    response = await client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_access_token_rejected_as_refresh_token(client: AsyncClient) -> None:
    signup = await client.post(
        "/auth/signup", json={"email": "mixup@example.com", "password": "sup3r-secret-pass"}
    )

    response = await client.post(
        "/auth/refresh", json={"refresh_token": signup.json()["access_token"]}
    )
    assert response.status_code == 401


async def test_me_requires_authentication(client: AsyncClient) -> None:
    response = await client.get("/auth/me")
    assert response.status_code == 401
