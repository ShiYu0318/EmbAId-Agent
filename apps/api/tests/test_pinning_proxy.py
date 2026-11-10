import asyncio
import ipaddress

import httpx
import pytest

from src.security import outbound
from src.security.proxy import PinningProxy

PUBLIC = ipaddress.ip_address("93.184.216.34")


async def _origin(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    head = await reader.readuntil(b"\r\n\r\n")
    body = head.split(b"\r\n", 1)[0]
    status = b"HTTP/1.1 200 OK\r\nContent-Length: %d\r\nConnection: close\r\n\r\n"
    writer.write(status % len(body) + body)
    await writer.drain()
    writer.close()


async def _echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    writer.write(b"echo:" + await reader.read(100))
    await writer.drain()
    writer.close()


class _Upstream:
    """Stands in for the public internet: records where the proxy connects."""

    def __init__(self, handler) -> None:
        self.handler = handler
        self.targets: list[tuple[str, int]] = []

    async def __aenter__(self) -> "_Upstream":
        self.server = await asyncio.start_server(self.handler, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        return self

    async def __aexit__(self, *exc: object) -> None:
        self.server.close()

    async def connect(self, host: str, port: int):
        self.targets.append((host, port))
        return await asyncio.open_connection("127.0.0.1", self.port)


def _resolve_to(monkeypatch: pytest.MonkeyPatch, address: str) -> list[str]:
    lookups: list[str] = []

    async def resolve(host: str, port: int):
        lookups.append(host)
        return [ipaddress.ip_address(address)]

    monkeypatch.setattr(outbound, "_resolve", resolve)
    return lookups


async def test_http_requests_connect_to_the_checked_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lookups = _resolve_to(monkeypatch, str(PUBLIC))
    async with (
        _Upstream(_origin) as upstream,
        PinningProxy(upstream.connect) as proxy,
        httpx.AsyncClient(proxy=proxy.url) as client,
    ):
        response = await client.get("http://cdn.example.com/app.js?v=2")

    assert response.status_code == 200
    assert response.text == "GET /app.js?v=2 HTTP/1.1"
    assert upstream.targets == [(str(PUBLIC), 80)]
    assert lookups == ["cdn.example.com"]


async def test_connect_tunnels_to_the_checked_address(monkeypatch: pytest.MonkeyPatch) -> None:
    _resolve_to(monkeypatch, str(PUBLIC))
    async with _Upstream(_echo) as upstream, PinningProxy(upstream.connect) as proxy:
        port = int(proxy.url.rsplit(":", 1)[1])
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(b"CONNECT other.example.com:443 HTTP/1.1\r\n\r\n")
        established = await reader.readuntil(b"\r\n\r\n")
        writer.write(b"hello")
        await writer.drain()
        tunnelled = await reader.read(100)
        writer.close()

    assert established.startswith(b"HTTP/1.1 200")
    assert tunnelled == b"echo:hello"
    assert upstream.targets == [(str(PUBLIC), 443)]


@pytest.mark.parametrize(
    "request_head",
    [
        b"CONNECT rebind.example.com:443 HTTP/1.1\r\n\r\n",
        b"GET http://rebind.example.com/ HTTP/1.1\r\nHost: rebind.example.com\r\n\r\n",
        b"CONNECT 169.254.169.254:80 HTTP/1.1\r\n\r\n",
        b"CONNECT localhost:6379 HTTP/1.1\r\n\r\n",
    ],
)
async def test_hosts_that_resolve_inward_are_refused(
    monkeypatch: pytest.MonkeyPatch, request_head: bytes
) -> None:
    _resolve_to(monkeypatch, "10.0.0.5")
    async with _Upstream(_echo) as upstream, PinningProxy(upstream.connect) as proxy:
        port = int(proxy.url.rsplit(":", 1)[1])
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(request_head)
        reply = await reader.read(200)
        writer.close()

    assert reply.startswith(b"HTTP/1.1 403")
    assert upstream.targets == []
