<div align="center">

# proprAI Chat 智嵌

**proprAI Chat** is a full-stack, open-source, API-first platform that turns any body of
content into an answerable knowledge base: upload documents or point it at a website, and it
serves grounded, streaming, cited answers over a REST + SSE API that a one-line embeddable
widget, a mobile app, or any backend can call — multi-tenant, Traditional-Chinese-first,
Postgres+pgvector in production or SQLite+FAISS for local development.

[![CI](https://github.com/ShiYu0318/proprAI-Chat/actions/workflows/ci.yml/badge.svg)](https://github.com/ShiYu0318/proprAI-Chat/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/api-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen.svg)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Package manager: uv](https://img.shields.io/badge/deps-uv-purple.svg)](https://github.com/astral-sh/uv)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Web dashboard](#web-dashboard)
- [RAG design](#rag-design)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [API reference](#api-reference)
- [Database schema](#database-schema)
- [Security](#security)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Overview

proprAI Chat lets you stand up a grounded question-answering service over your own content
without wiring a RAG pipeline yourself. Upload PDFs, Word, Markdown, or plain text, crawl a
website, expand a sitemap, or import from Notion and Google Docs; the platform chunks,
contextualizes, embeds, and indexes everything, then answers questions from it with inline
source citations. Answers stream token by token over Server-Sent Events, and every answer
keeps an auditable retrieval trace you can read back through the API.

Because the product is **API-first**, the same knowledge base is reachable three ways: a
one-line embeddable JavaScript widget, the official `@proprai/sdk-js` client, or a direct
`POST /v1/chat` call from any backend, mobile app, or bot. The widget is only the first
official client, not the whole product.

The platform is **multi-tenant SaaS**: anyone can sign up, and each account owns isolated
projects, each with its own knowledge base, API keys, model providers, and widget
appearance. It is **Traditional-Chinese-first** — the widget and dashboard default to zh-TW
with an i18n layer built in from the start, and Chinese content is segmented and normalized
before indexing.

Retrieval runs on free, local components where possible — SQLite + FAISS and local embedding
or reranker models — and swaps to Postgres + pgvector for deployment behind a single storage
interface. Heavier pieces (cross-encoder reranking, contextual embedding, LLM providers)
degrade gracefully when their services or keys are unavailable.

## proprAI = propri + AI

> Embed proprAI Chat, inlAId intelligence for your website.

源自拉丁文 proprius，意為「屬於自己的」，作為詞根：proprietary, property, appropriate，在此代表客製化 AI 形象與資料庫的理念。

透過 RAG 技術可讓使用者在屬於自己的向量資料庫中 Embedding（詞嵌入）專屬文件提供 AI 根據資料回覆。

於是在 propri 中嵌入 AI 形成 proprAI，就如同在網站中嵌入 proprAI 一般，將智慧鑲嵌（inlaid）在其中。

> Fun Fact: 鑲嵌 (inlaid) 本身也正好鑲嵌了 AI 在其中。

## Features

### Ingestion and indexing
- **Multi-source ingestion** — file upload (PDF, DOCX, TXT, Markdown), single-URL fetch,
  same-origin bounded website crawl with robots.txt respect, sitemap.xml expansion, and
  Notion / Google Docs connectors.
- **JavaScript-rendered pages** — optional Playwright fallback when a static fetch yields too
  little text.
- **Chinese-aware chunking** — recursive splitting that respects CJK punctuation, since
  Chinese has no word spaces.
- **Contextual chunk embedding** — each chunk is situated within its document before
  embedding (Anthropic Contextual Retrieval), improving recall; falls back to plain chunk
  text if the model call fails.
- **Content freshness** — documents carry a last-verified timestamp and a derived stale flag;
  stale or low-trust chunks are down-weighted at retrieval time and can be re-verified from
  the dashboard.
- **Background processing** — crawling, chunking, and embedding run on an arq + Redis queue,
  or inline when the queue is disabled (local dev and tests).

### Retrieval and question-answering
- **Hybrid retrieval** — dense vector similarity (pgvector or FAISS) fused with lexical
  search (Postgres tsvector or SQLite FTS5) via Reciprocal Rank Fusion.
- **Cross-encoder reranking** — optional second-stage precision reranking; passes results
  through unchanged when the model is unavailable.
- **Conversational query rewriting** — follow-up questions are rewritten into standalone
  questions against prior turns before retrieval.
- **Low-confidence refusal** — when the top score falls below the project threshold, the
  model is never called; the system replies "not found" and records a knowledge gap.
- **Semantic answer cache** — near-duplicate questions short-circuit to a stored answer.
- **Auditable retrieval trace** — every answer records the rewritten query, per-stage vector
  and lexical scores, fused and reranked rankings, confidence vs threshold, cache-hit status,
  and stage timings, readable through the API and dashboard.
- **Streaming, cited answers** — tokens stream over SSE with inline source citations.

### Multi-tenant platform
- **Self-serve accounts** — email + password (argon2, JWT access/refresh) with per-account
  organizations and projects.
- **Per-project configuration** — chat provider and model, embedding provider and model,
  default locale, confidence threshold, staleness window, and system prompt.
- **Persona templates** — seed a new project as a support, sales, documentation, or internal
  knowledge assistant with a zh-TW system prompt and starter questions.
- **Three API key types** — `publishable` (browser/app safe, chat only, origin-allowlisted),
  `secret` (server-side, full access), and `sandbox` (test traffic kept out of production
  analytics); raw keys are shown exactly once.
- **Provider switching** — Anthropic, OpenAI, and Ollama for generation; OpenAI and Ollama
  for embeddings, per project.

### Operations and developer experience
- **Conversation history** — searchable, filterable transcripts with per-message feedback
  and CSV export.
- **Two-way knowledge loop** — unanswered questions surface as ranked knowledge gaps; draft
  an answer with the model, edit it, and approve it straight into the knowledge base.
- **Analytics** — conversation and message volume over time, refusal rate, thumbs
  up/down satisfaction, cache-hit rate, average confidence, token usage, top questions, and
  stale-document count.
- **Webhooks** — subscribe to `document.indexed`, `source.failed`, `conversation.started`,
  and `knowledge_gap.created` with HMAC-signed deliveries and a delivery log.
- **Official SDK** — `@proprai/sdk-js`, a zero-dependency, browser/Node/edge TypeScript
  client with streaming and non-streaming chat, retries, and full types.

### Embeddable widget
- **One-line embed** — a single `<script>` tag with a publishable key.
- **Shadow DOM isolation** — styles are fully encapsulated so host-page CSS and widget CSS
  never bleed into each other.
- **Safe rendering** — model output is rendered as Markdown by building DOM nodes, never
  `innerHTML`, and `javascript:` / `data:` URLs are stripped; a hostile document cannot run
  script on the host page.
- **Customizable** — colour, launcher position, greeting, starter-question chips, bot name
  and avatar, and dark mode that can follow the host page.
- **Accessible and bilingual** — focus trap, keyboard controls, ARIA roles, reduced-motion
  support, and a zh-TW / en translation dictionary.

## Web dashboard

| Page | What it does |
| --- | --- |
| **Overview** | Project picker with headline metrics and recent activity |
| **Knowledge base** | Drag-drop upload, add crawl / sitemap / Notion / Google Docs sources, source status and reindex, document list with stale badges and verify, tag management |
| **Playground** | Token-streamed chat (SSE) over a project with inline citations |
| **Trace viewer** | Readable retrieval provenance: rewritten query, vector vs lexical hits with scores, fused ranking, rerank order, confidence vs threshold, cache-hit status, and stage timings |
| **Conversations** | Searchable, filterable transcripts with per-message feedback, a link into the trace viewer, and CSV export |
| **Knowledge gaps** | Ranked unanswered questions, model-drafted answers, edit, approve into the knowledge base, or dismiss |
| **Analytics** | Volume over time, satisfaction, refusal rate, cache-hit rate, token usage, and top questions |
| **Widget studio** | Live-preview appearance editor and a copy-to-clipboard embed snippet |
| **Settings** | Project config (providers, models, locale, threshold, staleness, system prompt, persona), API keys shown once on creation, and webhook management |

Design notes:

- **zh-TW first** — every user-facing string flows through a translation dictionary; zh-TW is
  the default and complete locale, with en alongside.
- **Streaming** — `/v1/chat` streams over Server-Sent Events; the client reads `fetch`
  streams (POST + `X-API-Key` header) rather than `EventSource`.
- **Light and dark** — a considered typography, spacing, and colour system with full light
  and dark support, and charts legible in both.
- **Auto docs** — the API self-documents at `/docs` (Swagger UI) and `/redoc` (ReDoc).

## RAG design

proprAI Chat composes the retrieval-augmented generation stages as swappable modules behind
one storage interface, so the same behavior runs on SQLite + FAISS locally and Postgres +
pgvector in deployment:

| Concern | Where |
| --- | --- |
| Advanced RAG | hybrid retrieval, conversational query rewriting, cross-encoder reranking, contextual chunk embedding, semantic answer cache, traceable citations |
| Modular RAG | `rag/pipeline.py` composes cache → rewrite → retrieve → rerank → confidence gate → generate into one configurable flow |
| Corrective / refusal | low-confidence questions are refused instead of hallucinated, and recorded as knowledge gaps |
| Trust weighting | stale documents and low-trust chunks are down-weighted during fusion |
| Two-way loop | knowledge gaps are drafted, reviewed, and folded back into the index |

The retrieval flow for a question:

```
question
  -> semantic cache lookup (short-circuit on a near-duplicate)
  -> conversational rewrite (follow-up -> standalone question, when history exists)
  -> hybrid retrieval: pgvector/FAISS vectors + tsvector/FTS5 lexical, fused with RRF
     (Chinese content segmented and normalized; stale / low-trust chunks down-weighted)
  -> cross-encoder rerank (optional; pass-through when unavailable)
  -> confidence gate: below the project threshold -> refuse, flag a knowledge gap
                      otherwise -> stream a grounded, cited answer over SSE, cache it
  -> every stage written to the message retrieval trace
```

## Architecture

```
  Widget (Shadow DOM, vanilla TS)   Dashboard (Next.js, React)   Any client via @proprai/sdk-js
             \                              |                          /
              \        X-API-Key / SSE      |     Bearer JWT          /
               v                            v                        v
                        FastAPI (apps/api: routers -> services)
                                          |
              shared core (src/): auth, RAG pipeline, ingestion, providers, webhooks
                                          |
                        Store interface (search/ + db/)
                          |-- SqliteFaissBackend    : SQLite + FAISS (local default)
                          |-- PostgresBackend        : Postgres + pgvector (deployment)
                                          ^
              arq + Redis worker: crawl / chunk / contextual-embed / index / deliver webhooks
                                          ^
              MinIO / S3 object storage for uploaded files
```

- The **storage interface** hides the relational and vector stores behind one contract; the
  same test suite runs against both backends.
- LLM and embedding providers sit behind a small **provider registry**, so Anthropic, OpenAI,
  and Ollama are swapped by configuration, not code.
- Heavy work runs on the **queue**; with the queue disabled the same jobs run inline, so the
  API works without Redis in local development and tests.
- Every query is scoped by `project_id`; cross-tenant access is treated as a security defect.

## Tech stack

| Concern | Choice |
| --- | --- |
| API | FastAPI + Uvicorn, SSE streaming, auto Swagger / ReDoc |
| LLM / RAG layer | LangChain provider integrations (Anthropic, OpenAI, Ollama) |
| Embeddings | OpenAI or Ollama, per project |
| Reranker | `sentence-transformers` cross-encoder (optional `rerank` extra) |
| Vector store | FAISS locally; pgvector on Postgres |
| Lexical search | SQLite FTS5 locally; Postgres tsvector in deployment |
| Relational store | SQLite (default) or Postgres, behind a store interface |
| Chinese NLP | jieba segmentation + OpenCC normalization |
| Auth | argon2 password hashing + PyJWT access/refresh |
| Queue | arq + Redis (inline fallback when disabled) |
| Object storage | MinIO / S3 (local filesystem fallback) |
| Crawling | httpx + BeautifulSoup, optional Playwright (`crawl` extra) |
| Dashboard | Next.js, React 19, TypeScript |
| Widget | Vanilla TypeScript, esbuild, Shadow DOM, zero runtime dependencies |
| SDK | TypeScript, tsup (ESM + CJS + types), zero runtime dependencies |
| Error tracking | Sentry (optional) |
| Package managers / deploy | uv (Python), pnpm (workspaces); Docker Compose; GitHub Actions CI |

## Project structure

```
proprAI-Chat/
  apps/
    api/                 FastAPI backend (run uv commands from here)
      src/
        main.py          App factory, middleware, router registration
        config.py        Settings from environment
        db/              SQLAlchemy models, session, id helpers
        search/          Store interface: base, sqlite_faiss, postgres, factory
        rag/             pipeline, retriever, rerank, rewrite, cache, prompt, text, types
        ingestion/       loaders, web crawl, connectors, chunking, contextual, jobs, runtime
        providers/       LLM and embedding provider registry
        security/        argon2 passwords, JWT tokens, API key hashing and HMAC
        api/             routers/ (auth, projects, api_keys, sources, documents, chat,
                         conversations, messages, knowledge_gaps, analytics, webhooks),
                         services/ (templates, events), deps, errors, middleware
        tasks/           arq queue and worker
      tests/             Offline test suite (fakes for search, embeddings, and chat model)
    dashboard/           Next.js management dashboard
    widget/              Embeddable Shadow DOM chat widget + esbuild build + demo.html
  packages/
    sdk-js/              @proprai/sdk-js official TypeScript client
  docker/                docker-compose.yml + Dockerfiles
  .github/workflows/     CI: API tests, workspace build and test
```

Backend and frontend are separated; the root holds workspace and Docker orchestration only.
`apps/api` is a standalone Python project (uv); the JavaScript packages are a pnpm workspace.

## Quick start

### Prerequisites

- Python 3.13 + [`uv`](https://github.com/astral-sh/uv)
- Node.js 20+ and pnpm 10 (for the widget, SDK, and dashboard)
- At least one LLM provider key (Anthropic or OpenAI), or a local Ollama, for live answers
- Docker (optional, for the full stack with Postgres, Redis, and MinIO)

### Backend

```bash
cd apps/api
uv sync --extra dev
cp .env.example .env          # fill in a provider key and a JWT secret
uv run uvicorn src.main:app --reload
# API at http://localhost:8000, docs at http://localhost:8000/docs
```

The default configuration uses SQLite + FAISS and an inline job runner, so the API runs with
no external services. Run the tests with `uv run pytest`.

### Frontend workspaces

```bash
pnpm install
pnpm -r build                 # build widget, SDK, and dashboard
pnpm -r test
```

Build just the widget and open its isolation demo:

```bash
pnpm --filter @proprai/widget build
# open apps/widget/demo.html in a browser
```

### Full stack with Docker

```bash
docker compose -f docker/docker-compose.yml up --build
# api :8000, dashboard :3000, postgres :5432, redis :6379, minio :9000
```

Postgres + pgvector, Redis, and MinIO come up as services; the API switches to the Postgres
backend automatically. Add `--profile ollama` to run a local model alongside.

## Configuration

Backend settings live in `apps/api/.env` (never committed). The minimum working setup for
live answers:

```bash
ENVIRONMENT=development
JWT_SECRET=                       # openssl rand -hex 32
DATABASE_URL=sqlite+aiosqlite:///./data/proprai.sqlite
SEARCH_BACKEND=sqlite_faiss       # or postgres
QUEUE_ENABLED=true                # false runs jobs inline (no Redis)
ANTHROPIC_API_KEY=                # or OPENAI_API_KEY, or run Ollama
DEFAULT_CHAT_PROVIDER=anthropic
DEFAULT_EMBEDDING_PROVIDER=openai
```

Everything else is optional and safely skipped when unset — object storage (MinIO / S3),
Redis, the reranker model, Sentry, and per-project overrides. In production the app refuses
to start with a weak `JWT_SECRET` or a wildcard CORS origin.

## Usage

1. Sign up (`POST /auth/signup`) — this creates your organization.
2. Create a project, optionally from a persona template (`POST /v1/projects`).
3. Add content — upload a file or add a crawl / sitemap / Notion / Google Docs source.
4. Create a `publishable` key and embed the widget, or a `secret` key for server-side calls.
5. Ask questions over `POST /v1/chat` and read the retrieval trace for any answer.

Embed the widget on any site:

```html
<script src="https://cdn.proprai.chat/widget.js"
        data-key="pub_xxx" data-project="proj_xxx"></script>
```

Call the API from TypeScript with the SDK:

```ts
import { ProprAI } from "@proprai/sdk-js";

const client = new ProprAI({ apiKey: "sk_xxx", projectId: "proj_xxx" });
for await (const event of client.chat.stream({ message: "退貨政策是什麼？" })) {
  if (event.type === "token") process.stdout.write(event.text);
}
```

## API reference

All endpoints are browsable at `/docs` (Swagger UI) and `/redoc`. Owner endpoints take a
bearer JWT; runtime endpoints take an `X-API-Key`. Streaming endpoints return Server-Sent
Events (`event: <name>\ndata: {json}\n\n`).

### Auth (`/auth`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/signup` | Create an account and organization, returns tokens |
| POST | `/auth/login` | Sign in, returns access and refresh tokens |
| POST | `/auth/refresh` | Exchange a refresh token for a new access token |
| GET | `/auth/me` | Current user profile |

### Projects, keys, and templates (`/v1`)

| Method | Path | Description |
| --- | --- | --- |
| GET/POST | `/v1/projects` | List or create projects (optional persona `template`) |
| GET/PATCH/DELETE | `/v1/projects/{id}` | Read, update, or delete a project |
| GET/PUT | `/v1/projects/{id}/widget-config` | Read or update widget appearance |
| GET | `/v1/project-templates` | List persona templates |
| POST/GET | `/v1/projects/{id}/api-keys` | Create (raw key shown once) or list keys |
| PATCH/DELETE | `/v1/api-keys/{id}` | Update or revoke a key |

### Content (`/v1`)

| Method | Path | Description |
| --- | --- | --- |
| POST/GET | `/v1/projects/{id}/sources` | Add or list ingestion sources |
| GET/DELETE | `/v1/sources/{id}` | Read or delete a source |
| POST | `/v1/sources/{id}/reindex` | Re-run a source |
| POST | `/v1/projects/{id}/documents/upload` | Upload a file (multipart) |
| POST | `/v1/projects/{id}/reindex` | Re-embed the whole project |
| GET | `/v1/projects/{id}/documents` | List documents (status, stale, tags) |
| GET/DELETE | `/v1/documents/{id}` | Read a document with chunks, or delete it |
| POST | `/v1/documents/{id}/verify` | Clear a document's stale status |
| PUT | `/v1/documents/{id}/tags` | Set a document's tags |
| GET/POST | `/v1/projects/{id}/tags` | List or create tags |
| PATCH/DELETE | `/v1/tags/{id}` | Rename or delete a tag |

### Chat, conversations, and trace (`/v1`)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/v1/chat` | **SSE** streamed answer; events `conversation`, `token`, `citations`, `trace`, `done` |
| GET | `/v1/conversations` | List and search conversations |
| GET/DELETE | `/v1/conversations/{id}` | Read a transcript or delete it |
| GET | `/v1/conversations/export` | Export conversations as CSV |
| POST | `/v1/messages/{id}/feedback` | Thumbs up/down (publishable key) |
| GET | `/v1/messages/{id}/trace` | Full retrieval trace (secret key or owner) |

### Knowledge, analytics, and webhooks (`/v1`)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/v1/projects/{id}/knowledge-gaps` | Ranked unanswered questions |
| POST | `/v1/knowledge-gaps/{id}/draft-answer` | Draft an answer with the model |
| POST | `/v1/knowledge-gaps/{id}/approve` | Approve an answer into the knowledge base |
| DELETE | `/v1/knowledge-gaps/{id}` | Dismiss a gap |
| GET | `/v1/projects/{id}/analytics` | Volume, refusal, satisfaction, cache, token metrics |
| GET/POST | `/v1/projects/{id}/webhooks` | List or create webhooks (secret shown once) |
| PATCH/DELETE | `/v1/webhooks/{id}` | Update or delete a webhook |
| POST | `/v1/webhooks/{id}/test` | Send a test delivery |
| GET | `/v1/webhooks/{id}/deliveries` | List recent deliveries |

## Database schema

One set of models runs on both backends (SQLite + FAISS locally, Postgres + pgvector in
deployment) behind the store interface. Every content and conversation row is scoped by
`project_id`.

```
users                organizations         projects
  id                   id                    id
  email (unique)       name                  org_id (FK)
  password_hash        owner_user_id (FK)     name / template / system_prompt
  display_name                                chat_provider / chat_model
  locale                                      embedding_provider / embedding_model
                                              default_locale / widget_config (json)
api_keys                                      confidence_threshold / staleness_days
  id
  project_id (FK)     ingestion_sources     documents
  type                  id                    id
  key_hash / prefix     project_id (FK)       project_id (FK) / source_id (FK)
  allowed_origins       type                  title / url / storage_key / content_hash
  rate_limit            config (json)         status / error / last_verified_at
  revoked_at            schedule / status
                        last_run_at           document_chunks
tags                                            id
  id                  document_tags             document_id (FK) / project_id
  project_id (FK)       document_id (FK)         ordinal / content
  name (unique/proj)    tag_id (FK)              contextual_content / trust_score
                                                 embedding (vector) / metadata (json)
conversations         messages              flagged_questions
  id                    id                    id
  project_id (FK)       conversation_id (FK)  project_id (FK)
  channel / visitor_id  role / content        question_text / normalized_text
  is_sandbox            citations (json)      occurrence_count / draft_answer
  locale                confidence_score      status
  started_at            retrieval_trace (json)
                        feedback              semantic_cache
webhook_endpoints       prompt/completion_tokens  id
  id                                              project_id (FK)
  project_id (FK)     webhook_deliveries          question / answer
  url / secret          id                        citations (json) / hit_count
  subscribed_events     endpoint_id (FK)
  active                event / payload (json)
                        status_code / attempts / error
```

## Security

Designed against the OWASP LLM Top 10 items relevant to a retrieval chatbot:

- **Prompt injection (LLM01)** — the system prompt and retrieved context are structurally
  separated from user input; retrieved chunks are wrapped as untrusted reference data so they
  cannot override instructions, and the model is told never to reveal its system prompt.
- **Insecure output handling (LLM02)** — the widget renders answers by building DOM nodes,
  never `innerHTML`, and strips `javascript:` / `data:` URLs, so a hostile document cannot run
  script on a host page.
- **Sensitive information disclosure (LLM06)** — every query is scoped by `project_id`, so
  retrieval and history never cross tenants; `secret` keys are server-side only and never
  returned after creation.
- **Model denial of service (LLM04)** — all keys are rate-limited, with stricter limits on
  publishable and sandbox keys; low-confidence questions are refused before the model is
  called.

Production startup refuses a weak `JWT_SECRET` or wildcard CORS, and responses carry standard
security headers.

## Testing

The backend suite is fully offline and deterministic: fakes stand in for the search backend,
embeddings, and the chat model, so no keys, network, or Redis are needed. The Postgres store
tests skip cleanly unless `TEST_DATABASE_URL` is set. The widget suite covers SSE frame
parsing and the Markdown renderer's XSS defenses.

```bash
cd apps/api && uv run pytest          # 99 passing (Postgres store tests skip locally)
pnpm --filter @proprai/widget test    # SSE parsing + Markdown safety
```

CI runs the API suite against a pgvector service container and builds and tests the
workspace packages.

## Contributing

1. Fork and create a feature branch: `git checkout -b feat/your-change`
2. Make changes with tests (offline fakes; see `apps/api/tests` for patterns)
3. Run the checks locally:
   ```bash
   cd apps/api && uv run ruff check . && uv run pytest -q
   pnpm -r build && pnpm -r test
   ```
4. Commit with a Conventional Commits message (`feat(scope): ...`)
5. Open a pull request; CI must pass

## License

MIT — see [LICENSE](LICENSE).
