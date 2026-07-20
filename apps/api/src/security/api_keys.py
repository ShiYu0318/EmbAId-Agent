import hashlib
import hmac
import secrets
from typing import Literal

KeyType = Literal["publishable", "secret", "sandbox"]

PREFIXES: dict[str, str] = {
    "publishable": "pub",
    "secret": "sk",
    "sandbox": "sbx",
}


def generate_key(key_type: KeyType) -> tuple[str, str, str]:
    prefix = PREFIXES[key_type]
    body = secrets.token_urlsafe(32)
    raw = f"{prefix}_{body}"
    return raw, hash_key(raw), raw[: len(prefix) + 9]


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def key_type_of(raw: str) -> KeyType | None:
    for key_type, prefix in PREFIXES.items():
        if raw.startswith(f"{prefix}_"):
            return key_type  # type: ignore[return-value]
    return None


def sign_payload(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def verify_signature(secret: str, payload: bytes, signature: str) -> bool:
    return hmac.compare_digest(sign_payload(secret, payload), signature)
