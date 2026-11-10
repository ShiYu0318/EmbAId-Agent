import re
from urllib.parse import urlsplit

HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
APP_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$")
MAX_SYSTEM_PROMPT_CHARS = 8000


def http_url(value: str | None) -> str | None:
    """Accept only absolute http(s) urls; empty values become None."""
    if value is None or not value.strip():
        return None
    cleaned = value.strip()
    parts = urlsplit(cleaned)
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
        raise ValueError("must be an absolute http or https url")
    if any(ord(char) < 0x21 for char in cleaned):
        raise ValueError("must not contain whitespace or control characters")
    return cleaned


def hex_color(value: str) -> str:
    if not HEX_COLOR.match(value):
        raise ValueError("must be a hex colour such as #0033ff")
    return value.lower()


def allowed_origin(value: str) -> str:
    """Normalise a web origin to scheme://host[:port], or accept a mobile app id."""
    cleaned = value.strip()
    if "://" not in cleaned:
        if not APP_ID.match(cleaned):
            raise ValueError(
                f"{value!r} is neither a web origin (https://example.com) nor an app id"
            )
        return cleaned

    try:
        parts = urlsplit(cleaned)
        port = parts.port
    except ValueError as exc:
        raise ValueError(f"{value!r} is not a valid origin") from exc
    scheme = parts.scheme.lower()
    if scheme not in {"http", "https"} or not parts.hostname or "*" in cleaned:
        raise ValueError(f"{value!r} must be an http or https origin without wildcards")
    if parts.path not in {"", "/"} or parts.query or parts.fragment or parts.username:
        raise ValueError(f"{value!r} must not include a path, query or credentials")

    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    default_port = 443 if scheme == "https" else 80
    suffix = f":{port}" if port and port != default_port else ""
    return f"{scheme}://{host}{suffix}"


def allowed_origins(values: list[str]) -> list[str]:
    return list(dict.fromkeys(allowed_origin(value) for value in values))
