import asyncio
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

from ..config import get_settings
from ..security.outbound import UnsafeUrlError, assert_public_url, pinned_client

USER_AGENT = "EmbAId-Agent-Ingest/0.1 (+https://github.com/ShiYu0318/EmbAId-Agent)"
DEFAULT_MAX_PAGES = 25
DEFAULT_DELAY_SECONDS = 0.5
DEFAULT_TIMEOUT_SECONDS = 20.0
MIN_STATIC_TEXT_CHARS = 200
MAX_SITEMAP_DEPTH = 2
MAX_REDIRECTS = 5

_CHROME_TAGS = (
    "script",
    "style",
    "nav",
    "footer",
    "header",
    "aside",
    "form",
    "noscript",
    "iframe",
    "svg",
    "template",
)

_CHROME_SELECTORS = (
    "[role=navigation]",
    "[role=banner]",
    "[role=contentinfo]",
    "[role=search]",
    "[aria-hidden=true]",
)

_SKIP_SUFFIXES = (
    ".pdf",
    ".zip",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".mp4",
    ".mp3",
    ".css",
    ".js",
    ".ico",
    ".woff",
    ".woff2",
)


class FetchError(RuntimeError):
    pass


@dataclass(slots=True)
class FetchedPage:
    url: str
    title: str
    text: str
    links: list[str] = field(default_factory=list)


class PageFetcher(Protocol):
    async def fetch(self, url: str) -> str | None: ...


class HttpPageFetcher:
    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        user_agent: str = USER_AGENT,
    ) -> None:
        self.timeout = timeout
        self.user_agent = user_agent
        self._client: object | None = None

    def _ensure_client(self) -> object:
        if self._client is None:
            # Redirects are followed by hand so every hop is checked against the
            # outbound guard, and each connection goes to the address that was checked.
            self._client = pinned_client(
                timeout=self.timeout, headers={"user-agent": self.user_agent}
            )
        return self._client

    async def fetch(self, url: str) -> str | None:
        client = self._ensure_client()
        limit = get_settings().crawl_max_response_bytes
        current = url
        try:
            for _ in range(MAX_REDIRECTS + 1):
                await assert_public_url(current)
                async with client.stream("GET", current) as response:  # type: ignore[attr-defined]
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            return None
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        return None
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > limit:
                            return None
                    return bytes(body).decode(response.encoding or "utf-8", errors="replace")
        except UnsafeUrlError:
            return None
        except Exception:
            return None
        return None

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()  # type: ignore[attr-defined]
            self._client = None


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def same_origin(first: str, second: str) -> bool:
    left, right = urlsplit(first), urlsplit(second)
    return (left.scheme, left.netloc) == (right.scheme, right.netloc)


def normalize_url(url: str) -> str:
    cleaned, _ = urldefrag(url.strip())
    return cleaned.rstrip("/") or cleaned


def _is_crawlable(url: str) -> bool:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"}:
        return False
    return not parts.path.lower().endswith(_SKIP_SUFFIXES)


def extract_readable(html: str, url: str = "") -> FetchedPage:
    soup = BeautifulSoup(html, "lxml")

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    links: list[str] = []
    if url:
        for anchor in soup.find_all("a", href=True):
            candidate = normalize_url(urljoin(url, anchor["href"]))
            if candidate and _is_crawlable(candidate):
                links.append(candidate)

    for tag in soup.find_all(_CHROME_TAGS):
        tag.decompose()
    for selector in _CHROME_SELECTORS:
        for element in soup.select(selector):
            element.decompose()

    if not title:
        heading = soup.find("h1")
        if heading:
            title = heading.get_text(strip=True)

    root = soup.find("main") or soup.find("article") or soup.body or soup
    text = _collapse(root.get_text("\n"))

    return FetchedPage(
        url=url,
        title=title or url or "Untitled",
        text=text,
        links=list(dict.fromkeys(links)),
    )


def _collapse(text: str) -> str:
    lines = [line.strip() for line in text.replace("\r", "").split("\n")]
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


async def render_with_playwright(url: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> str | None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return None

    try:
        await assert_public_url(url)
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            try:
                page = await browser.new_page(user_agent=USER_AGENT)
                await page.goto(url, timeout=timeout * 1000, wait_until="networkidle")
                return await page.content()
            finally:
                await browser.close()
    except Exception:
        return None


async def fetch_page(
    url: str,
    fetcher: PageFetcher | None = None,
    allow_render: bool = True,
) -> FetchedPage:
    active = fetcher or HttpPageFetcher()
    html = await active.fetch(url)
    if html is None:
        raise FetchError(f"could not fetch {url}")

    page = extract_readable(html, url)
    if allow_render and len(page.text) < MIN_STATIC_TEXT_CHARS:
        rendered = await render_with_playwright(url)
        if rendered:
            candidate = extract_readable(rendered, url)
            if len(candidate.text) > len(page.text):
                return candidate
    return page


@dataclass(slots=True)
class RobotsPolicy:
    parser: RobotFileParser | None
    user_agent: str = USER_AGENT

    def allows(self, url: str) -> bool:
        if self.parser is None:
            return True
        return self.parser.can_fetch(self.user_agent, url)

    @property
    def crawl_delay(self) -> float | None:
        if self.parser is None:
            return None
        value = self.parser.crawl_delay(self.user_agent)
        return float(value) if value is not None else None


async def load_robots(
    origin: str,
    fetcher: PageFetcher,
    user_agent: str = USER_AGENT,
) -> RobotsPolicy:
    body = await fetcher.fetch(f"{origin}/robots.txt")
    if not body:
        return RobotsPolicy(parser=None, user_agent=user_agent)

    parser = RobotFileParser()
    parser.parse(body.splitlines())
    return RobotsPolicy(parser=parser, user_agent=user_agent)


async def crawl_site(
    start_url: str,
    max_pages: int = DEFAULT_MAX_PAGES,
    delay: float = DEFAULT_DELAY_SECONDS,
    fetcher: PageFetcher | None = None,
    respect_robots: bool = True,
    allow_render: bool = True,
) -> list[FetchedPage]:
    if max_pages <= 0:
        return []

    active = fetcher or HttpPageFetcher()
    start = normalize_url(start_url)
    robots = (
        await load_robots(origin_of(start), active) if respect_robots else RobotsPolicy(parser=None)
    )
    polite_delay = max(delay, robots.crawl_delay or 0.0)

    queue: list[str] = [start]
    seen: set[str] = {start}
    pages: list[FetchedPage] = []

    while queue and len(pages) < max_pages:
        url = queue.pop(0)
        if not robots.allows(url):
            continue

        if pages and polite_delay > 0:
            await asyncio.sleep(polite_delay)

        try:
            page = await fetch_page(url, fetcher=active, allow_render=allow_render)
        except FetchError:
            continue

        pages.append(page)

        for link in page.links:
            if len(seen) >= max_pages * 10:
                break
            if link in seen or not same_origin(start, link):
                continue
            seen.add(link)
            queue.append(link)

    return pages


async def expand_sitemap(
    sitemap_url: str,
    fetcher: PageFetcher | None = None,
    max_urls: int = DEFAULT_MAX_PAGES,
    _depth: int = 0,
) -> list[str]:
    active = fetcher or HttpPageFetcher()
    body = await active.fetch(sitemap_url)
    if not body:
        raise FetchError(f"could not fetch sitemap {sitemap_url}")

    soup = BeautifulSoup(body, "xml")
    locations = [
        loc.get_text(strip=True) for loc in soup.find_all("loc") if loc.get_text(strip=True)
    ]

    if soup.find("sitemapindex") is not None and _depth < MAX_SITEMAP_DEPTH:
        collected: list[str] = []
        for child in locations:
            if len(collected) >= max_urls:
                break
            if not same_origin(sitemap_url, child):
                continue
            try:
                collected.extend(
                    await expand_sitemap(
                        child,
                        fetcher=active,
                        max_urls=max_urls - len(collected),
                        _depth=_depth + 1,
                    )
                )
            except FetchError:
                continue
        return list(dict.fromkeys(collected))[:max_urls]

    unique = list(
        dict.fromkeys(
            normalize_url(url)
            for url in locations
            if _is_crawlable(url) and same_origin(sitemap_url, url)
        )
    )
    return unique[:max_urls]
