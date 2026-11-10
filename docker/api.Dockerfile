# Build the embeddable widget so the API can serve it at /widget.js.
FROM node:26-slim AS widget
# Node 25 and later no longer bundle corepack; keep this version in step with "packageManager".
RUN npm install --global pnpm@10.33.0
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/widget/package.json apps/widget/
RUN pnpm install --frozen-lockfile --filter @embaid/widget
COPY apps/widget apps/widget
RUN pnpm --filter @embaid/widget build

FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Pinned so a new uv release cannot change how the image resolves or installs.
COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /usr/local/bin/uv

# The API and the worker run as an unprivileged user. /app/data holds the SQLite file,
# indices and uploads, and is where the compose volume is mounted.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /app/data \
    && chown -R app:app /app
ENV HOME=/app \
    UV_NO_CACHE=1

WORKDIR /app
USER app

# The lockfile is installed as is, so the image runs the versions that were tested.
COPY --chown=app:app apps/api/pyproject.toml apps/api/uv.lock ./
# Optional extras, e.g. --build-arg UV_EXTRAS="--extra bedrock --extra rerank"
ARG UV_EXTRAS=""
RUN uv sync --frozen --no-dev --no-install-project $UV_EXTRAS

COPY --chown=app:app apps/api/ ./
COPY --chown=app:app --from=widget /repo/apps/widget/dist/widget.js ./static/widget.js
# Install the project itself now, so containers start without re-syncing dependencies.
RUN uv sync --frozen --no-dev $UV_EXTRAS

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
