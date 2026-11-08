# StockWise — notes for AI coding assistants

Final-year software-engineering project by two developers: a multi-tenant inventory SaaS for SMEs in Burundi. Read `docs/` before designing anything. The design is settled there; propose changes rather than drifting from it silently.

## Commands

- `pnpm install` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` (needs Postgres: `pnpm db:up`) · `pnpm build`
- After editing `apps/api/prisma/schema.prisma`: `pnpm db:migrate` (creates + applies a migration), and commit the migration folder.
- `@stockwise/shared` must be built (`pnpm --filter @stockwise/shared build`) before the API/web typecheck; `pnpm dev` does this.

## Non-negotiable rules (docs/01-architecture.md)

1. **Stock changes only through the stock engine** (`InventoryService.applyMovements`, Phase 3) inside a Prisma transaction with `SELECT … FOR UPDATE` row locks. Never write `StockLevel` or `StockMovement` anywhere else. There is no `Product.quantity` column.
2. **`stock_movements` and `audit_logs` are append-only** (DB triggers). Corrections are reversing movements.
3. **Tenant isolation:** `businessId` comes from the authenticated context, never from the request body or query. Every query on business data filters by `businessId`. Use `findFirst({ where: { id, businessId } })`, not `findUnique({ where: { id } })`. Another tenant's IDs return 404.
4. **Decimals:** quantities and money are Prisma `Decimal`, serialised as strings in JSON. Never do arithmetic with JS `number`.
5. **Errors:** throw `AppException(code, status, message, details)` with a code from `@stockwise/shared` `ERROR_CODES`. The UI translates by code. No user-facing sentences from the API.
6. **Validation:** Zod schemas, preferably in `packages/shared` so web and API share them, applied with `ZodValidationPipe`.
7. **Permissions:** enforced on the server with permission keys from `packages/shared/src/permissions.ts`. Frontend checks are only for UX.
8. **i18n:** every UI string goes in `apps/web/src/locales/{fr,en}`. Format money, quantities and dates only through `apps/web/src/lib/format.ts`.
9. **No fake data or hard-coded statistics** in the UI. Empty states instead.
10. A feature isn't done until it has tests (unit tests for rules, Supertest for endpoints, plus a tenant-isolation check).

## Stack notes

- NestJS **11** (CommonJS) is deliberate. NestJS 12 is ESM-only and conflicts with Jest. TypeScript is pinned to 5.9.
- Prisma **7**: the connection URL is in `apps/api/prisma.config.ts`, the client is generated to `apps/api/src/generated/prisma` (gitignored), and it's used with `@prisma/adapter-pg`. Import from `../generated/prisma/client`.
- Partial unique indexes and trigram indexes live in `schema.prisma` (preview features `partialIndexes`, `postgresqlExtensions`). Triggers and CHECK constraints live in `apps/api/prisma/sql/integrity_guards.sql`, applied as their own migration.
- Password hashing: `@node-rs/argon2` (prebuilt binaries, no native compile).
