# Contributing to EmbAId Agent

EmbAId Agent is an open-source, self-hostable website assistant. Read the
[README](README.md) for the product and architecture, then use this guide for the development
workflow. Internal collaborators can branch in this repository; external contributors should fork it.

## Your first contribution

1. Read an existing Issue, or open one describing the problem and the intended outcome. Agree on
   API, data-model, provider, or retrieval changes before implementing them.
2. Claim a focused task in the Issue. Name the affected module and coordinate with anyone editing
   the same interfaces. A small end-to-end change is easier to review than a broad cleanup.
3. Follow [Getting started](README.md#getting-started), then run the checks below. You do not need
   a paid model account to run the unit tests.
4. Open a Draft PR early, link the Issue, and request a reviewer from the affected area.
5. Address review feedback and make the PR ready once its checks and explanation are complete.

## Repository map

| Area | Location | Main responsibility |
| --- | --- | --- |
| API | `apps/api` | Authentication, projects, ingestion, retrieval, providers and persistence |
| Dashboard | `apps/dashboard` | Administration, knowledge management, configuration and traces |
| Widget | `apps/widget` | Embeddable visitor interface and streaming client |
| SDK | `packages/sdk-js` | Public JavaScript and TypeScript client |
| Landing | `apps/landing` | Product website and demo entry point |
| Operations | `docker`, `.github/workflows` | Deployment images, service configuration and CI |

Public guidance belongs at the repository root or in `.github/`. The local `docs/` folder is
ignored and is not delivered to someone who clones the repository. Keep private notes, recordings,
experiments and credentials out of tracked files.

## Development environment

Use Python 3.13, Node.js 20 or newer, and the pnpm version pinned in `package.json`.
`.nvmrc` selects the Node version used in CI. Install from the committed lockfiles:

```sh
nvm install
nvm use
corepack enable
pnpm install --frozen-lockfile
cd apps/api
uv sync --frozen --extra dev
```

Model setup and the local services are described in the README. Build the widget before testing
the API's `/widget.js` endpoint. Keep `.env` files local; update `.env.example` when introducing
configuration, without including working keys or personal endpoints.

## Branches and commits

Start from an updated `main` and create one branch per Issue:

```sh
git switch main
git pull --ff-only
git switch -c feat/123-document-sync
```

Use `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `ci/`, or `chore/` with a short descriptive
suffix. An Issue number is useful when one exists. Do not push directly to `main`, rewrite shared
history, or mix unrelated formatting changes into a functional PR. Rebase only a branch you own;
coordinate before rewriting a branch someone else uses.

Write commit messages in English using Conventional Commits:

```text
feat(ingestion): add source synchronization status
fix(widget): preserve partial stream frames
docs: explain local model configuration
```

Format: `type(scope): imperative description`; scope is optional. Types are `feat`, `fix`,
`refactor`, `docs`, `test`, `ci`, `build`, `perf`, `style`, `chore`, and `revert`. Useful scopes
include `api`, `auth`, `ingestion`, `rag`, `search`, `providers`, `dashboard`, `widget`, `sdk`,
`landing`, and `docker`. Use `!` and a `BREAKING CHANGE:` footer for incompatible public changes,
and explain migration steps in the PR. Preserve meaningful development commits; do not rewrite
history merely to make the implementation look different.

## Pull requests and review

Write PR titles and descriptions in English so contributors can review work across teams.
Use a concise title describing the change. The template follows the structure used by Apache Spark:
proposed changes, motivation, user impact and compatibility, testing, and generative AI disclosure.
Link the Issue or design discussion, explain observable behavior and migration requirements, and
report actual checks and any checks you could not run. Include screenshots for visible interface
changes and an API example when a public contract changes. Disclose generative AI assistance in
the designated section, including the tool version when known, and explain how its output was checked.

Normal changes need at least one approval from someone other than the author. Authentication,
tenant isolation, deletion, schema, or credential changes also need a reviewer familiar with that
boundary. A maintainer performs the merge after discussion is resolved and CI succeeds. Drafts
are for discussion and must not be merged. See [MAINTAINERS.md](MAINTAINERS.md) for ownership,
merge choices, and repository settings that enforce this workflow.

## Checks before review

Run web commands from the repository root:

```sh
pnpm -r build
node apps/landing/build.mjs
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

Run Python commands from `apps/api`:

```sh
uv run --frozen ruff check .
uv run --frozen pytest -q
```

The API suite isolates application settings from developer `.env` files and exported model
credentials, and uses an in-memory application database. Tests may load an explicit temporary
configuration file when configuration loading is what they exercise. Unit tests use fake model
providers; passing them does not establish live-model quality or production readiness.

PostgreSQL integration cases require `TEST_DATABASE_URL` pointing to a disposable database with
pgvector. They delete their own test records and must never point at a production database.
Optional Qdrant and Bedrock tests need their corresponding extras:

```sh
uv sync --frozen --extra dev --extra qdrant --extra bedrock
TEST_DATABASE_URL=postgresql+asyncpg://embaid:embaid@localhost:5432/embaid uv run pytest -q
```

CI provisions PostgreSQL and installs these extras. Missing extras or an unset integration URL
can skip cases locally; include that limitation in the PR results. Provider, crawler, and model
changes may also need a separate live smoke test with your own authorized services. Do not add a
paid or network-dependent test to the default suite without discussing its execution conditions.

The landing page has a standalone build script and is not part of the pnpm workspace list. Its
build command above runs from the repository root and also builds the widget bundle it embeds.

## Implementation standards

- Follow existing module boundaries and type conventions. Keep provider-specific work in provider
  adapters and search-specific work behind the search interface.
- Add regression coverage for behavior changes, especially permissions, streaming, ingestion
  lifecycle and retrieval decisions. Documentation-only changes do not need artificial tests.
- Preserve public API fields, SSE events, SDK exports, widget attributes and localization keys
  unless the PR explicitly documents a compatibility change.
- Describe why a non-obvious constraint exists in comments. Remove stale planning references,
  commented-out experiments and narration that merely repeats the code. Keep useful security,
  compatibility, and algorithm explanations.
- Keep English and Traditional Chinese README instructions aligned. Add visible UI strings to both
  locale catalogs. Distinguish implemented behavior, simulated demos and planned capabilities.
- Commit lockfile changes with dependency changes. Do not commit generated builds, local data,
  virtual environments, recordings, keys, tokens or customer/student documents.

Tools may assist development, including AI tools. The contributor remains responsible for
understanding the change, checking licensing and dependencies, and reporting real verification.
Preserve attribution and required notices; do not fabricate authorship, tests, benchmarks, or
review approvals. Keep confidential material out of tools that are not authorized to receive it.

Report security issues through [SECURITY.md](SECURITY.md). Participation follows the
[Code of Conduct](CODE_OF_CONDUCT.md).
