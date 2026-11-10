"""A loopback forward proxy that pins every connection to an address that was checked.

The headless browser is pointed at this proxy, so it never resolves a hostname itself.
For each request the proxy resolves the host, refuses anything that is not a public
address and connects to the exact address it checked. That closes the gap in which a DNS
answer changes between a check and the browser's own lookup. HTTPS stays end to end
between the browser and the site: the proxy only relays bytes after ``CONNECT``.
"""

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlsplit

from .outbound import UnsafeUrlError, resolve_public_address

HEADER_TIMEOUT_SECONDS = 15.0
CONNECT_TIMEOUT_SECONDS = 15.0
MAX_HEADER_BYTES = 64 * 1024
_HOP_HEADERS = frozenset({"proxy-connection", "connection", "keep-alive", "proxy-authorization"})

Connect = Callable[[str, int], Awaitable[tuple[asyncio.StreamReader, asyncio.StreamWriter]]]


class _Refused(Exception):
    def __init__(self, status: int, reason: str) -> None:
        super().__init__(reason)
        self.status = status
        self.reason = reason


def _split_authority(authority: str) -> tuple[str, int]:
    host, _, port = authority.rpartition(":")
    if not host or not port.isdigit():
        raise _Refused(400, "Bad Request")
    return host.strip("[]"), int(port)


class PinningProxy:
    def __init__(self, connect: Connect | None = None) -> None:
        self._connect: Connect = connect or asyncio.open_connection
        self._server: asyncio.Server | None = None
        self._tasks: set[asyncio.Task[Any]] = set()
        self.url = ""

    async def __aenter__(self) -> "PinningProxy":
        self._server = await asyncio.start_server(
            self._accept, "127.0.0.1", 0, limit=MAX_HEADER_BYTES
        )
        port = self._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._server is not None:
            self._server.close()
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def _accept(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        if task is not None:
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
        try:
            await self._serve(reader, writer)
        except _Refused as refused:
            await _reply(writer, refused.status, refused.reason)
        except UnsafeUrlError:
            await _reply(writer, 403, "Forbidden")
        except (OSError, TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            await _reply(writer, 502, "Bad Gateway")
        finally:
            await _close(writer)

    async def _open(self, url: str, host: str, port: int) -> tuple[Any, Any]:
        address = await resolve_public_address(url)
        target = str(address) if address is not None else host
        return await asyncio.wait_for(self._connect(target, port), CONNECT_TIMEOUT_SECONDS)

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), HEADER_TIMEOUT_SECONDS)
        request_line, _, header_block = head[:-4].partition(b"\r\n")
        try:
            method, target, version = request_line.decode("latin-1").split(" ", 2)
        except ValueError as exc:
            raise _Refused(400, "Bad Request") from exc

        if method.upper() == "CONNECT":
            host, port = _split_authority(target)
            bracketed = f"[{host}]" if ":" in host else host
            upstream_reader, upstream_writer = await self._open(
                f"https://{bracketed}:{port}/", host, port
            )
            writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
        else:
            parts = urlsplit(target)
            if parts.scheme.lower() != "http" or not parts.hostname:
                raise _Refused(400, "Bad Request")
            upstream_reader, upstream_writer = await self._open(
                target, parts.hostname, parts.port or 80
            )
            path = (parts.path or "/") + (f"?{parts.query}" if parts.query else "")
            lines = [f"{method} {path} {version}"]
            for line in header_block.decode("latin-1").split("\r\n"):
                if line and line.partition(":")[0].strip().lower() not in _HOP_HEADERS:
                    lines.append(line)
            # One request per upstream connection, so the next one is checked again.
            lines.append("Connection: close")
            upstream_writer.write(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))

        try:
            await writer.drain()
            await upstream_writer.drain()
            await _relay(reader, writer, upstream_reader, upstream_writer)
        finally:
            await _close(upstream_writer)


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    while chunk := await reader.read(65536):
        writer.write(chunk)
        await writer.drain()


async def _relay(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    upstream_reader: asyncio.StreamReader,
    upstream_writer: asyncio.StreamWriter,
) -> None:
    tasks = [
        asyncio.ensure_future(_pipe(client_reader, upstream_writer)),
        asyncio.ensure_future(_pipe(upstream_reader, client_writer)),
    ]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def _reply(writer: asyncio.StreamWriter, status: int, reason: str) -> None:
    with contextlib.suppress(Exception):
        head = f"HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        writer.write(head.encode())
        await writer.drain()


async def _close(writer: asyncio.StreamWriter) -> None:
    with contextlib.suppress(Exception):
        writer.close()
        await writer.wait_closed()
