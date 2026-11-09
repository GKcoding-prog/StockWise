# StockWise — Design package (Phase 1, v0.1)

Smart Inventory Management and Decision Support System for SMEs in Burundi.
**Know what you have. Know what you are losing. Know what you need to purchase.**

| # | Document | Answers |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | How is it built? Tenancy, stock engine, auth, jobs, security, testing, deployment |
| 02 | [Data model & ERD](02-data-model.md) | What is stored? Entities, invariants, units (+ `apps/api/prisma/schema.prisma`, `sql/integrity_guards.sql`) |
| 03 | [Roles & use cases](03-roles-and-use-cases.md) | Who can do what? Permission matrix, 30 use cases, mapping to pilot success criteria |
| 04 | [Inventory intelligence](04-inventory-intelligence.md) | How are recommendations computed? Formulas, defaults, worked example, anomaly rules |
| 05 | [API specification](05-api-spec.md) | Every REST endpoint with permission, error codes, examples |
| 06 | [Frontend](06-frontend.md) | Navigation, screens, UI states |
| 07 | [Backlog](07-backlog.md) | Phases, who builds what, MVP cut line, risks, open questions |

**Five ideas to keep in mind while building**
1. Stock changes only through `InventoryService.applyMovements()`, in a transaction, with row locks. The ledger is the truth.
2. `businessId` always comes from the token, never from the client. Every endpoint is covered by the isolation test suite.
3. Use `Decimal` for every quantity and amount. Never do the maths with JS `number`.
4. Every recommendation shows its numbers and its confidence. It's an estimate, not a promise.
5. A feature isn't done until it's tested, translated (FR/EN) and permission-checked.

Status: see the [root README](../README.md#status) for what is built. Migrations (`init` + `integrity_guards`) are committed under `apps/api/prisma/migrations`; `pnpm db:migrate` applies them and `pnpm db:seed` loads the demo shop.
