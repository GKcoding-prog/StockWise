# StockWise — 07. Phased implementation backlog

Version 0.1 · Phase 1 design

## 1. How to work

- **Team split by ownership, not by layer.** Each developer owns modules end-to-end (API + UI + tests). That avoids waiting on each other, and lets each of you defend your own part in front of the jury.
  - **Dev A — "Ledger & access":** repo/CI setup, Auth & tenancy, Users/invitations, **Inventory stock engine**, Purchases, Alerts/notifications, deployment.
  - **Dev B — "Catalogue & insight":** UI shell & design system, Products/Categories/Suppliers, **Sales/POS**, Dashboard, Analytics algorithms, Reports, i18n.
  - Shared: data model, code review of each other's PRs (every PR reviewed by the other dev), Playwright flows.
- **Rhythm:** 1-week iterations. Monday: pick stories. Friday: demo to each other on realistic seed data and merge to `main`. `main` is always runnable (brief §12).
- **Definition of Done (every story):** server-side validation · permission check · tenant-scoped · tests passing in CI (unit for rules, API test for endpoints) · FR + EN strings · loading/empty/error states · Swagger annotated · no hard-coded data.
- **Estimates** are in weeks for the two of you working part-time alongside courses. **Replace them with your real deadline** (see §5).

## 2. Phases

### Phase 1 — Requirements, design, prototypes (≈ 2 weeks)

| ID | Story | Owner | Done when |
|---|---|---|---|
| P1-1 | Review and approve design docs 01–07 with supervisor | Both | Feedback incorporated |
| P1-2 | Interview 2–3 shop owners (stock habits, pain points, sell-by-weight?, expiry?, phones vs PCs, payment methods, willingness to pay) | Both | Notes in `docs/research/` |
| P1-3 | Low-fi prototypes of 5 key screens (06 §5), tested with one shopkeeper | B | Prototype link + findings |
| P1-4 | Monorepo scaffold: pnpm workspaces, api (NestJS), web (Vite), shared, ESLint/Prettier, Docker Compose (Postgres + Mailpit), GitHub Actions (lint, typecheck, test) | A | `pnpm dev` runs both apps; CI green |
| P1-5 | Prisma schema + first migration + integrity SQL + idempotent seed (permissions, roles, demo business with realistic Burundian retail data) | A | `pnpm db:reset` works |

### Phase 2 — Auth, business registration, permissions, products (≈ 3 weeks)

| ID | Story | Owner |
|---|---|---|
| P2-1 | Register business (User + Business + default Warehouse + Owner in one tx) | A |
| P2-2 | Login, refresh rotation with reuse detection, logout, `/me` with permissions | A |
| P2-3 | Tenant context, TenantGuard, PermissionsGuard, Prisma "missing businessId" guard-rail | A |
| P2-4 | **Tenant isolation test suite** (grows with every new endpoint) | A |
| P2-5 | Password reset by email (Mailpit in dev) | A |
| P2-6 | Invitations + accept flow; members list; role change/suspend with last-owner rule | A |
| P2-7 | Audit log service (writes in same tx) + throttling on auth | A |
| P2-8 | App shell: layout, sidebar/bottom bar, routing, ProtectedRoute, `<Can>`, i18n setup FR/EN, `Money`/`DateTime` formatters | B |
| P2-9 | Auth screens (login, register, forgot/reset, accept invite, select business) | B |
| P2-10 | Categories CRUD/archive (API + UI) | B |
| P2-11 | Products CRUD/archive/search/filter (API + UI), SKU/barcode uniqueness, cost fields hidden by permission | B |
| P2-12 | Business settings page | B |

**Phase 2 demo:** an owner registers, invites an employee, both log in, the owner creates products, and the employee can see but not edit them or see costs.

### Phase 3 — Suppliers, purchases, sales, stock movement engine (≈ 5 weeks) — *the core*

| ID | Story | Owner |
|---|---|---|
| P3-1 | **Stock engine** `applyMovements` (locking, WAC, negative-stock rule, events after commit) + unit tests for WAC | A |
| P3-2 | **Concurrency test** (20 parallel sales on 10 units) + reconciliation query/test | A |
| P3-3 | Opening balance on product creation | A |
| P3-4 | Document references (`DocumentSequence`) | A |
| P3-5 | Suppliers CRUD + detail page | B |
| P3-6 | Purchases: create/edit draft, order, cancel, status machine (API + UI) | A |
| P3-7 | **Receive goods** (partial/full, idempotent) → stock ↑ (API + UI dialog) | A |
| P3-8 | Supplier returns | A |
| P3-9 | **New sale (POS)**: search/scan, cart, discount rules, payment, idempotent complete → stock ↓ | B |
| P3-10 | Receipt (print 80 mm / A4) | B |
| P3-11 | Sales history + detail; Employee sees own only | B |
| P3-12 | Void sale & customer returns (Manager+) | B |
| P3-13 | Adjustments, write-offs, stock count (API + UI) | A |
| P3-14 | Product movement history tab + global movements page | B |
| P3-15 | Playwright flow #1: product → purchase → receive → sell → check ledger | Both |

**Phase 3 demo:** the full stock cycle on seed data. Every number on screen can be traced to ledger rows. *This phase is the minimum for a credible pilot. Protect it.*

### Phase 4 — Dashboard, analytics, reporting (≈ 3 weeks)

| ID | Story | Owner |
|---|---|---|
| P4-1 | Sales velocity + valuation (current and `asOf`) services with unit tests (04 §2, §9) | B |
| P4-2 | Dashboard API (role-shaped) + UI with KPI cards and charts | B |
| P4-3 | Nightly `InventorySnapshot` job + inventory trend chart | A |
| P4-4 | Top products, sales trend endpoints | B |
| P4-5 | Reports framework: CSV streaming + pdfmake layout (header, filters, footer, locale) | B |
| P4-6 | Reports: inventory summary, product movements, sales performance, purchase history, stock valuation, user activity | B (A: user activity) |

### Phase 5 — Reorder recommendations, alerts, anomaly detection (≈ 3 weeks)

| ID | Story | Owner |
|---|---|---|
| P5-1 | Alerts engine: low/out-of-stock on `stock.changed`, dedupe, auto-resolve, notifications fan-out | A |
| P5-2 | Bell + alerts page; overdue purchases nightly job | A |
| P5-3 | Reorder point / quantity / confidence (04 §3–5) with **worked-example unit test** (04 §6) | B |
| P5-4 | Reorder page with "Why?" explanations (FR/EN templates) + "Create purchase orders" | B |
| P5-5 | Slow-moving / dead stock (04 §7) + page + report | B |
| P5-6 | Anomaly rules R1–R5 (04 §8) with unit tests; flagged adjustments review page | A |
| P5-7 | Low-stock report | B |
| P5-8 | *(Stretch)* Batch/expiry tracking + EXPIRY_APPROACHING | A |
| P5-9 | *(Stretch)* Statistical safety stock (Z·σ·√L) | B |

### Phase 6 — Testing, security review, deployment, pilot (≈ 3 weeks + pilot period)

| ID | Story | Owner |
|---|---|---|
| P6-1 | Security review against 01 §13 checklist; `npm audit`; headers check; rate-limit check | Both |
| P6-2 | Playwright flows #2–4: registration & invite, reorder → purchase → receive, reports download | Both |
| P6-3 | Production compose, Nginx + TLS, VPS provisioning, env secrets | A |
| P6-4 | Backups + **restore drill** documented | A |
| P6-5 | Product CSV import (onboarding the pilot shop quickly) | B |
| P6-6 | Mobile pass on real low-end Android phones; French copy review | B |
| P6-7 | Pilot onboarding: import products, train staff (1 h), feedback form, weekly check-in | Both |
| P6-8 | Fix list from pilot; measure: time to record a sale, stock accuracy vs physical count after 2–4 weeks | Both |

## 3. MVP cut line

If time runs short, cut from the **bottom** of this list, never from the top.

| Must have for the pilot (brief §13) | Should have | Later |
|---|---|---|
| Register, roles, invites | Product CSV import | Multi-location & transfers |
| Products, categories, suppliers | Stock count screen | Batch / expiry tracking |
| Purchases with receiving | Supplier returns | Email/SMS alert delivery |
| POS sales, void, returns | Slow-moving page | Custom roles |
| Stock engine + movement history | Anomaly rules R4–R5 | Statistical safety stock |
| Adjustments & write-offs | PDF for every report (CSV for all) | Subscription billing |
| Low/out-of-stock alerts | Inventory trend chart | Offline mode |
| Reorder recommendations with explanations | | |
| Dashboard (real data) | | |
| CSV + PDF for 3 core reports | | |
| Anomaly rules R1–R3 | | |
| Deployment, HTTPS, backups | | |

## 4. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Scope too large for two students in one academic year | Unfinished core | Protect Phase 3; use the cut line; demo every Friday |
| Stock bugs erode trust in the pilot | Pilot fails | Ledger + reconciliation + concurrency tests from day one |
| Cross-tenant data leak | Serious, reputational | Isolation suite in CI for every endpoint |
| No pilot business found late | Can't meet success definition | Recruit the pilot shop during Phase 1 interviews |
| Slow/unstable internet at the shop | Double sales, frustration | Idempotency keys, small JS bundle, retry UX |
| Dev laptop limits (8 GB) | Slow dev loop | Only Postgres + Mailpit in Docker; apps run natively |
| Prisma `Decimal` mistakes (JS `number` maths) | Wrong money/stock values | Lint rule / code review checklist; unit tests with fractional values |

## 5. Open questions (answer before Phase 2)

1. **What is the final submission / defence date?** The phase estimates above assume ~19 weeks plus the pilot.
2. Does your supervisor expect the mémoire in French or English, and do they need specific UML diagrams (use case, sequence, class)? These docs can be converted.
3. Do you already have a pilot shop in mind? What does it sell? (Sell-by-weight and expiry tracking depend on this.)
4. Which mobile-money services do pilot customers use (for payment-method labels)?
5. Will the pilot run on a paid VPS, and who pays? A small VPS is enough.
