FROM node:26-slim

# Node 25 and later no longer bundle corepack, so pnpm is installed directly at the version
# package.json pins in "packageManager".
RUN npm install --global pnpm@10.33.0

# Build and run as the image's unprivileged user.
RUN mkdir /repo && chown node:node /repo

USER node
WORKDIR /repo

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/dashboard/package.json apps/dashboard/
COPY --chown=node:node apps/widget/package.json apps/widget/
COPY --chown=node:node packages/sdk-js/package.json packages/sdk-js/
RUN pnpm install --frozen-lockfile --filter "@embaid/dashboard..."

COPY --chown=node:node apps/dashboard apps/dashboard
COPY --chown=node:node apps/widget apps/widget

# NEXT_PUBLIC_* values are compiled into the browser bundle, so they are build arguments.
# Set NEXT_PUBLIC_API_URL to the API's public URL when deploying beyond localhost.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WIDGET_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WIDGET_URL=$NEXT_PUBLIC_WIDGET_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @embaid/dashboard build

EXPOSE 3000

CMD ["pnpm", "--filter", "@embaid/dashboard", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
