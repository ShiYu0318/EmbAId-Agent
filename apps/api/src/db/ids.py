import secrets

ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def generate_id(prefix: str, length: int = 24) -> str:
    body = "".join(secrets.choice(ALPHABET) for _ in range(length))
    return f"{prefix}_{body}"


def user_id() -> str:
    return generate_id("user")


def org_id() -> str:
    return generate_id("org")


def project_id() -> str:
    return generate_id("proj")


def api_key_id() -> str:
    return generate_id("key")


def source_id() -> str:
    return generate_id("src")


def document_id() -> str:
    return generate_id("doc")


def chunk_id() -> str:
    return generate_id("chunk")


def tag_id() -> str:
    return generate_id("tag")


def conversation_id() -> str:
    return generate_id("conv")


def message_id() -> str:
    return generate_id("msg")


def flagged_question_id() -> str:
    return generate_id("gap")


def cache_entry_id() -> str:
    return generate_id("cache")


def webhook_id() -> str:
    return generate_id("wh")


def delivery_id() -> str:
    return generate_id("whd")
