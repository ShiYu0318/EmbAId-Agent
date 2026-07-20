from langchain_text_splitters import RecursiveCharacterTextSplitter

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
MIN_CHUNK_CHARS = 12

SEPARATORS = [
    "\n\n",
    "\n",
    "。",
    "！",
    "？",
    "；",
    "：",
    "、",
    "，",
    "．",
    ". ",
    "! ",
    "? ",
    "; ",
    ", ",
    " ",
    "",
]


def build_splitter(
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        separators=SEPARATORS,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        keep_separator="end",
        strip_whitespace=True,
    )


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> list[str]:
    if not text or not text.strip():
        return []

    splitter = build_splitter(chunk_size, chunk_overlap)
    chunks = [chunk.strip() for chunk in splitter.split_text(text)]
    kept = [chunk for chunk in chunks if len(chunk) >= MIN_CHUNK_CHARS]
    if kept:
        return kept
    return [chunk for chunk in chunks if chunk]
