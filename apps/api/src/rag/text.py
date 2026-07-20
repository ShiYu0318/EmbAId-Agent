import re
from functools import lru_cache

_WHITESPACE = re.compile(r"\s+")
_CJK = re.compile(r"[一-鿿]")


@lru_cache(maxsize=1)
def _converter() -> object | None:
    try:
        from opencc import OpenCC

        return OpenCC("s2t")
    except Exception:
        return None


def has_cjk(text: str) -> bool:
    return bool(_CJK.search(text))


def normalize(text: str) -> str:
    text = _WHITESPACE.sub(" ", text).strip()
    if not has_cjk(text):
        return text
    converter = _converter()
    if converter is None:
        return text
    return converter.convert(text)  # type: ignore[attr-defined]


@lru_cache(maxsize=1)
def _tokenizer() -> object | None:
    try:
        import jieba

        return jieba
    except Exception:
        return None


def tokenize(text: str) -> list[str]:
    text = normalize(text)
    if not has_cjk(text):
        return [token for token in re.split(r"\W+", text.lower()) if token]

    tokenizer = _tokenizer()
    if tokenizer is None:
        return [char for char in text if char.strip()]
    return [token.strip() for token in tokenizer.cut(text) if token.strip()]  # type: ignore[attr-defined]


def lexical_query(text: str) -> str:
    return " ".join(tokenize(text))
