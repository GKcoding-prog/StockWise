# StockWise

**Smart Inventory Management and Decision Support System** for small and medium businesses, starting in Burundi.

> Know what you have. Know what you are losing. Know what you need to purchase.

StockWise centralises products, purchases, sales and every stock movement, then turns that history into explainable restocking recommendations, low-stock alerts and anomaly detection.

## Status

Phase 1 (foundation). The monorepo, database schema, demo data, CI and app shells are in place. Feature modules arrive phase by phase. See [docs/07-backlog.md](docs/07-backlog.md).

## Tech stack

| Layer    | Technology                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, react-i18next (FR/EN) |
| Backend  | NestJS 11 (modular monolith), TypeScript, Prisma 7, Zod, Swagger/OpenAPI                        |
| Database | PostgreSQL 16                                                                                   |
| Shared   | `@stockwise/shared`: permission keys, error codes, Zod schemas used by both sides               |
| Testing  | Jest + Supertest (API), Vitest + React Testing Library (web), Playwright (E2E, later)           |
| Tooling  | pnpm workspaces, ESLint, Prettier, GitHub Actions, Docker Compose                               |

## Prerequisites

- **Node.js 22.12+** (`nvm install 22` — the repo has an `.nvmrc`)
- **pnpm 10**: `corepack enable` (ships with Node), then `pnpm -v`
- **Docker** (Docker Desktop with WSL integration on Windows, or Docker Engine on Linux)

> **Windows/WSL tip:** clone the repo inside the Linux filesystem (e.g. `~/code/stockwise`), not under `/mnt/c/...`. File watching and installs are many times faster there.

## First-time setup

```bash
git clone https://github.com/GKcoding-prog/StockWise.git stockwise
cd stockwise
pnpm install                         # also generates the Prisma client
cp apps/api/.env.example apps/api/.env
pnpm db:up                           # starts PostgreSQL + Mailpit in Docker
```

**Database, first developer only (once):** creates the initial migration, adds the integrity-guards migration and seeds demo data. Commit the resulting `apps/api/prisma/migrations/` folder.

```bash
pnpm db:init
git add apps/api/prisma/migrations && git commit -m "chore(db): initial migrations"
```

**Every other developer (after pulling the migrations):**

```bash
pnpm db:migrate                      # applies migrations
pnpm db:seed                         # permissions, roles + demo shop
```

Then start everything:

```bash
pnpm dev
```

| What                             | URL                            |
| -------------------------------- | ------------------------------ |
| Web app                          | http://localhost:5173          |
| API                              | http://localhost:3000/api/v1   |
| API docs (Swagger)               | http://localhost:3000/api/docs |
| Emails sent by the app (Mailpit) | http://localhost:8025          |
| Database browser (Prisma Studio) | `pnpm db:studio`               |

**Demo logins** (development seed only, password `Demo1234!`). Login screens arrive in Phase 2.

| Role     | Email                      |
| -------- | -------------------------- |
| Owner    | owner@demo.stockwise.bi    |
| Manager  | manager@demo.stockwise.bi  |
| Employee | employee@demo.stockwise.bi |

The demo shop "Alimentation Kira" has 16 products with opening stock. One is out of stock and two are below their minimum, so alerts have something to show. Prices are illustrative.

## Everyday commands

| Command                     | Does                                                   |
| --------------------------- | ------------------------------------------------------ |
| `pnpm dev`                  | API + web + shared package in watch mode               |
| `pnpm test`                 | Unit tests (all packages)                              |
| `pnpm test:e2e`             | API tests against PostgreSQL (needs `pnpm db:up`)      |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                      |
| `pnpm typecheck`            | TypeScript across the repo                             |
| `pnpm build`                | Production builds                                      |
| `pnpm db:migrate`           | Create/apply a migration after editing `schema.prisma` |
| `pnpm db:reset`             | Drop, re-migrate and re-seed the local database        |

## Repository layout

```
apps/
  api/        NestJS API — prisma/ (schema, migrations, seed, sql), src/, test/
  web/        React app — src/app (shell, routes), src/features, src/lib, src/locales
packages/
  shared/     Code shared by API and web (permissions, error codes, Zod schemas)
docs/         Design: architecture, data model, roles, algorithms, API, screens, backlog
```

## How we work

- Branch from `main` (`feat/products-crud`, `fix/sale-totals`), open a pull request, and have it reviewed by the other developer. CI must be green before merging.
- **Definition of done:** validated on the server, permission-checked, scoped to the business, tested, translated FR/EN, and with loading/empty/error states. See [docs/07-backlog.md §1](docs/07-backlog.md).
- Commit messages: `feat(sales): ...`, `fix(inventory): ...`, `docs: ...`, `chore: ...`.

## Design documents

|                                                                |                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| [01 Architecture](docs/01-architecture.md)                     | Modules, tenancy, stock engine, security, deployment |
| [02 Data model](docs/02-data-model.md)                         | ERD, invariants, units                               |
| [03 Roles & use cases](docs/03-roles-and-use-cases.md)         | Permission matrix, use cases                         |
| [04 Inventory intelligence](docs/04-inventory-intelligence.md) | Reorder point, velocity, anomalies, valuation        |
| [05 API spec](docs/05-api-spec.md)                             | Endpoints and error codes                            |
| [06 Frontend](docs/06-frontend.md)                             | Navigation and screens                               |
| [07 Backlog](docs/07-backlog.md)                               | Phases and who builds what                           |

## Troubleshooting

- **`pnpm dev` says the API can't reach the database:** run `pnpm db:up` and check `docker ps` shows `stockwise-postgres` as healthy.
- **Port 5432 already in use:** a local PostgreSQL is running. Stop it, or change the port mapping in `docker-compose.yml` and `DATABASE_URL`.
- **Types for the database are missing in the editor:** run `pnpm --filter @stockwise/api db:generate`.
