# Build the embeddable widget so the API can serve it at /widget.js.
FROM node:20-slim AS widget
RUN corepack enable
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

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY apps/api/pyproject.toml ./
# Optional extras, e.g. --build-arg UV_EXTRAS="--extra bedrock --extra rerank"
ARG UV_EXTRAS=""
RUN uv sync --no-dev --no-install-project $UV_EXTRAS

COPY apps/api/ ./
COPY --from=widget /repo/apps/widget/dist/widget.js ./static/widget.js
# Install the project itself now, so containers start without re-syncing dependencies.
RUN uv sync --no-dev $UV_EXTRAS

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
