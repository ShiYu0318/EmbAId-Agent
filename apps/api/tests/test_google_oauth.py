import pytest
from httpx import AsyncClient

from src.api.services import google_oauth
from src.config import get_settings


async def test_providers_reports_google_disabled_by_default(client: AsyncClient) -> None:
    response = await client.get("/auth/providers")
    assert response.status_code == 200
    assert response.json()["google"] is False


async def test_google_login_rejected_when_not_configured(client: AsyncClient) -> None:
    response = await client.get("/auth/oauth/google", follow_redirects=False)
    assert response.status_code == 400


async def test_state_roundtrip_preserves_next_path() -> None:
    state = google_oauth._sign_state("/settings")
    assert google_oauth.verify_state(state) == "/settings"


async def test_verify_state_rejects_tampered_token() -> None:
    with pytest.raises(google_oauth.OAuthError):
        google_oauth.verify_state("not-a-real-state")


async def test_authorization_url_contains_redirect_and_scope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "client-123")
    monkeypatch.setattr(settings, "google_client_secret", "secret-abc")
    monkeypatch.setattr(settings, "oauth_redirect_base", "http://localhost:8001")

    url = google_oauth.authorization_url("/")
    assert "accounts.google.com" in url
    assert "client_id=client-123" in url
    assert "scope=openid" in url
    assert "auth%2Foauth%2Fgoogle%2Fcallback" in url


async def test_callback_redirects_to_login_on_error(client: AsyncClient) -> None:
    response = await client.get(
        "/auth/oauth/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert response.status_code == 307
    assert "/login?" in response.headers["location"]
    assert "oauth_error" in response.headers["location"]


async def test_google_user_upsert_creates_account_and_org(client: AsyncClient) -> None:
    from sqlalchemy import select

    from src.api.routers.auth import _upsert_google_user
    from src.db.models import Organization, User
    from src.db.session import session_scope

    profile = google_oauth.GoogleProfile(
        sub="google-sub-1", email="oauth@example.com", name="OAuth User", picture=None
    )

    async with session_scope() as session:
        user = await _upsert_google_user(session, profile)
        assert user.google_sub == "google-sub-1"
        assert user.password_hash is None

    async with session_scope() as session:
        org = (
            (
                await session.execute(
                    select(Organization).where(Organization.owner_user_id == user.id)
                )
            )
            .scalars()
            .first()
        )
        assert org is not None

        again = await _upsert_google_user(session, profile)
        assert again.id == user.id

        count = len((await session.execute(select(User))).scalars().all())
        assert count == 1


async def test_google_upsert_links_existing_email_account(client: AsyncClient) -> None:
    from src.api.routers.auth import _upsert_google_user
    from src.db.models import User
    from src.db.session import session_scope
    from src.security import passwords

    async with session_scope() as session:
        session.add(
            User(
                email="existing@example.com", password_hash=passwords.hash_password("password-123")
            )
        )
        await session.commit()

    profile = google_oauth.GoogleProfile(
        sub="google-sub-2", email="existing@example.com", name="Existing", picture="http://pic"
    )
    async with session_scope() as session:
        user = await _upsert_google_user(session, profile)
        assert user.google_sub == "google-sub-2"
        assert user.password_hash is not None
        assert user.avatar_url == "http://pic"
