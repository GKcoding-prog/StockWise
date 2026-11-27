# StockWise web image for running the whole app locally with Docker (`pnpm app:up`).
# Build context is the repository root:  docker build -f apps/web/Dockerfile .
#
# Nginx serves the React build and forwards /api to the API container, the same way Netlify
# forwards it to Render: the browser sees one origin, so the SameSite=Strict refresh cookie works.

# ── Build ────────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @stockwise/web...

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @stockwise/shared build && pnpm --filter @stockwise/web build

# ── Serve ────────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
