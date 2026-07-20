from dataclasses import dataclass, field
from typing import Any, Protocol

NOTION_VERSION = "2022-06-28"
NOTION_API_BASE = "https://api.notion.com/v1"
GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
GOOGLE_DOCS_API_BASE = "https://docs.googleapis.com/v1"
DEFAULT_TIMEOUT_SECONDS = 30.0
MAX_DOCUMENTS = 200


class ConnectorError(RuntimeError):
    pass


class MissingCredentialsError(ConnectorError):
    pass


@dataclass(slots=True)
class ConnectorDocument:
    external_id: str
    title: str
    text: str
    url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class NotionClient(Protocol):
    async def list_pages(self, database_id: str | None) -> list[dict[str, Any]]: ...

    async def page_blocks(self, page_id: str) -> list[dict[str, Any]]: ...


class GoogleDocsClient(Protocol):
    async def list_documents(self, folder_id: str | None) -> list[dict[str, Any]]: ...

    async def get_document(self, document_id: str) -> dict[str, Any]: ...


class Connector(Protocol):
    async def fetch(self) -> list[ConnectorDocument]: ...


def _rich_text(items: list[dict[str, Any]] | None) -> str:
    if not items:
        return ""
    parts: list[str] = []
    for item in items:
        text = item.get("plain_text")
        if text is None:
            text = (item.get("text") or {}).get("content", "")
        if text:
            parts.append(str(text))
    return "".join(parts)


def notion_page_title(page: dict[str, Any]) -> str:
    properties = page.get("properties") or {}
    for value in properties.values():
        if isinstance(value, dict) and value.get("type") == "title":
            title = _rich_text(value.get("title"))
            if title:
                return title[:200]
    return "Untitled"


def notion_blocks_to_text(blocks: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for block in blocks:
        block_type = block.get("type")
        if not block_type:
            continue
        body = block.get(block_type)
        if not isinstance(body, dict):
            continue

        text = _rich_text(body.get("rich_text"))
        if not text:
            continue

        if block_type.startswith("heading_"):
            level = block_type.removeprefix("heading_")
            prefix = "#" * (int(level) if level.isdigit() else 2)
            lines.append(f"{prefix} {text}")
        elif block_type in {"bulleted_list_item", "toggle"}:
            lines.append(f"- {text}")
        elif block_type == "numbered_list_item":
            lines.append(f"1. {text}")
        elif block_type == "to_do":
            marker = "x" if body.get("checked") else " "
            lines.append(f"- [{marker}] {text}")
        elif block_type == "code":
            lines.append(f"```\n{text}\n```")
        else:
            lines.append(text)

    return "\n\n".join(lines).strip()


def google_document_to_text(document: dict[str, Any]) -> str:
    content = (document.get("body") or {}).get("content") or []
    lines: list[str] = []
    for element in content:
        paragraph = element.get("paragraph")
        if not isinstance(paragraph, dict):
            continue
        parts = [
            (item.get("textRun") or {}).get("content", "")
            for item in paragraph.get("elements") or []
        ]
        line = "".join(parts).strip()
        if line:
            lines.append(line)
    return "\n\n".join(lines).strip()


class HttpNotionClient:
    def __init__(self, token: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        if not token:
            raise MissingCredentialsError("notion source requires a token in config")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self.token}",
            "notion-version": NOTION_VERSION,
            "content-type": "application/json",
        }

    async def list_pages(self, database_id: str | None) -> list[dict[str, Any]]:
        import httpx

        url = (
            f"{NOTION_API_BASE}/databases/{database_id}/query"
            if database_id
            else f"{NOTION_API_BASE}/search"
        )
        payload: dict[str, Any] = (
            {} if database_id else {"filter": {"property": "object", "value": "page"}}
        )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, headers=self._headers(), json=payload)
            if response.status_code >= 400:
                raise ConnectorError(f"notion list failed: {response.status_code}")
            return list(response.json().get("results") or [])

    async def page_blocks(self, page_id: str) -> list[dict[str, Any]]:
        import httpx

        blocks: list[dict[str, Any]] = []
        cursor: str | None = None

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            while True:
                params = {"page_size": 100} | ({"start_cursor": cursor} if cursor else {})
                response = await client.get(
                    f"{NOTION_API_BASE}/blocks/{page_id}/children",
                    headers=self._headers(),
                    params=params,
                )
                if response.status_code >= 400:
                    raise ConnectorError(f"notion blocks failed: {response.status_code}")
                body = response.json()
                blocks.extend(body.get("results") or [])
                cursor = body.get("next_cursor")
                if not body.get("has_more") or not cursor:
                    return blocks


class HttpGoogleDocsClient:
    def __init__(self, access_token: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        if not access_token:
            raise MissingCredentialsError("google_docs source requires an access_token in config")
        self.access_token = access_token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self.access_token}"}

    async def list_documents(self, folder_id: str | None) -> list[dict[str, Any]]:
        import httpx

        query = "mimeType='application/vnd.google-apps.document' and trashed=false"
        if folder_id:
            query = f"'{folder_id}' in parents and {query}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{GOOGLE_DRIVE_API_BASE}/files",
                headers=self._headers(),
                params={"q": query, "fields": "files(id,name,webViewLink)", "pageSize": 100},
            )
            if response.status_code >= 400:
                raise ConnectorError(f"google drive list failed: {response.status_code}")
            return list(response.json().get("files") or [])

    async def get_document(self, document_id: str) -> dict[str, Any]:
        import httpx

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{GOOGLE_DOCS_API_BASE}/documents/{document_id}",
                headers=self._headers(),
            )
            if response.status_code >= 400:
                raise ConnectorError(f"google docs fetch failed: {response.status_code}")
            return dict(response.json())


class NotionConnector:
    def __init__(self, config: dict[str, Any], client: NotionClient | None = None) -> None:
        self.database_id = config.get("database_id")
        self.page_ids = list(config.get("page_ids") or [])
        self.client = client or HttpNotionClient(str(config.get("token") or ""))

    async def fetch(self) -> list[ConnectorDocument]:
        pages = await self.client.list_pages(self.database_id)
        if self.page_ids:
            wanted = set(self.page_ids)
            pages = [page for page in pages if page.get("id") in wanted]

        documents: list[ConnectorDocument] = []
        for page in pages[:MAX_DOCUMENTS]:
            page_id = str(page.get("id") or "")
            if not page_id:
                continue
            blocks = await self.client.page_blocks(page_id)
            text = notion_blocks_to_text(blocks)
            if not text:
                continue
            documents.append(
                ConnectorDocument(
                    external_id=page_id,
                    title=notion_page_title(page),
                    text=text,
                    url=page.get("url"),
                    metadata={"connector": "notion"},
                )
            )
        return documents


class GoogleDocsConnector:
    def __init__(self, config: dict[str, Any], client: GoogleDocsClient | None = None) -> None:
        self.folder_id = config.get("folder_id")
        self.document_ids = list(config.get("document_ids") or [])
        self.client = client or HttpGoogleDocsClient(str(config.get("access_token") or ""))

    async def fetch(self) -> list[ConnectorDocument]:
        if self.document_ids:
            entries = [{"id": document_id} for document_id in self.document_ids]
        else:
            entries = await self.client.list_documents(self.folder_id)

        documents: list[ConnectorDocument] = []
        for entry in entries[:MAX_DOCUMENTS]:
            document_id = str(entry.get("id") or "")
            if not document_id:
                continue
            payload = await self.client.get_document(document_id)
            text = google_document_to_text(payload)
            if not text:
                continue
            title = str(payload.get("title") or entry.get("name") or "Untitled")
            documents.append(
                ConnectorDocument(
                    external_id=document_id,
                    title=title[:200],
                    text=text,
                    url=entry.get("webViewLink")
                    or f"https://docs.google.com/document/d/{document_id}",
                    metadata={"connector": "google_docs"},
                )
            )
        return documents


def build_connector(
    source_type: str,
    config: dict[str, Any],
    client: NotionClient | GoogleDocsClient | None = None,
) -> Connector:
    if source_type == "notion":
        return NotionConnector(config, client)  # type: ignore[arg-type]
    if source_type == "google_docs":
        return GoogleDocsConnector(config, client)  # type: ignore[arg-type]
    raise ConnectorError(f"unknown connector type: {source_type}")
