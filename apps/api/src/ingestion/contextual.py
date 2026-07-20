import asyncio
from typing import Any, Protocol

MAX_DOCUMENT_CHARS = 8000
MAX_CONCURRENCY = 4

PROMPT = """<document>
{document}
</document>

Here is a chunk taken from that document:
<chunk>
{chunk}
</chunk>

Write one or two short sentences situating this chunk within the whole document so it can be
understood on its own during search. Answer in the same language as the document. Reply with the
situating context only, no preamble."""


class ChatModel(Protocol):
    async def ainvoke(self, input: Any, **kwargs: Any) -> Any: ...


def message_text(response: Any) -> str:
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "".join(parts).strip()
    return str(content).strip()


def combine(context: str, chunk: str) -> str:
    return f"{context}\n\n{chunk}"


async def contextualize(
    chunks: list[str],
    document_text: str,
    model: ChatModel | None,
    enabled: bool = True,
    concurrency: int = MAX_CONCURRENCY,
    max_document_chars: int = MAX_DOCUMENT_CHARS,
) -> list[str | None]:
    if not chunks:
        return []
    if not enabled or model is None:
        return [None] * len(chunks)

    summary = document_text[:max_document_chars]
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def describe(chunk: str) -> str | None:
        async with semaphore:
            try:
                response = await model.ainvoke(PROMPT.format(document=summary, chunk=chunk))
            except Exception:
                return None
        context = message_text(response)
        return combine(context, chunk) if context else None

    results = await asyncio.gather(*(describe(chunk) for chunk in chunks), return_exceptions=True)
    return [None if isinstance(result, BaseException) else result for result in results]


def embedding_inputs(chunks: list[str], contextual: list[str | None]) -> list[str]:
    return [context or chunk for chunk, context in zip(chunks, contextual, strict=True)]
