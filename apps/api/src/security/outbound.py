import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

from ..config import get_settings

ALLOWED_SCHEMES = frozenset({"http", "https"})
_BLOCKED_HOSTNAMES = frozenset({"localhost", "metadata", "metadata.google.internal"})
_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa")

IpAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


class UnsafeUrlError(ValueError):
    """Raised when an outbound request would leave the public internet."""


def _private_targets_allowed() -> bool:
    return get_settings().allow_private_network_targets


def is_public_address(address: IpAddress) -> bool:
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped
    return address.is_global and not address.is_multicast


def _literal_address(host: str) -> IpAddress | None:
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        return None


def _split(url: str) -> tuple[str, str, int]:
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError as exc:
        raise UnsafeUrlError("url is not valid") from exc
    scheme = parts.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("url must use http or https")
    host = (parts.hostname or "").rstrip(".").lower()
    if not host:
        raise UnsafeUrlError("url must include a host")
    if parts.username or parts.password:
        raise UnsafeUrlError("url must not embed credentials")
    return scheme, host, port or (443 if scheme == "https" else 80)


def check_url(url: str) -> None:
    """Static check that needs no DNS: scheme, host shape and literal addresses."""
    _, host, _ = _split(url)
    if _private_targets_allowed():
        return
    literal = _literal_address(host)
    if literal is not None:
        if not is_public_address(literal):
            raise UnsafeUrlError("url points to a private or reserved address")
        return
    if host in _BLOCKED_HOSTNAMES or host.endswith(_BLOCKED_SUFFIXES) or "." not in host:
        raise UnsafeUrlError("url points to an internal hostname")


async def _resolve(host: str, port: int) -> list[IpAddress]:
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise UnsafeUrlError(f"could not resolve {host}") from exc
    return [ipaddress.ip_address(info[4][0].split("%", 1)[0]) for info in infos]


async def assert_public_url(url: str) -> None:
    """Full check before a request is sent: every resolved address must be public."""
    check_url(url)
    if _private_targets_allowed():
        return
    _, host, port = _split(url)
    if _literal_address(host) is not None:
        return
    addresses = await _resolve(host, port)
    if not addresses or not all(is_public_address(address) for address in addresses):
        raise UnsafeUrlError("url resolves to a private or reserved address")
