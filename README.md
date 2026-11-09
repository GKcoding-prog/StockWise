# StockWise

Smart inventory management and decision support for SMEs in Burundi.
**Know what you have. Know what you are losing. Know what you need to purchase.**

The design is in [docs/](docs/README.md). This README covers running the code.

## Stack

pnpm monorepo: `apps/api` (NestJS 11, Prisma 7, PostgreSQL 16), `apps/web` (React 19, Vite 7, Tailwind 4, TanStack Query, react-i18next FR/EN) and `packages/shared` (Zod schemas, permission keys, error codes used by both).

## Getting started

Requirements: Node 22+, pnpm 10 (`npm i -g pnpm`), Docker.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env     # then set JWT_ACCESS_SECRET
pnpm db:up                                  # Postgres on :5433 and Mailpit (http://localhost:8025)
pnpm db:migrate                             # applies init + integrity_guards
pnpm db:seed                                # roles, permissions and the demo shop (~1 min)
pnpm dev                                    # API on :3000, web on http://localhost:5173
```

Postgres is published on **5433** so it doesn't clash with a locally installed Postgres.

Demo logins (password `Demo2026!`) for *Boutique Ubuntu*, a Bujumbura shop with 75 days of history:

| Email | Role |
|---|---|
| owner@demo.stockwise.bi | Owner |
| manager@demo.stockwise.bi | Manager |
| cashier@demo.stockwise.bi | Employee |

`SEED_DEMO=false pnpm db:seed` seeds only roles and permissions (use this in production).

## Tests

```bash
pnpm --filter @stockwise/api test     # unit + e2e against the stockwise_test database
pnpm --filter @stockwise/web test
pnpm --filter @stockwise/shared test
pnpm typecheck
```

The API e2e suites include the tenant isolation suite (`test/isolation.e2e-spec.ts`, grow it with every endpoint) and the concurrency test from docs/01 §7.4 (20 parallel stock-outs on 10 units: exactly 10 succeed). CI runs everything on each PR (`.github/workflows/ci.yml`).

## Status

**Done** (backlog IDs from docs/07):

- P1-4 monorepo, Docker Compose, CI · P1-5 schema (25 models), migrations, integrity guards (append-only ledger trigger, CHECKs, partial unique indexes), idempotent seed
- P2-1 registration · P2-2 login, rotating refresh tokens with reuse detection, logout, `/me` · P2-3 tenant context, guards, Prisma tenant guard-rail · P2-4 isolation suite · P2-7 audit log, auth throttling
- P2-8 app shell (sidebar / mobile bottom bar, permission-aware nav, FR/EN, money/date formatting) · P2-9 login & register screens · P2-10 categories · P2-11 products (search, filters, SKU suggestion, cost fields hidden by role) · P2-12 business settings
- P3-1 stock engine (row locks, WAC, negative-stock rule, events after commit) · P3-2 concurrency test + reconciliation · P3-3 opening balance · P3-4 document references · P3-5 suppliers · P3-13 adjustments, write-offs, stock count API · P3-14 product ledger + global movements page
- Part of P4-1: valuation now and `asOf` (`GET /analytics/valuation`), dashboard on real data

**Next**, in backlog order: P2-5 password reset (Mailpit), P2-6 invitations and members, P3-6/7/8 purchases and receiving, P3-9–12 POS sales, receipts, voids and returns, then Phases 4–5 (alerts, reorder recommendations, anomaly rules, reports).

**Known follow-ups**

- Swagger (`/api/docs`) and structured logs (`nestjs-pino`) aren't wired yet.
- The web bundle is ~190 KB gzipped; moving the shared schemas to `zod/mini` would cut it substantially.
- Stock-count UI (the API exists), and the open questions in docs/07 §5.
