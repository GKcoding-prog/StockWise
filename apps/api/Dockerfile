# StockWise API image for running the whole app locally with Docker (`pnpm app:up`).
# Build context is the repository root:  docker build -f apps/api/Dockerfile .
#
# The image keeps dev dependencies on purpose: the container runs `prisma migrate deploy` and the
# demo seed (tsx) at startup, like the Render deploy does. It's a local image, not a slim one.
FROM node:22-bookworm-slim

# OpenSSL for Prisma's migration engine; CA certificates for HTTPS (SMTP, npm).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Same pnpm as package.json "packageManager" (and render.yaml).
RUN npm install -g pnpm@10.34.9

WORKDIR /app

# 1) Dependencies, cached until a manifest, the lockfile or the Prisma schema changes.
#    `postinstall` runs `prisma generate`, so the schema, its config and the tsconfig must be
#    here already: Prisma reads tsconfig.json to choose the import style of the client it writes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/tsconfig.json apps/api/
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter @stockwise/api...

# 2) Sources and build. The client is regenerated so it always matches the final sources.
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @stockwise/shared build \
  && pnpm --filter @stockwise/api exec prisma generate \
  && pnpm --filter @stockwise/api build

WORKDIR /app/apps/api
EXPOSE 3000
# `sh` instead of executing the script directly: works even if Git on Windows dropped the +x bit.
CMD ["sh", "docker-entrypoint.sh"]
