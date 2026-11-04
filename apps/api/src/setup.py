"""Interactive first-run setup: writes apps/api/.env.

    uv run python -m src.setup                    # asks a few questions
    uv run python -m src.setup --preset ollama    # no questions (scripts, CI)

Starts from the existing .env, or from .env.example, so comments and values you already set are
kept. Keys are read without echoing and are only written to the local .env file.
"""

import argparse
import getpass
import json
import re
import secrets
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Preset:
    title: str
    values: dict[str, str]
    keys: list[tuple[str, str]] = field(default_factory=list)  # (setting, where to get it)
    ask_chat_model: bool = False
    # Offered as a numbered choice; the first is the default.
    chat_model_choices: list[tuple[str, str]] = field(default_factory=list)


OLLAMA_EMBEDDINGS = {
    "DEFAULT_EMBEDDING_PROVIDER": "ollama",
    "DEFAULT_EMBEDDING_MODEL": "nomic-embed-text",
    "EMBEDDING_DIMENSIONS": "768",
}

PRESETS: dict[str, Preset] = {
    "ollama": Preset(
        "Ollama on this machine: free, nothing leaves your computer",
        {
            "DEFAULT_CHAT_PROVIDER": "ollama",
            "DEFAULT_CHAT_MODEL": "llama3",
            **OLLAMA_EMBEDDINGS,
        },
    ),
    "anthropic": Preset(
        "Anthropic for answers, OpenAI for embeddings",
        {
            "DEFAULT_CHAT_PROVIDER": "anthropic",
            "DEFAULT_CHAT_MODEL": "claude-sonnet-5",
            "DEFAULT_EMBEDDING_PROVIDER": "openai",
            "DEFAULT_EMBEDDING_MODEL": "text-embedding-3-small",
            "EMBEDDING_DIMENSIONS": "1536",
        },
        [
            ("ANTHROPIC_API_KEY", "https://console.anthropic.com/settings/keys"),
            ("OPENAI_API_KEY", "https://platform.openai.com/api-keys"),
        ],
        chat_model_choices=[
            ("claude-sonnet-5", "Claude Sonnet 5 (default)"),
            ("claude-sonnet-5-5", "Claude Sonnet 5.5, the newest Sonnet, same price"),
        ],
    ),
    "openai": Preset(
        "OpenAI for answers and embeddings",
        {
            "DEFAULT_CHAT_PROVIDER": "openai",
            "DEFAULT_EMBEDDING_PROVIDER": "openai",
            "DEFAULT_EMBEDDING_MODEL": "text-embedding-3-small",
            "EMBEDDING_DIMENSIONS": "1536",
        },
        [("OPENAI_API_KEY", "https://platform.openai.com/api-keys")],
        ask_chat_model=True,
    ),
    "gemini": Preset(
        "Google Gemini for answers and embeddings",
        {
            "DEFAULT_CHAT_PROVIDER": "gemini",
            "DEFAULT_CHAT_MODEL": "gemini-3.8-flash",
            "DEFAULT_EMBEDDING_PROVIDER": "gemini",
            "DEFAULT_EMBEDDING_MODEL": "gemini-embedding-001",
            "EMBEDDING_DIMENSIONS": "3072",
        },
        [("GEMINI_API_KEY", "https://aistudio.google.com/apikey")],
    ),
    "groq": Preset(
        "Groq for fast answers, Ollama for embeddings",
        {
            "DEFAULT_CHAT_PROVIDER": "groq",
            "DEFAULT_CHAT_MODEL": "llama-3.3-70b-versatile",
            **OLLAMA_EMBEDDINGS,
        },
        [("GROQ_API_KEY", "https://console.groq.com/keys")],
    ),
    "openrouter": Preset(
        "OpenRouter (any model, one key) for answers, Ollama for embeddings",
        {"DEFAULT_CHAT_PROVIDER": "openrouter", **OLLAMA_EMBEDDINGS},
        [("OPENROUTER_API_KEY", "https://openrouter.ai/keys")],
        ask_chat_model=True,
    ),
    "deepseek": Preset(
        "DeepSeek for answers, Ollama for embeddings",
        {
            "DEFAULT_CHAT_PROVIDER": "deepseek",
            "DEFAULT_CHAT_MODEL": "deepseek-flash",
            **OLLAMA_EMBEDDINGS,
        },
        [("DEEPSEEK_API_KEY", "https://platform.deepseek.com/api_keys")],
    ),
}


# --- .env editing -----------------------------------------------------------


def read_env(path: Path) -> str:
    if path.exists():
        return path.read_text()
    example = path.with_name(".env.example")
    return example.read_text() if example.exists() else ""


def get_value(text: str, key: str) -> str:
    match = re.search(rf"^{key}=(.*)$", text, flags=re.MULTILINE)
    if not match:
        return ""
    value = match.group(1).strip()
    return "" if value.startswith("#") else re.split(r"\s+#", value, maxsplit=1)[0].strip()


def set_value(text: str, key: str, value: str) -> str:
    """Replace KEY=..., keeping any trailing comment; append the key if it is missing."""
    pattern = re.compile(rf"^{key}=([^\n#]*?)(\s+#.*)?$", flags=re.MULTILINE)
    if pattern.search(text):
        return pattern.sub(lambda m: f"{key}={value}{m.group(2) or ''}", text, count=1)
    return text.rstrip("\n") + f"\n{key}={value}\n"


# --- checks -----------------------------------------------------------------


def missing_ollama_models(base_url: str, wanted: list[str]) -> list[str] | None:
    """Models still to pull, or None when Ollama is not reachable."""
    try:
        with urllib.request.urlopen(f"{base_url.rstrip('/')}/api/tags", timeout=3) as response:
            installed = {m["name"] for m in json.load(response).get("models", [])}
    except (OSError, ValueError):
        return None
    names = installed | {name.split(":")[0] for name in installed}
    return [model for model in wanted if model not in names]


# --- prompts ----------------------------------------------------------------


def choose_preset() -> str:
    names = list(PRESETS)
    print("\nWhich models should answer questions?\n")
    for index, name in enumerate(names, start=1):
        print(f"  {index}. {PRESETS[name].title}")
    while True:
        answer = input(f"\nChoose 1-{len(names)} [1]: ").strip() or "1"
        if answer.isdigit() and 1 <= int(answer) <= len(names):
            return names[int(answer) - 1]
        print("Please enter one of the numbers above.")


def ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    return input(f"{prompt}{suffix}: ").strip() or default


def run(env_path: Path, preset_name: str | None, interactive: bool) -> int:
    text = read_env(env_path)
    if not text:
        print(f"No .env.example next to {env_path}; run this from apps/api.", file=sys.stderr)
        return 1

    if not get_value(text, "JWT_SECRET"):
        text = set_value(text, "JWT_SECRET", secrets.token_hex(32))
        print("Generated a JWT_SECRET.")

    name = preset_name or (choose_preset() if interactive else "ollama")
    preset = PRESETS[name]
    values = dict(preset.values)
    if preset.chat_model_choices and interactive:
        print("\nWhich Claude model?\n")
        for index, (_, title) in enumerate(preset.chat_model_choices, start=1):
            print(f"  {index}. {title}")
        answer = input(f"\nChoose 1-{len(preset.chat_model_choices)} [1]: ").strip() or "1"
        if answer.isdigit() and 1 <= int(answer) <= len(preset.chat_model_choices):
            values["DEFAULT_CHAT_MODEL"] = preset.chat_model_choices[int(answer) - 1][0]
    if preset.ask_chat_model:
        current = get_value(text, "DEFAULT_CHAT_MODEL")
        model = (
            ask("Chat model name (see the provider's model list)", current) if interactive else ""
        )
        if model:
            values["DEFAULT_CHAT_MODEL"] = model
    for key, value in values.items():
        text = set_value(text, key, value)

    missing_keys: list[tuple[str, str]] = []
    for key, where in preset.keys:
        if get_value(text, key):
            continue
        secret = getpass.getpass(f"{key} (from {where}, Enter to skip): ") if interactive else ""
        if secret.strip():
            text = set_value(text, key, secret.strip())
        else:
            missing_keys.append((key, where))

    env_path.write_text(text)
    print(f"\nWrote {env_path}")
    print(f"Models: {preset.title}.")

    if (
        values.get("DEFAULT_CHAT_PROVIDER") == "ollama"
        or values.get("DEFAULT_EMBEDDING_PROVIDER") == "ollama"
    ):
        wanted = [
            values[k]
            for k in ("DEFAULT_CHAT_MODEL", "DEFAULT_EMBEDDING_MODEL")
            if k in values and values[k.replace("MODEL", "PROVIDER")] == "ollama"
        ]
        base_url = get_value(text, "OLLAMA_BASE_URL") or "http://localhost:11434"
        missing = missing_ollama_models(base_url, wanted)
        if missing is None:
            print(f"\nOllama is not reachable at {base_url}. Start it (`ollama serve`), then:")
            missing = wanted
        for model in missing:
            print(f"  ollama pull {model}")

    for key, where in missing_keys:
        print(f"\nStill needed: {key} in {env_path.name} (get one at {where}).")

    print("\nNext: uv run uvicorn src.main:app --reload   then open http://localhost:8000/health")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write apps/api/.env for EmbAId Agent.")
    parser.add_argument("--preset", choices=sorted(PRESETS), help="skip the model question")
    parser.add_argument("--env", type=Path, default=API_ROOT / ".env", help="file to write")
    parser.add_argument(
        "--non-interactive", action="store_true", help="never prompt; leave missing keys empty"
    )
    args = parser.parse_args(argv)
    interactive = not args.non_interactive and sys.stdin.isatty()
    return run(args.env, args.preset, interactive)


if __name__ == "__main__":
    raise SystemExit(main())
