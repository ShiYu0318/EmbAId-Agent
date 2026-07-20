import io
from dataclasses import dataclass
from pathlib import PurePosixPath

_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/x-pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/markdown": "markdown",
    "text/x-markdown": "markdown",
    "text/plain": "text",
}

_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
    ".text": "text",
}

_DECODINGS = ("utf-8-sig", "utf-8", "big5", "gb18030")

SUPPORTED_FORMATS = frozenset({"pdf", "docx", "markdown", "text"})


class UnsupportedFormatError(ValueError):
    def __init__(self, filename: str | None, content_type: str | None) -> None:
        super().__init__(
            f"unsupported document format (filename={filename!r}, content_type={content_type!r}); "
            f"supported: pdf, docx, txt, md"
        )
        self.filename = filename
        self.content_type = content_type


class DocumentParseError(ValueError):
    pass


@dataclass(slots=True)
class LoadedDocument:
    title: str
    text: str
    format: str


def detect_format(filename: str | None = None, content_type: str | None = None) -> str:
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        if base in _CONTENT_TYPES:
            return _CONTENT_TYPES[base]

    if filename:
        suffix = PurePosixPath(filename).suffix.lower()
        if suffix in _EXTENSIONS:
            return _EXTENSIONS[suffix]

    raise UnsupportedFormatError(filename, content_type)


def decode_text(data: bytes) -> str:
    for encoding in _DECODINGS:
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def load_document(
    data: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> LoadedDocument:
    document_format = detect_format(filename, content_type)

    if document_format == "pdf":
        text, embedded_title = _read_pdf(data)
    elif document_format == "docx":
        text, embedded_title = _read_docx(data), None
    else:
        text = _clean(decode_text(data))
        embedded_title = _markdown_heading(text) if document_format == "markdown" else None

    return LoadedDocument(
        title=_pick_title(embedded_title, filename, text),
        text=text,
        format=document_format,
    )


def _read_pdf(data: bytes) -> tuple[str, str | None]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as exc:
        raise DocumentParseError(f"could not read pdf: {exc}") from exc

    title: str | None = None
    try:
        metadata = reader.metadata
        if metadata and metadata.title:
            title = metadata.title.strip() or None
    except Exception:
        title = None

    return _clean("\n\n".join(page for page in pages if page.strip())), title


def _read_docx(data: bytes) -> str:
    import docx2txt

    try:
        return _clean(docx2txt.process(io.BytesIO(data)) or "")
    except Exception as exc:
        raise DocumentParseError(f"could not read docx: {exc}") from exc


def _clean(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cleaned: list[str] = []
    blank = 0
    for line in lines:
        if line:
            blank = 0
            cleaned.append(line)
            continue
        blank += 1
        if blank < 2:
            cleaned.append("")
    return "\n".join(cleaned).strip()


def _markdown_heading(text: str) -> str | None:
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                return heading
        if stripped:
            break
    return None


def _first_line(text: str) -> str | None:
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped:
            return stripped[:200]
    return None


def _pick_title(embedded: str | None, filename: str | None, text: str) -> str:
    if embedded:
        return embedded[:200]
    if filename:
        stem = PurePosixPath(filename).stem.strip()
        if stem:
            return stem[:200]
    return _first_line(text) or "Untitled"
