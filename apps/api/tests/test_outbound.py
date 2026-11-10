import ipaddress

import httpx
import pytest
from httpx import AsyncClient

from src.config import get_settings
from src.ingestion import web
from src.ingestion.web import HttpPageFetcher, expand_sitemap
from src.security import outbound
from src.security.outbound import UnsafeUrlError, assert_public_url, check_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://localhost:8000/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://0.0.0.0/",
        "http://intranet/",
        "http://db.internal/",
        "http://user:pass@example.com/",
        "ftp://example.com/",
        "file:///etc/passwd",
        "not a url",
    ],
)
def test_check_url_rejects_internal_targets(url: str) -> None:
    with pytest.raises(UnsafeUrlError):
        check_url(url)


def test_check_url_accepts_public_targets() -> None:
    check_url("https://example.com/docs")
    check_url("http://93.184.216.34/")


def test_private_targets_allowed_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOW_PRIVATE_NETWORK_TARGETS", "true")
    get_settings.cache_clear()
    check_url("http://localhost:8000/")
    with pytest.raises(UnsafeUrlError):
        check_url("file:///etc/passwd")


async def test_resolved_private_address_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    async def resolve(host: str, port: int) -> list[outbound.IpAddress]:
        import ipaddress

        return [ipaddress.ip_address("93.184.216.34"), ipaddress.ip_address("10.1.2.3")]

    monkeypatch.setattr(outbound, "_resolve", resolve)
    with pytest.raises(UnsafeUrlError):
        await assert_public_url("https://rebind.example.com/")


class _Response:
    def __init__(self, status: int, headers: dict[str, str], body: bytes = b"") -> None:
        self.status_code = status
        self.headers = headers
        self.encoding = "utf-8"
        self._body = body

    @property
    def is_redirect(self) -> bool:
        return 300 <= self.status_code < 400

    async def aiter_bytes(self):  # type: ignore[no-untyped-def]
        for start in range(0, len(self._body), 1024):
            yield self._body[start : start + 1024]

    async def __aenter__(self) -> "_Response":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None


class _Client:
    def __init__(self, routes: dict[str, _Response]) -> None:
        self.routes = routes
        self.requested: list[str] = []

    def stream(self, method: str, url: str) -> _Response:
        self.requested.append(url)
        return self.routes[url]


@pytest.fixture
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    async def resolve(host: str, port: int) -> list[outbound.IpAddress]:
        import ipaddress

        return [ipaddress.ip_address("93.184.216.34")]

    monkeypatch.setattr(outbound, "_resolve", resolve)


async def test_fetcher_refuses_redirect_to_internal_address(public_dns: None) -> None:
    client = _Client(
        {
            "https://example.com/": _Response(302, {"location": "http://169.254.169.254/meta"}),
            "http://169.254.169.254/meta": _Response(200, {}, b"secret"),
        }
    )
    fetcher = HttpPageFetcher()
    fetcher._client = client

    assert await fetcher.fetch("https://example.com/") is None
    assert client.requested == ["https://example.com/"]


async def test_fetcher_follows_public_redirect(public_dns: None) -> None:
    client = _Client(
        {
            "https://example.com/": _Response(301, {"location": "/home"}),
            "https://example.com/home": _Response(200, {}, b"<p>hello</p>"),
        }
    )
    fetcher = HttpPageFetcher()
    fetcher._client = client

    assert await fetcher.fetch("https://example.com/") == "<p>hello</p>"


async def test_fetcher_caps_response_size(
    public_dns: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CRAWL_MAX_RESPONSE_BYTES", "2048")
    get_settings.cache_clear()
    client = _Client({"https://example.com/big": _Response(200, {}, b"x" * 10_000)})
    fetcher = HttpPageFetcher()
    fetcher._client = client

    assert await fetcher.fetch("https://example.com/big") is None


async def test_fetcher_never_requests_internal_start_url() -> None:
    client = _Client({})
    fetcher = HttpPageFetcher()
    fetcher._client = client

    assert await fetcher.fetch("http://127.0.0.1:6379/") is None
    assert client.requested == []


class _SitemapFetcher:
    async def fetch(self, url: str) -> str | None:
        return (
            "<urlset><url><loc>https://example.com/a</loc></url>"
            "<url><loc>http://169.254.169.254/latest</loc></url>"
            "<url><loc>https://other.example.org/b</loc></url></urlset>"
        )


async def test_sitemap_only_returns_same_origin_urls() -> None:
    urls = await expand_sitemap("https://example.com/sitemap.xml", fetcher=_SitemapFetcher())
    assert urls == ["https://example.com/a"]


async def test_source_creation_rejects_internal_url(authed_client: AsyncClient) -> None:
    project = await authed_client.post("/v1/projects", json={"name": "KB"})
    response = await authed_client.post(
        f"/v1/projects/{project.json()['id']}/sources",
        json={"type": "url_crawl", "name": "bad", "config": {"url": "http://localhost:6379/"}},
    )
    assert response.status_code == 400
    assert "rejected" in response.text
    assert web.MAX_REDIRECTS == 5


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1:9000/hook", "http://169.254.169.254/", "https://localhost/hook"]
)
async def test_webhook_creation_rejects_internal_url(authed_client: AsyncClient, url: str) -> None:
    project = await authed_client.post("/v1/projects", json={"name": "KB"})
    response = await authed_client.post(
        f"/v1/projects/{project.json()['id']}/webhooks",
        json={"url": url, "subscribed_events": ["document.indexed"]},
    )
    assert response.status_code == 400
    assert "rejected" in response.text


async def test_webhook_update_rejects_internal_url(authed_client: AsyncClient) -> None:
    project = await authed_client.post("/v1/projects", json={"name": "KB"})
    created = await authed_client.post(
        f"/v1/projects/{project.json()['id']}/webhooks",
        json={"url": "https://example.com/hook", "subscribed_events": ["document.indexed"]},
    )
    response = await authed_client.patch(
        f"/v1/webhooks/{created.json()['id']}", json={"url": "http://10.0.0.8/hook"}
    )
    assert response.status_code == 400


async def test_webhook_delivery_refuses_rebound_host(monkeypatch: pytest.MonkeyPatch) -> None:
    import ipaddress

    from src.ingestion.jobs import _HttpxWebhookClient

    async def resolve(host: str, port: int) -> list[outbound.IpAddress]:
        return [ipaddress.ip_address("127.0.0.1")]

    monkeypatch.setattr(outbound, "_resolve", resolve)
    with pytest.raises(UnsafeUrlError):
        await _HttpxWebhookClient().post("https://rebind.example.com/hook", b"{}", {})


class _RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(200, text="ok")


async def test_pinned_transport_connects_to_the_checked_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lookups: list[str] = []

    async def resolve(host: str, port: int) -> list[ipaddress.IPv4Address]:
        lookups.append(host)
        return [ipaddress.ip_address("93.184.216.34")]

    monkeypatch.setattr(outbound, "_resolve", resolve)
    inner = _RecordingTransport()

    async with httpx.AsyncClient(transport=outbound.PinnedTransport(inner)) as client:
        await client.get("https://docs.example.com/page?x=1")

    sent = inner.requests[0]
    assert sent.url.host == "93.184.216.34"
    assert sent.url.path == "/page"
    assert sent.headers["host"] == "docs.example.com"
    assert sent.extensions["sni_hostname"] == "docs.example.com"
    assert lookups == ["docs.example.com"]


async def test_pinned_transport_refuses_a_name_that_resolves_inward(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolve(host: str, port: int) -> list[ipaddress.IPv4Address]:
        return [ipaddress.ip_address("10.0.0.5")]

    monkeypatch.setattr(outbound, "_resolve", resolve)
    inner = _RecordingTransport()

    async with httpx.AsyncClient(transport=outbound.PinnedTransport(inner)) as client:
        with pytest.raises(outbound.UnsafeUrlError):
            await client.get("https://rebind.example.com/")

    assert inner.requests == []


async def test_headless_requests_are_checked() -> None:
    assert await web.request_allowed("data:text/plain,hi")
    assert not await web.request_allowed("http://169.254.169.254/latest/meta-data/")
    assert not await web.request_allowed("http://localhost:6379/")
    assert not await web.request_allowed("file:///etc/passwd")


def test_headless_browser_pins_the_page_host() -> None:
    address = ipaddress.ip_address("93.184.216.34")
    assert web._resolver_args("https://Docs.Example.com/a", address) == [
        "--host-resolver-rules=MAP docs.example.com 93.184.216.34"
    ]
    v6 = ipaddress.ip_address("2606:2800:220:1::1")
    assert web._resolver_args("https://docs.example.com/", v6) == [
        "--host-resolver-rules=MAP docs.example.com [2606:2800:220:1::1]"
    ]
    assert web._resolver_args("https://docs.example.com/", None) == []
