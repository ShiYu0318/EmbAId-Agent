<div align="center">

# EmbAId Chat

**Embed a RAG-powered, customizable AI chatbot widget into any website with a single `<script>` tag.**

[![CI](https://github.com/ShiYu0318/EmbAId-Chat/actions/workflows/ci.yml/badge.svg)](https://github.com/ShiYu0318/EmbAId-Chat/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.13-black.svg)](https://www.python.org/)
[![Node](https://img.shields.io/badge/Node-20%2B-black.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-black.svg)](https://www.typescriptlang.org/)

</div>

---

## Table of contents

- [Overview](#overview)
- [Design principles](#design-principles)
- [Architecture](#architecture)
- [How answering works](#how-answering-works)
- [How ingestion works](#how-ingestion-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Your first assistant](#your-first-assistant)
- [Configuration](#configuration)
- [Embedding the widget](#embedding-the-widget)
- [Using the SDK](#using-the-sdk)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Security model](#security-model)
- [Observability](#observability)
- [Deployment](#deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

EmbAId Chat turns your own content into a chat assistant that lives on your site. Point it at your
files, your website, or your Notion workspace; it chunks and embeds everything into a vector store
you control, then answers visitor questions in real time from that material — streamed token by
token, aware of what was said earlier in the conversation, and linked back to the source it came
from.

Everything the visitor sees is yours to shape: the assistant's name, avatar, greeting, persona,
accent colour, starter questions, and the model behind it, all editable from the dashboard with a
live preview and no redeploy. Everything the operator needs is there too: what was asked, what was
retrieved, how confident the system was, what it cost, and which questions your content cannot yet
answer.

**What it does**

1. **Ingests** your knowledge — file uploads, website crawls, sitemaps, Notion, Google Docs.
2. **Indexes** it — recursive chunking, optional LLM-generated context per chunk, vector plus
   full-text indexes in a store you own.
3. **Answers** in real time — hybrid retrieval, reciprocal rank fusion, cross-encoder reranking,
   then a streamed answer with citations and conversation memory.
4. **Ships** as a widget — one script tag, Shadow DOM isolated, zero runtime dependencies, styled
   to match the host site.
5. **Reports** back — retrieval traces, analytics, and a queue of questions your content has yet
   to cover.

**Who it is for**

- Teams who want a branded assistant running on their own content and their own infrastructure,
  without handing the corpus to a third-party SaaS.
- Developers who want a RAG reference implementation where every stage is inspectable and swappable.
- Anyone who needs to customize more than a colour — persona, retrieval behaviour, models, storage,
  and thresholds are all configurable per project.

**Runs with no external services.** The default configuration uses SQLite, FAISS and an inline job
runner, so a full instance starts with one command and no Docker.

---

## Design principles

| Principle | What it means in practice |
| --- | --- |
| **Customizable end to end** | Name, avatar, greeting, persona, accent colour, starter questions, system prompt, chat and embedding models, retrieval thresholds — all per project, all editable from the dashboard without a redeploy. |
| **Your data, your infrastructure** | Documents, embeddings, and conversations live in stores you run. Nothing leaves your deployment except calls to the model provider you pick, and that provider can be a local Ollama. |
| **Swappable everything** | Search backend, chat model, embedding model, and reranker sit behind narrow interfaces. Switching SQLite+FAISS to Postgres+pgvector is one environment variable. |
| **Answers you can trace** | Every answer is assembled from retrieved passages and emits a `RetrievalTrace`: rewritten query, per-backend hits and ranks, fusion scores, trust weighting, confidence, and per-stage timings. |
| **Not all content is equal** | Chunks carry a trust score and documents carry a verification date. Stale and low-trust passages are down-weighted at retrieval time. |
| **Multi-tenant from day one** | Organizations, projects, scoped API keys, per-key origin allowlists, and per-key rate limits are in the core data model, not bolted on later. |
| **The widget is a guest** | The embeddable widget renders in a Shadow DOM with zero runtime dependencies, so it cannot leak styles into, or inherit styles from, the host page. |

---

## Architecture

Four deployable surfaces share one API. The API is stateless; all durable state lives in the
relational store, the search index, and object storage.

```mermaid
flowchart TB
    subgraph clients["Client surfaces"]
        widget["Embeddable widget<br/>Shadow DOM, vanilla TS"]
        dash["Management dashboard<br/>Next.js 15 + React 19"]
        sdk["TypeScript SDK<br/>or direct HTTP"]
    end

    subgraph api["FastAPI service"]
        mw["Middleware<br/>CORS · security headers · rate limit"]
        auth["Auth layer<br/>JWT sessions · API key context"]
        routers["Routers<br/>projects · content · chat · analytics"]
        rag["RAG pipeline<br/>rewrite → retrieve → fuse → rerank → gate"]
        jobs["Ingestion jobs<br/>load → chunk → contextualize → embed"]
    end

    subgraph stores["State"]
        rdb[("Relational store<br/>SQLite or Postgres")]
        idx[("Search index<br/>FAISS+FTS5 or pgvector+tsvector")]
        obj[("Object storage<br/>filesystem or S3/MinIO")]
        queue[("Job queue<br/>Redis via arq, or inline")]
    end

    subgraph providers["Model providers"]
        chat["Chat model<br/>Anthropic · OpenAI · Ollama"]
        embed["Embeddings<br/>OpenAI · Ollama"]
        rerank["Cross-encoder reranker<br/>sentence-transformers"]
    end

    widget -->|"publishable key"| mw
    sdk -->|"secret key"| mw
    dash -->|"JWT"| mw
    mw --> auth --> routers
    routers --> rag
    routers --> jobs
    rag --> rdb
    rag --> idx
    rag --> chat
    rag --> embed
    rag --> rerank
    jobs --> queue
    jobs --> obj
    jobs --> rdb
    jobs --> idx
    jobs --> embed
```

| Component | Responsibility |
| --- | --- |
| **API** (`apps/api`) | The only writer of durable state. Owns auth, tenancy, ingestion orchestration, retrieval, and answer generation. |
| **Dashboard** (`apps/dashboard`) | Operator console: knowledge base, widget studio, embed settings, conversations, analytics, knowledge gaps. Talks to the API with a JWT. |
| **Widget** (`apps/widget`) | What end users see on your site. Reads its configuration from the API at boot using a publishable key. |
| **SDK** (`packages/sdk-js`) | Typed client for both the chat surface and the management surface, with streaming helpers. |
| **Landing** (`apps/landing`) | Static marketing site that embeds the real widget as a live demo. |

---

## How answering works

A single `POST /v1/chat` request runs this pipeline. Stages marked optional are toggled by
configuration; everything is timed and recorded in the trace.

```mermaid
flowchart TD
    q["Incoming question<br/>+ conversation history"] --> cache{"Semantic cache<br/><i>optional</i>"}
    cache -->|"cosine ≥ threshold"| hit["Return cached answer<br/>+ original citations"]
    cache -->|"miss"| rewrite["Query rewrite<br/>resolve pronouns and ellipsis<br/>against recent turns"]

    rewrite --> fan{{"Parallel retrieval"}}
    fan --> vec["Vector search<br/>embedding kNN"]
    fan --> lex["Lexical search<br/>FTS5 / tsvector"]

    vec --> fuse["Reciprocal rank fusion<br/>score = Σ 1/(k + rank), k=60<br/>normalized so a top hit in<br/>every list scores 1.0"]
    lex --> fuse

    fuse --> weight["Trust weighting<br/>w = 0.5 + 0.5·trust<br/>w ×= 0.6 if document is stale<br/>final = rrf × w"]
    weight --> rr["Cross-encoder rerank<br/><i>optional</i>"]
    rr --> topk["Take top K<br/>default 6"]

    topk --> gate{"max score ≥<br/>confidence_threshold?"}
    gate -->|"no"| refuse["Refuse in the user's language<br/>log a knowledge gap<br/>answered = false"]
    gate -->|"yes"| prompt["Build grounded prompt<br/>numbered passages + persona<br/>+ citation instructions"]

    prompt --> stream["Stream tokens over SSE"]
    stream --> emit["Emit citations, trace, done"]
    emit --> store["Persist message + trace<br/>warm the semantic cache"]
```

**Why fusion instead of vector-only.** Dense retrieval is strong on paraphrase and weak on exact
identifiers — product codes, error strings, proper nouns. Lexical search is the mirror image.
Reciprocal rank fusion combines the two by rank rather than by score, so the two backends do not
need comparable score scales. The normalization step divides by `n_lists / (k + 1)`, which keeps
the fused score interpretable: a passage ranked first in every list scores exactly `1.0`, which is
what makes a single global `confidence_threshold` meaningful across projects.

**Why weight before the gate.** A passage from a document nobody has verified in six months should
not clear the same bar as a freshly reviewed one. Trust weighting is applied to the fused score
*before* the confidence gate reads it, so freshness and provenance actually change whether the
assistant answers at all — not just the ordering.

**Gaps become a content backlog.** When the gate does not clear, the question is normalized and
recorded as a `FlaggedQuestion` with an occurrence counter, so repeated misses surface in the
dashboard ranked by real demand. The model can draft an answer for a human to review, and an
approved answer is indexed straight back into the knowledge base — the queue tells you exactly
which document to write next.

### Streamed response format

`POST /v1/chat` returns Server-Sent Events:

| Event | Payload | Emitted |
| --- | --- | --- |
| `conversation` | `{ conversation_id, message_id }` | Once, immediately |
| `token` | `{ text }` | Repeatedly while generating |
| `citations` | `{ items: [...] }` | Once, after retrieval |
| `trace` | Full `RetrievalTrace` | Once, before completion |
| `done` | `{ answered: boolean }` | Once, last |

---

## How ingestion works

Ingestion is asynchronous. API calls return as soon as work is queued, and the dashboard polls
document status, so a large crawl never blocks a request.

```mermaid
flowchart LR
    subgraph sources["Sources"]
        up["File upload<br/>PDF · DOCX · Markdown · text"]
        crawl["Website crawl<br/>same-origin BFS"]
        sm["Sitemap"]
        conn["Notion · Google Docs"]
    end

    subgraph expand["Discovery"]
        robots["Honor robots.txt<br/>rate-limited fetch"]
        readable["Strip nav, header, footer<br/>extract readable text"]
        play["Playwright fallback<br/>when static HTML is thin"]
    end

    subgraph process["Processing"]
        parse["Parse and decode<br/>utf-8 · big5 · gb18030"]
        chunkit["Recursive chunking<br/>800 chars / 120 overlap"]
        ctx["Contextual embedding<br/><i>optional</i><br/>LLM writes a locating<br/>sentence per chunk"]
        emb["Embed in batches of 64"]
    end

    subgraph out["Persist"]
        docrow["Document row<br/>digest · token count · status"]
        chunks["Chunk rows<br/>+ trust score"]
        index[("Vector + lexical index")]
        hook["webhook: document.indexed"]
    end

    up --> parse
    crawl --> robots --> readable --> parse
    sm --> readable
    conn --> parse
    readable -.->|"thin page"| play -.-> parse
    parse --> chunkit --> ctx --> emb
    emb --> docrow --> chunks --> index --> hook
```

**Contextual embedding.** Retrieval fails on chunks that are locally meaningless — a paragraph
saying "it must be returned within 30 days" is unfindable if the surrounding document never repeats
what "it" is. When enabled, the ingestion job asks the chat model to write one short locating
sentence per chunk given the document summary, and prepends it to the text that gets embedded. The
stored chunk text is unchanged, so citations still show the original passage. Requests run with a
concurrency cap of 4 to bound cost.

**Crawling behaviour.** The crawler stays on the origin it was given, honors `robots.txt`, applies a
delay between requests, and stops at a configurable page budget (default 25) — a cost and noise
control, since every page costs an embedding call. Pages whose static HTML yields too little text
fall back to a headless render when the optional Playwright extra is installed.

**Deletion is cascading.** Removing an ingestion source removes the documents it produced and their
vectors, so a crawl can be cleanly undone in one action.

---

## Features

### Ingestion and indexing

- File upload (PDF, DOCX, Markdown, plain text) with 25 MB per-file limit and format sniffing by
  both content type and extension
- Website crawling with same-origin BFS, `robots.txt` compliance, readable-content extraction, and
  an optional headless-browser fallback for JavaScript-rendered pages
- Sitemap expansion with nested sitemap support
- Notion and Google Docs connectors
- Recursive chunking tuned for mixed CJK and Latin text
- Optional per-chunk contextual embedding
- Background jobs via Redis and arq, with an inline runner when no queue is configured
- Re-index a single source or an entire project
- Cascading deletes across documents, chunks, and vectors

### Retrieval and answering

- Token-by-token SSE streaming, so answers start appearing immediately
- Conversation memory: follow-up questions are rewritten against recent turns before retrieval
- Hybrid dense plus lexical retrieval, executed in parallel
- Reciprocal rank fusion with normalized scores
- Optional cross-encoder reranking
- Trust weighting and staleness penalties applied before the confidence gate
- Semantic answer cache with a cosine-similarity threshold
- Citations resolved back to document title and URL
- Per-project confidence threshold with multilingual refusal
- Chinese-aware text handling (jieba segmentation, OpenCC normalization)

### Multi-tenant platform

- Organizations, users, and projects
- Three API key types with distinct capabilities and prefixes
- Per-key origin allowlists and rate limits
- Per-project model providers, thresholds, staleness windows, and system prompt
- Persona templates that seed a project's prompt and widget configuration
- Document-level enable and disable, excluded from retrieval when off
- Tagging with filtering and per-tag statistics

### Operations

- Retrieval trace persisted per message and viewable in the dashboard
- Analytics: conversation and message volume, satisfaction, refusal rate, cache hit rate, average
  confidence, stale documents, token usage
- Knowledge-gap queue with occurrence counts, LLM-drafted answers, and one-click promotion into
  the knowledge base
- Message-level thumbs up and down feedback
- Conversation browsing and export
- Outbound webhooks with HMAC signatures, delivery log, retries, and a test trigger
- Optional Sentry error tracking

### Embeddable widget

- One `<script>` tag, configured with data attributes
- Shadow DOM isolation, no runtime dependencies
- Configuration fetched from the API by publishable key, so appearance changes need no redeploy
- Themeable accent colour, avatar, greeting, persona, and starter questions
- Streaming answers with inline citations and Markdown rendering
- Light, dark, and automatic themes; multilingual UI

---

## Tech stack

| Concern | Choice |
| --- | --- |
| API | FastAPI, Uvicorn, SSE streaming, auto-generated Swagger and ReDoc |
| Model orchestration | LangChain provider integrations |
| Chat models | Anthropic, OpenAI, Ollama — selectable per project |
| Embeddings | OpenAI or Ollama — selectable per project |
| Reranker | `sentence-transformers` cross-encoder (optional `rerank` extra) |
| Vector search | FAISS locally, pgvector on Postgres |
| Lexical search | SQLite FTS5 locally, Postgres `tsvector` in deployment |
| Relational store | SQLAlchemy 2 async over SQLite or Postgres |
| Chinese NLP | jieba segmentation, OpenCC normalization |
| Auth | argon2 password hashing, PyJWT access and refresh tokens, Google OAuth |
| Queue | arq over Redis, with an inline fallback |
| Object storage | S3 or MinIO, with a local filesystem fallback |
| Crawling | httpx and BeautifulSoup, optional Playwright (`crawl` extra) |
| Dashboard | Next.js 15, React 19, TypeScript, CSS custom properties |
| Widget | Vanilla TypeScript, esbuild, Shadow DOM, zero runtime dependencies |
| SDK | TypeScript, tsup (ESM + CJS + types), zero runtime dependencies |
| Tooling | uv (Python), pnpm workspaces, ruff, mypy, ESLint, Vitest, pytest |
| CI/CD | GitHub Actions, Docker Compose |

---

## Project structure

```
EmbAId-Chat/
├── apps/
│   ├── api/                     FastAPI backend — run uv commands from here
│   │   ├── src/
│   │   │   ├── main.py          App factory, middleware, router registration
│   │   │   ├── config.py        Environment-backed settings
│   │   │   ├── db/              SQLAlchemy models, async session, id helpers
│   │   │   ├── search/          Backend protocol + sqlite_faiss, postgres, factory
│   │   │   ├── rag/             pipeline, retriever, rerank, rewrite, cache, prompt
│   │   │   ├── ingestion/       loaders, web crawl, connectors, chunking, contextual, jobs
│   │   │   ├── providers/       Chat and embedding provider registry
│   │   │   ├── security/        argon2, JWT, API key hashing, HMAC signing
│   │   │   ├── api/             routers/, services/, deps, errors, middleware
│   │   │   └── tasks/           arq queue and worker
│   │   └── tests/               Offline suite with fakes for search, embeddings, chat
│   ├── dashboard/               Next.js management console
│   ├── widget/                  Embeddable Shadow DOM widget + demo page
│   └── landing/                 Static marketing site with a live widget demo
├── packages/
│   └── sdk-js/                  @embaid/sdk-js official TypeScript client
├── docker/                      docker-compose.yml and Dockerfiles
└── .github/workflows/           CI: API tests, workspace build and test
```

`apps/api` is a standalone Python project managed by uv. Everything else is a pnpm workspace. The
repository root holds only workspace and orchestration config.

---

## Getting started

### Prerequisites

- Python 3.13 and [uv](https://github.com/astral-sh/uv)
- Node.js 20+ and pnpm 10
- One model provider: an Anthropic or OpenAI key, or a local [Ollama](https://ollama.com)
- Docker (optional — only for the full Postgres, Redis, and MinIO stack)

### Backend

```bash
cd apps/api
uv sync --extra dev
cp .env.example .env          # set JWT_SECRET and one provider key
uv run uvicorn src.main:app --reload
```

The API is at `http://localhost:8000`, interactive docs at `/docs`. The default configuration uses
SQLite, FAISS, and an inline job runner, so nothing else needs to be running.

Optional extras:

```bash
uv sync --extra dev --extra rerank    # cross-encoder reranking
uv sync --extra dev --extra crawl     # Playwright fallback for JS-heavy pages
```

### Frontend workspaces

```bash
pnpm install
pnpm -r build                 # widget, SDK, dashboard
pnpm -r test
```

Run the dashboard in development:

```bash
pnpm --filter @embaid/dashboard dev    # http://localhost:3000
```

Build the widget and open its isolation demo:

```bash
pnpm --filter @embaid/widget build
# then open apps/widget/demo.html
```

Serve the marketing site with the live embedded widget:

```bash
cd apps/landing && pnpm serve          # builds the widget, serves on :4180
```

### Full stack with Docker

```bash
docker compose -f docker/docker-compose.yml up --build
# api :8000 · dashboard :3000 · postgres :5432 · redis :6379 · minio :9000
```

Postgres with pgvector, Redis, and MinIO come up as services and the API switches to the Postgres
backend automatically. Add `--profile ollama` to run a local model alongside.

---

## Your first assistant

End to end, from an empty database to a working embed:

1. **Create an account** at `http://localhost:3000` and create a project. Optionally pick a persona
   template to seed the system prompt and widget copy.
2. **Add knowledge** on the knowledge base page — drag in a PDF or Markdown file, or add a website
   and let the crawler expand it. Documents appear immediately and flip from processing to ready as
   indexing completes.
3. **Customize the widget** in the widget studio: bot name, greeting, persona, accent colour,
   avatar, and starter questions, with a live preview of the real chat window.
4. **Create a publishable key** on the embed page and press deploy. You get a ready-to-paste script
   tag, and the floating test bot in the dashboard unlocks so you can try the assistant without
   leaving the console.
5. **Paste the snippet** before `</body>` on your site.
6. **Grow the knowledge base.** Questions your content could not yet cover collect in the
   knowledge-gap queue, ranked by how often visitors asked them. Draft an answer with the model,
   approve it, and it is indexed straight back in.

---

## Configuration

Backend settings come from `apps/api/.env`. A minimal working file:

```bash
ENVIRONMENT=development
JWT_SECRET=                       # openssl rand -hex 32
DATABASE_URL=sqlite+aiosqlite:///./data/embaid.sqlite
SEARCH_BACKEND=sqlite_faiss       # or postgres
QUEUE_ENABLED=false               # true requires Redis
ANTHROPIC_API_KEY=                # or OPENAI_API_KEY, or run Ollama
DEFAULT_CHAT_PROVIDER=anthropic
DEFAULT_EMBEDDING_PROVIDER=openai
```

### Retrieval tuning

| Variable | Default | Effect |
| --- | --- | --- |
| `RETRIEVAL_CANDIDATES` | `30` | Candidates pulled from each backend before fusion. Higher recall, higher cost. |
| `RETRIEVAL_TOP_K` | `6` | Passages passed to the model after reranking. |
| `CONFIDENCE_THRESHOLD` | `0.35` | Global default for the refusal gate; overridable per project. |
| `RERANK_ENABLED` | `true` | Cross-encoder reranking. Requires the `rerank` extra. |
| `RERANK_MODEL` | `BAAI/bge-reranker-v2-m3` | Multilingual cross-encoder. |
| `SEMANTIC_CACHE_ENABLED` | `true` | Reuse answers for near-identical questions. |
| `SEMANTIC_CACHE_THRESHOLD` | `0.95` | Cosine similarity required for a cache hit. |
| `CONTEXTUAL_EMBEDDING_ENABLED` | `true` | LLM-generated locating sentence per chunk at index time. |
| `DOCUMENT_STALENESS_DAYS` | `180` | Age after which a document is treated as stale and down-weighted. |
| `EMBEDDING_DIMENSIONS` | `1536` | Must match the embedding model. Changing it requires a re-index. |

### Infrastructure

| Variable | Default | Effect |
| --- | --- | --- |
| `SEARCH_BACKEND` | `sqlite_faiss` | `sqlite_faiss` for local, `postgres` for pgvector plus `tsvector`. |
| `QUEUE_ENABLED` | `true` | `false` runs ingestion inline — convenient locally, not for production. |
| `STORAGE_ENDPOINT_URL` | unset | Set for S3 or MinIO; falls back to the local filesystem. |
| `RATE_LIMIT_PUBLISHABLE` | `20` | Requests per minute for browser-facing keys. |
| `RATE_LIMIT_SECRET` | `200` | Requests per minute for server-side keys. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated. Wildcards are rejected in production. |

In production the application refuses to start with a default `JWT_SECRET` or a wildcard CORS
origin. Everything not listed is optional and safely skipped when unset.

---

## Embedding the widget

```html
<script
  src="https://cdn.embaid.chat/widget.js"
  data-key="pub_xxxxxxxx"
  data-project="proj_xxxxxxxx"
></script>
```

| Attribute | Required | Purpose |
| --- | --- | --- |
| `data-key` | yes | Publishable key. Safe to expose — see [Security model](#security-model). |
| `data-project` | yes | Project the widget answers for. |
| `data-api-url` | no | Point at your own API. Defaults to `https://api.embaid.chat`. |

The widget fetches appearance and starter questions from `GET /v1/widget-config` at boot, so
changes made in the dashboard take effect on reload without touching the host page. It renders
entirely inside a Shadow DOM, so no host CSS leaks in and none of its styles leak out.

**Before going live**, set the key's allowed origins to your domain. An origin-scoped key is
rejected with `403` when presented from anywhere else.

---

## Using the SDK

```bash
npm install @embaid/sdk-js
```

Streaming a grounded answer. Both `apiKey` and `projectId` are required; the key type is detected
from its prefix:

```ts
import { EmbAId } from "@embaid/sdk-js";

const client = new EmbAId({
  apiKey: process.env.EMBAID_KEY!,          // pub_… or sbx_…
  projectId: process.env.EMBAID_PROJECT_ID!,
});

for await (const event of client.chat.stream({ message: "What is the refund window?" })) {
  if (event.type === "token") process.stdout.write(event.text);
  if (event.type === "citations") console.log("\nSources:", event.citations.map((c) => c.title));
  if (event.type === "done" && event.refusalReason) {
    console.log(`\nDeclined (${event.refusalReason}) — logged as a knowledge gap.`);
  }
}
```

The stream is a typed `AsyncGenerator` over a discriminated union — `conversation`, `token`,
`citations`, `trace`, `done`, `error`, plus an `unknown` variant so a future server-side event
does not break existing clients. Use `chat.send()` instead when you want the collected result
rather than the stream.

Management calls require a secret key and must run server-side:

```ts
const admin = new EmbAId({
  apiKey: process.env.EMBAID_SECRET_KEY!,   // sk_…
  projectId: process.env.EMBAID_PROJECT_ID!,
});

await admin.sources.create({
  type: "url_crawl",
  config: { url: "https://example.com/docs", max_pages: 50 },
});
```

Project-scoped resources (`sources`, `documents`, `apiKeys`, `tags`, `knowledgeGaps`,
`analytics`, `webhooks`) read the project from the constructor, so they take no project argument.
Reaching for any of them with a non-secret key throws `EmbAIdPermissionError` at the call site
rather than sending a request that the server would reject — the client refuses to leak a
management call through a browser-safe key.

The SDK ships ESM, CJS, and type declarations with no runtime dependencies.

---

## API reference

Interactive documentation is served at `/docs` (Swagger) and `/redoc`. All errors share the
envelope `{"detail": {"code": "...", "message": "..."}}`.

### Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | none | Create a user and organization |
| `POST` | `/auth/login` | none | Exchange credentials for tokens |
| `POST` | `/auth/refresh` | refresh token | Rotate the access token |
| `GET` | `/auth/me` | JWT | Current user |
| `GET` | `/auth/providers` | none | Which login methods are configured |
| `GET` | `/auth/oauth/google` | none | Start Google OAuth |
| `GET` | `/auth/oauth/google/callback` | none | Complete Google OAuth |

### Projects and keys

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/project-templates` | Built-in persona templates |
| `POST` `GET` | `/v1/projects` | Create and list projects |
| `GET` `PATCH` `DELETE` | `/v1/projects/{id}` | Read, update, delete |
| `GET` `PUT` | `/v1/projects/{id}/widget-config` | Widget appearance |
| `POST` `GET` | `/v1/projects/{id}/api-keys` | Mint and list keys |
| `PATCH` `DELETE` | `/v1/projects/{id}/api-keys/{key_id}` | Rename or revoke |

### Content

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` `GET` | `/v1/projects/{id}/sources` | Add and list ingestion sources |
| `GET` `DELETE` | `/v1/sources/{source_id}` | Inspect or remove, cascading to documents |
| `POST` | `/v1/sources/{source_id}/reindex` | Re-run one source |
| `POST` | `/v1/projects/{id}/reindex` | Re-run every source |
| `POST` | `/v1/projects/{id}/documents/upload` | Upload a file |
| `GET` | `/v1/projects/{id}/documents` | List with filters |
| `GET` `PATCH` `DELETE` | `/v1/documents/{doc_id}` | Detail with chunks, rename, enable, delete |
| `POST` | `/v1/documents/{doc_id}/verify` | Mark verified, clearing staleness |
| `PUT` | `/v1/documents/{doc_id}/tags` | Assign tags |
| `POST` `GET` | `/v1/projects/{id}/tags` | Create and list tags |
| `PATCH` `DELETE` | `/v1/tags/{tag_id}` | Rename or delete |

### Chat and history

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/chat` | API key | Ask a question, SSE stream back |
| `GET` | `/v1/widget-config` | publishable key | Widget bootstrap configuration |
| `GET` | `/v1/conversations` | JWT | Browse conversations |
| `GET` `DELETE` | `/v1/conversations/{id}` | JWT | Read or delete a transcript |
| `GET` | `/v1/conversations/export` | JWT | Bulk export |
| `POST` | `/v1/messages/{id}/feedback` | API key | Thumbs up or down |
| `GET` | `/v1/messages/{id}/trace` | JWT | Full retrieval trace |

### Insights and integrations

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/v1/projects/{id}/analytics` | Volume, satisfaction, refusal and cache rates, tokens |
| `GET` | `/v1/projects/{id}/knowledge-gaps` | Unanswered questions by frequency |
| `POST` | `/v1/knowledge-gaps/{id}/draft-answer` | LLM-drafted answer for review |
| `POST` | `/v1/knowledge-gaps/{id}/approve` | Promote the answer into the knowledge base |
| `DELETE` | `/v1/knowledge-gaps/{id}` | Dismiss |
| `GET` | `/v1/webhook-events` | Subscribable event types |
| `POST` `GET` | `/v1/projects/{id}/webhooks` | Register and list endpoints |
| `PATCH` `DELETE` | `/v1/webhooks/{id}` | Update or remove |
| `POST` | `/v1/webhooks/{id}/test` | Send a test delivery |
| `GET` | `/v1/webhooks/{id}/deliveries` | Delivery log with status codes |

---

## Data model

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "has members"
    ORGANIZATION ||--o{ PROJECT : owns
    PROJECT ||--o{ API_KEY : issues
    PROJECT ||--o{ INGESTION_SOURCE : "pulls from"
    PROJECT ||--o{ DOCUMENT : contains
    PROJECT ||--o{ TAG : defines
    PROJECT ||--o{ CONVERSATION : serves
    PROJECT ||--o{ FLAGGED_QUESTION : "collects gaps"
    PROJECT ||--o{ SEMANTIC_CACHE_ENTRY : caches
    PROJECT ||--o{ WEBHOOK_ENDPOINT : notifies

    INGESTION_SOURCE ||--o{ DOCUMENT : produces
    DOCUMENT ||--o{ DOCUMENT_CHUNK : "split into"
    DOCUMENT }o--o{ TAG : "labelled by"
    CONVERSATION ||--o{ MESSAGE : records
    MESSAGE }o--o{ DOCUMENT_CHUNK : cites
    WEBHOOK_ENDPOINT ||--o{ WEBHOOK_DELIVERY : logs

    PROJECT {
        string id PK
        string name
        string chat_provider
        string embedding_provider
        float confidence_threshold
        int staleness_days
        string system_prompt
        json widget_config
    }
    API_KEY {
        string id PK
        string type "publishable, secret or sandbox"
        string key_prefix
        string key_hash "sha-256"
        json allowed_origins
        int rate_limit_per_minute
        datetime revoked_at
    }
    DOCUMENT {
        string id PK
        string title
        string url
        string status
        bool enabled
        int token_count
        string content_digest
        datetime last_verified_at
    }
    DOCUMENT_CHUNK {
        string id PK
        text content
        int position
        float trust_score
    }
    MESSAGE {
        string id PK
        string role
        text content
        bool answered
        float confidence
        json trace
        int feedback
    }
    FLAGGED_QUESTION {
        string id PK
        text question_text
        string normalized_text
        int occurrence_count
        string status
    }
```

Sixteen tables in total; the diagram shows the ones you interact with. Identifiers are prefixed,
sortable strings (`proj_`, `doc_`, `msg_`) rather than integers, so they are safe to expose in URLs
and logs. Every tenant-scoped row carries `project_id` and queries filter on it explicitly.

---

## Security model

### Three key types

| Type | Prefix | Belongs in | Can do |
| --- | --- | --- | --- |
| **Publishable** | `pub_` | Browser, public HTML | Chat endpoints only, for one project, subject to the origin allowlist |
| **Secret** | `sk_` | Your backend only | Full management access |
| **Sandbox** | `sbx_` | Testing | Same as publishable, but conversations are marked as tests |

Keys are generated server-side and stored only as a SHA-256 hash alongside a short display prefix.
The plaintext is returned exactly once, at creation. A lost key cannot be recovered — it is revoked
and replaced. A database leak therefore yields hashes, not usable credentials.

### Why a publishable key in public HTML is safe

The same reasoning as a Stripe publishable key or a Google Maps browser key:

1. It reaches only the chat endpoints, and only for the project it was minted for. It cannot read
   raw documents or change any configuration.
2. It is constrained by an origin allowlist. Copied to another site, requests are rejected with
   `403`.
3. It is rate limited per minute, independently from server-side keys.

The worst case is somebody sending chat messages from a domain you already approved, at a bounded
rate. The `sk_` key that can actually change things never reaches a browser.

### Other controls

- argon2id password hashing; short-lived JWT access tokens with rotating refresh tokens
- Security headers and strict CORS; wildcard origins rejected outside development
- Webhook payloads signed with HMAC-SHA256 so receivers can verify origin and integrity
- Crawling honours `robots.txt` and identifies itself with a descriptive user agent
- Uploads capped at 25 MB with format validation before parsing
- Tenant isolation enforced in query construction, not by convention

---

## Observability

**Retrieval traces.** Every answer stores the query as rewritten, per-backend hits with ranks and
scores, fused and trust-weighted scores, final confidence against the threshold, whether the
assistant answered, and per-stage timings (cache lookup, rewrite, embed, search, fuse, rerank,
load, generate). The dashboard renders this as a trace viewer, so "why did it say that" is a
question with a concrete answer.

**Analytics.** Conversation and message volume, satisfaction from thumbs up and down, refusal rate,
cache hit rate, average confidence, stale document count, and token usage — per project over a
selectable window.

**Knowledge gaps.** Refused questions are normalized, deduplicated, and counted. High-frequency
gaps rise to the top, can be answered by the model for a human to review, and approved answers are
written straight back into the knowledge base.

**Webhooks.** Subscribe to events such as `document.indexed` and `knowledge_gap.created` to drive
your own automation. Deliveries are signed, retried with backoff, and logged with response codes.

---

## Deployment

The API is stateless and horizontally scalable; state lives in Postgres, the search index, object
storage, and Redis.

A production-shaped configuration:

```bash
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://user:pass@host/embaid
SEARCH_BACKEND=postgres           # pgvector + tsvector
QUEUE_ENABLED=true                # run workers separately
REDIS_URL=redis://host:6379
STORAGE_ENDPOINT_URL=https://s3.example.com
JWT_SECRET=<32+ random bytes>
CORS_ORIGINS=https://console.example.com
```

Run at least one worker alongside the API so ingestion does not compete with request handling:

```bash
uv run arq src.tasks.worker.WorkerSettings
```

`docker/docker-compose.yml` brings up the whole stack — API, dashboard, Postgres with pgvector,
Redis, and MinIO — and is a reasonable starting point for a single-host deployment.

---

## Testing

```bash
cd apps/api
uv run pytest              # backend suite
uv run ruff check .        # lint
uv run mypy src            # type check

pnpm -r test               # widget, SDK, dashboard
pnpm -r typecheck
pnpm -r lint
```

The backend suite runs fully offline: search backends, embeddings, and the chat model are replaced
with deterministic fakes, so retrieval logic, fusion maths, refusal behaviour, and tenancy rules are
tested without network access or API keys. CI runs both suites on every push.

---

## Contributing

Issues and pull requests are welcome.

1. Fork and branch from `main`.
2. Keep changes focused; one concern per pull request.
3. Add tests for behaviour changes — especially anything touching retrieval, fusion, or tenancy.
4. Run the full check set above before opening the PR.
5. Follow the existing style: `ruff` and `mypy` for Python, ESLint and `tsc` for TypeScript,
   Conventional Commits for messages.

---

## License

Released under the [MIT License](LICENSE).
