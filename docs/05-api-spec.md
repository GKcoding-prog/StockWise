# StockWise — 05. REST API specification

Version 0.1 · Phase 1 design · Generated docs: Swagger UI at `/api/docs` (dev and staging only)

## 1. Conventions

| Topic | Convention |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `camelCase` fields; decimals (quantities, money) as **strings** (`"12.500"`) so they don't lose precision |
| Auth | `Authorization: Bearer <accessToken>` on everything except `/auth/*` public routes and `/health` |
| Tenant | Implicit, from the token's `bid` claim. **Never** sent in body or query |
| IDs | UUID v4 |
| Dates | ISO 8601 UTC in responses (`2026-11-08T16:57:00Z`). Date-range filters `from`/`to` are business-local dates (`2026-11-01`) |
| Lists | `?page=1&pageSize=25&sort=-createdAt&q=search` → `{ data: [...], meta: { page, pageSize, total } }`; `pageSize` max 100 |
| Archiving | `POST /x/:id/archive` and `/restore`. No `DELETE` for business data |
| Idempotency | `Idempotency-Key: <uuid>` **required** on `POST /sales` and `POST /purchases/:id/receive`; optional on other creates |
| Concurrency on edits | Editable resources return `updatedAt`. `PATCH` may send `If-Unmodified-Since`-style `expectedUpdatedAt`, otherwise last write wins |
| Rate limits | 429 with `Retry-After` |

## 2. Errors

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for one or more products",
    "details": [{ "productId": "…", "available": "3.000", "requested": "5.000" }],
    "requestId": "b3f1…"
  }
}
```

`message` is an English fallback for developers. The UI translates by `code`.

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` (details = Zod issues), `FRACTIONAL_QUANTITY_NOT_ALLOWED`, `INVALID_STATE_TRANSITION` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_REUSED` |
| 403 | `FORBIDDEN` (missing permission), `PLAN_UPGRADE_REQUIRED`, `DISCOUNT_NOT_ALLOWED`, `LAST_OWNER`, `CANNOT_MODIFY_SELF` |
| 404 | `NOT_FOUND` (also for other tenants' resources) |
| 409 | `EMAIL_TAKEN`, `SKU_TAKEN`, `BARCODE_TAKEN`, `NAME_TAKEN`, `INSUFFICIENT_STOCK`, `OVER_RECEIPT`, `OVER_RETURN`, `ALREADY_VOIDED`, `HAS_RETURNS`, `IDEMPOTENCY_CONFLICT` (same key, different body) |
| 410 | `TOKEN_EXPIRED_OR_USED` (reset/invite links) |
| 429 | `RATE_LIMITED` |

## 3. Permission column

Each endpoint below lists the permission key from 03-roles §2. `auth` = any authenticated member; `public` = no token.

## 4. Endpoints

### 4.1 Auth

| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | `{fullName, email, password, businessName, currency, locale}` → tokens + user + business |
| POST | `/auth/login` | public | `{email, password}` → `{accessToken, user, memberships[]}` + refresh cookie |
| POST | `/auth/refresh` | cookie | Rotates refresh token → new `accessToken` |
| POST | `/auth/logout` | cookie | Revokes current refresh token |
| POST | `/auth/logout-all` | auth | Revokes all user sessions |
| POST | `/auth/switch-business` | auth | `{businessId}` → tokens for that membership |
| POST | `/auth/forgot-password` | public | `{email}` → always 204 |
| POST | `/auth/reset-password` | public | `{token, newPassword}` |
| GET | `/auth/invitations/:token` | public | Invitation preview (business name, role, email) |
| POST | `/auth/invitations/:token/accept` | public | `{fullName, password}` for new users, or an authenticated existing user |

### 4.2 Current user

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/me` | auth | User + active business + role + **permissions[]** + plan entitlements (drives the UI) |
| PATCH | `/me` | auth | `fullName`, `phone`, `locale` |
| POST | `/me/change-password` | auth | `{currentPassword, newPassword}`; revokes other sessions |
| GET | `/me/memberships` | auth | Businesses the user belongs to |

### 4.3 Business

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/business` | auth | Profile + settings (cost-related settings hidden without `products.view_cost`) |
| PATCH | `/business` | business.manage | Profile, currency, locale, timezone |
| PATCH | `/business/settings` | business.manage | Validated `BusinessSettings` (02 §6) |
| GET | `/business/plan` | business.plan | Current plan + entitlements |

### 4.4 Users, roles, invitations

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/members` | users.view | Members with role, status, last login |
| PATCH | `/members/:membershipId` | users.manage | `{roleId}` or `{status}`; last-owner and self rules |
| DELETE | `/members/:membershipId` | users.manage | Removes membership (user account stays) |
| GET | `/roles` | users.view | System roles + permission keys (read-only in v1) |
| GET | `/invitations` | users.view | Pending invitations |
| POST | `/invitations` | users.invite | `{email, roleId}`; Manager → Employee only |
| POST | `/invitations/:id/resend` | users.invite | New token, old one invalidated |
| POST | `/invitations/:id/revoke` | users.invite | |

### 4.5 Warehouses

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/warehouses` | auth | MVP returns the single default |
| POST / PATCH | `/warehouses`, `/warehouses/:id` | warehouses.manage | Multi-location is **Pro** plan, later |

### 4.6 Categories

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/categories` | products.view | With product counts |
| POST | `/categories` | categories.manage | `{name, parentId?}` |
| PATCH | `/categories/:id` | categories.manage | |
| POST | `/categories/:id/archive` · `/restore` | categories.manage | Archive blocked if active products → `CATEGORY_IN_USE` (409) |

### 4.7 Suppliers

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/suppliers` | suppliers.view | `q`, `archived` |
| GET | `/suppliers/:id` | suppliers.view | Details + open purchases count/value |
| POST | `/suppliers` | suppliers.manage | Includes `leadTimeDays` |
| PATCH | `/suppliers/:id` | suppliers.manage | |
| POST | `/suppliers/:id/archive` · `/restore` | suppliers.manage | |
| GET | `/suppliers/:id/products` | suppliers.view | Products with this default supplier |
| GET | `/suppliers/:id/purchases` | purchases.view | Purchase history |

### 4.8 Products

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/products` | products.view | Filters: `q` (name/SKU/barcode), `categoryId`, `supplierId`, `stockStatus=LOW|OUT|OK`, `archived`. Each row includes `quantityOnHand`, `stockStatus`; cost fields only with `products.view_cost` |
| GET | `/products/lookup?code=` | products.view | Exact SKU or barcode match, for the scanner in the sale screen |
| GET | `/products/:id` | products.view | Details + stock per warehouse + velocity (7/30/90 days) |
| POST | `/products` | products.manage | Product fields + optional `{openingQuantity, openingUnitCost}` → `OPENING_BALANCE` |
| PATCH | `/products/:id` | products.manage | **Quantity not accepted** (400 if sent) |
| POST | `/products/:id/archive` · `/restore` | products.manage | |
| GET | `/products/:id/movements` | inventory.view_movements | Product ledger, paginated, filters `type`, `from`, `to` |
| POST | `/products/:id/image` | products.manage | Multipart, ≤ 2 MB, jpeg/png/webp; stored on disk volume (S3-compatible later) |
| POST | `/products/import` | products.manage | CSV upload → `{preview, errors}` with `?dryRun=true`; commit with `dryRun=false` |
| GET | `/products/import/template` | products.manage | CSV template |

### 4.9 Inventory

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/inventory/stock` | products.view | Stock levels with status; `warehouseId`, `categoryId`, `status` |
| GET | `/inventory/movements` | inventory.view_movements | Global ledger: `productId`, `type`, `userId`, `from`, `to`, `flagged` |
| GET | `/inventory/movements/:id` | inventory.view_movements | Includes linked document + alert |
| POST | `/inventory/adjustments` | inventory.adjust | `{reason, note?, lines:[{productId, newQuantity | quantityChange}]}` → movements (one `documentRef`) |
| POST | `/inventory/write-offs` | inventory.write_off | `{reason: DAMAGED|EXPIRED|LOST|OTHER, note, lines:[{productId, quantity}]}` |
| POST | `/inventory/counts/preview` | inventory.adjust | `{lines:[{productId, countedQuantity}]}` → differences + value impact (no write) |
| POST | `/inventory/counts/commit` | inventory.adjust | Same body → adjustments |
| GET | `/inventory/reconcile` | audit.view | Runs invariant I1 check, returns mismatches (should be empty) |

### 4.10 Purchases

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/purchases` | purchases.view | `status`, `supplierId`, `from`, `to`, `q` (reference or supplier). `total` only with `products.view_cost` |
| GET | `/purchases/:id` | purchases.view | Items with ordered / received / returned / remaining; costs only with `products.view_cost` |
| GET | `/purchases/:id/movements` | inventory.view_movements | Receipts and supplier returns caused by this purchase |
| POST | `/purchases` | purchases.manage | `{supplierId, expectedAt?, notes?, items:[{productId, quantityOrdered, unitCost}], markOrdered?}` → DRAFT, or ORDERED when `markOrdered: true`. One line per product. Empty `expectedAt` = not set |
| PATCH | `/purchases/:id` | purchases.manage | Only DRAFT/ORDERED with nothing received. Fields left out are unchanged; `items` replaces all lines |
| POST | `/purchases/:id/order` | purchases.manage | DRAFT → ORDERED; sets `orderedAt`, default `expectedAt` = today + supplier lead time |
| POST | `/purchases/:id/receive` | purchases.receive | **Idempotency-Key required.** `{lines:[{purchaseItemId, quantity, unitCost?}], note?}`; zero lines ignored; `unitCost` change requires `purchases.manage` and updates the product's last cost. Same key + same body → same result; same key + other body → `IDEMPOTENCY_CONFLICT` |
| POST | `/purchases/:id/cancel` | purchases.manage | `{reason}`; partial → closes remainder, received stock stays |
| POST | `/purchases/:id/supplier-returns` | purchases.return | `{reason: DAMAGED|WRONG_ITEM|EXPIRED|OTHER, note?, lines:[{purchaseItemId, quantity}]}`; ≤ received − returned (`OVER_RETURN`); optional Idempotency-Key |
| POST | `/purchases/from-recommendations` | purchases.manage | *Phase 5.* `{lines:[{productId, quantity}]}` → one DRAFT per supplier |
| GET | `/purchases/:id/pdf` | purchases.view | *Phase 4.* Printable purchase order |

**Status machine:** `DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED`; `DRAFT|ORDERED|PARTIALLY_RECEIVED → CANCELLED`. Anything else → `INVALID_STATE_TRANSITION`.

### 4.11 Sales

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/sales` | sales.create | Employee: own only unless `sales.view_all`. Filters `from`, `to`, `userId`, `paymentMethod`, `status`, `productId`, `q` |
| GET | `/sales/:id` | sales.create | Same visibility rule |
| POST | `/sales` | sales.create | **Idempotency-Key.** See §5 |
| POST | `/sales/:id/void` | sales.void | `{reason}`; fails with `HAS_RETURNS` / `ALREADY_VOIDED` |
| POST | `/sales/:id/returns` | sales.return | `{reason, lines:[{saleItemId, quantity}]}` |
| GET | `/sales/:id/receipt?format=80mm|a4` | sales.create | HTML (print) or PDF receipt |

### 4.12 Analytics *(Business plan for recommendations, slow movers and anomaly review)*

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/analytics/dashboard?from&to` | auth | Role-shaped KPI payload (04 §10) |
| GET | `/analytics/sales-trend?from&to&interval=day|week|month` | analytics.view | Revenue, count, units |
| GET | `/analytics/inventory-trend?from&to` | analytics.view | From `InventorySnapshot` |
| GET | `/analytics/top-products?from&to&by=units|revenue&limit=10` | analytics.view | |
| GET | `/analytics/reorder-recommendations` | analytics.view | Each item: `{product, supplier, oh, oo, ip, ads, leadTime, safetyStock, rop, target, suggestedQty, method, confidence}` |
| GET | `/analytics/products/:id/reorder` | analytics.view | Single-product explanation |
| GET | `/analytics/slow-moving` | analytics.view | `{product, oh, daysOfCover, lastSaleAt, capitalTiedUp, class: SLOW|DEAD}` |
| GET | `/analytics/valuation?asOf=` | products.view_cost | Total + by category; `asOf` uses ledger history |
| GET | `/analytics/flagged-adjustments` | alerts.manage | Flagged movements + reasons |

### 4.13 Reports

`GET /reports/:type?format=pdf|csv&from&to&categoryId&productId&supplierId&userId`. All require `reports.export` (and `audit.view` for user activity), and each export is audited.

| `type` | Contents |
|---|---|
| `inventory-summary` | Products, on-hand, status, value (cost roles) |
| `product-movements` | Ledger for a product / category / period |
| `sales-performance` | Sales by day, product, category, user, payment method; margin (cost roles) |
| `purchase-history` | Purchases by supplier, status, period |
| `stock-valuation` | WAC valuation now or `asOf` |
| `low-stock` | Low and out-of-stock with reorder suggestions |
| `slow-moving` | 04 §7 |
| `user-activity` | Audit log extract |

### 4.14 Alerts and notifications

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/alerts` | alerts.view | `status`, `type`; Employees don't see UNUSUAL_ADJUSTMENT |
| POST | `/alerts/:id/acknowledge` | alerts.manage | `{note?}` |
| POST | `/alerts/:id/resolve` | alerts.manage | `{note}`; stock alerts also auto-resolve |
| GET | `/notifications` | auth | Current user's inbox |
| GET | `/notifications/unread-count` | auth | Polled every 60 s |
| POST | `/notifications/:id/read` · `/notifications/read-all` | auth | |

### 4.15 Audit

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/audit-logs` | audit.view | `userId`, `action`, `entityType`, `entityId`, `from`, `to` |

### 4.16 System

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/health` | public | `{status, db}` |

## 5. Example: complete a sale

```http
POST /api/v1/sales
Authorization: Bearer eyJ…
Idempotency-Key: 6f1c2a4e-…
Content-Type: application/json

{
  "paymentMethod": "MOBILE_MONEY",
  "customerName": null,
  "amountTendered": null,
  "items": [
    { "productId": "a1…", "quantity": "2", "unitPrice": "3500", "discountAmount": "0" },
    { "productId": "b7…", "quantity": "1.5", "unitPrice": "4200", "discountAmount": "300" }
  ]
}
```

Server rules: `unitPrice` defaults to the product's selling price. A different price counts as a discount and follows the same limit. Totals are **recomputed on the server**. Client totals are ignored.

```http
201 Created
{
  "id": "…", "reference": "SAL-2026-000123", "status": "COMPLETED",
  "subtotal": "13300.00", "discountTotal": "300.00", "total": "13000.00",
  "soldAt": "2026-11-08T16:57:03Z",
  "items": [ … ],
  "stockAfter": [ { "productId": "a1…", "quantityOnHand": "18.000", "stockStatus": "OK" },
                  { "productId": "b7…", "quantityOnHand": "2.500",  "stockStatus": "LOW" } ]
}
```

Retrying with the same `Idempotency-Key` and body returns the same 201 response. The same key with a different body → 409 `IDEMPOTENCY_CONFLICT`.

## 6. Example: receive a purchase (partial)

```http
POST /api/v1/purchases/9c…/receive
Idempotency-Key: 0d9e…
{ "lines": [ { "purchaseItemId": "p1…", "quantity": "60", "unitCost": "1250" } ] }
```

→ `200` with the purchase (status `PARTIALLY_RECEIVED`, `quantityReceived` per line) and the created movements (`quantityBefore`, `quantityAfter`, `averageCostAfter`).
