# StockWise — 03. Roles, permissions and use cases

Version 0.1 · Phase 1 design

## 1. Roles

| Role | Who | In one sentence |
|---|---|---|
| **Owner** | Business owner (one or more per business) | Full control, including users, settings, plan, audit log and everything below |
| **Manager** | Shop/store manager | Runs inventory, purchases, sales, analytics and reports; can invite employees; can't change business settings or other managers |
| **Employee** | Cashier, storekeeper | Daily operations: sell, receive goods, record damaged items, view stock; no costs, no reports, no voids |

A user can hold different roles in different businesses (e.g. Owner of one shop, Manager in a relative's shop). The role is per `BusinessMembership`.

## 2. Permission catalogue and matrix

Keys live in `packages/shared/src/permissions.ts` and are seeded into `Permission`.

| Permission key | Meaning | Owner | Manager | Employee |
|---|---|:-:|:-:|:-:|
| `business.manage` | Edit business profile, currency, locale, settings | ✓ | | |
| `business.plan` | View and change subscription plan | ✓ | | |
| `users.view` | See members and invitations | ✓ | ✓ | |
| `users.invite` | Invite users (*Manager: Employee role only*) | ✓ | ✓ | |
| `users.manage` | Change roles, suspend, remove members | ✓ | | |
| `audit.view` | View the activity / audit log | ✓ | | |
| `warehouses.manage` | Manage locations | ✓ | | |
| `products.view` | View products and stock | ✓ | ✓ | ✓ |
| `products.view_cost` | See purchase price, average cost, margins, inventory value | ✓ | ✓ | |
| `products.manage` | Create, edit, archive products; set thresholds | ✓ | ✓ | |
| `categories.manage` | Manage categories | ✓ | ✓ | |
| `suppliers.view` | View suppliers | ✓ | ✓ | ✓ |
| `suppliers.manage` | Create, edit, archive suppliers | ✓ | ✓ | |
| `purchases.view` | View purchases | ✓ | ✓ | ✓ |
| `purchases.manage` | Create, edit, order, cancel purchases | ✓ | ✓ | |
| `purchases.receive` | Record goods received | ✓ | ✓ | ✓ |
| `purchases.return` | Return goods to supplier | ✓ | ✓ | |
| `sales.create` | Record sales | ✓ | ✓ | ✓ |
| `sales.view_all` | See everyone's sales (*Employees see only their own*) | ✓ | ✓ | |
| `sales.discount_unlimited` | Discount beyond `employeeMaxDiscountPercent` | ✓ | ✓ | |
| `sales.void` | Void a sale | ✓ | ✓ | |
| `sales.return` | Record customer returns | ✓ | ✓ | |
| `inventory.view_movements` | View stock movement history | ✓ | ✓ | ✓ |
| `inventory.adjust` | Manual adjustments and stock counts | ✓ | ✓ | |
| `inventory.write_off` | Record damaged / expired goods (reason required) | ✓ | ✓ | ✓ |
| `analytics.view` | Dashboard financials, recommendations, slow movers | ✓ | ✓ | |
| `reports.export` | Generate and download reports | ✓ | ✓ | |
| `alerts.view` | See stock alerts | ✓ | ✓ | ✓ |
| `alerts.manage` | Acknowledge/resolve alerts; review flagged adjustments | ✓ | ✓ | |

**Data-dependent rules** (enforced in services, not just guards):
- The last active Owner can't be suspended, removed or demoted.
- Nobody can change their own role or suspend themselves.
- Employee discount per line ≤ `employeeMaxDiscountPercent`.
- Employees get a simplified dashboard: today's own sales count, low-stock list and alerts, with no money totals for the business.

## 3. Use cases

Notation: **UC-xx · Name** — primary actor — main flow — rules / alternatives.

### Account and business

**UC-01 · Register business** — new user
1. Enters name, email, password, business name, currency (default BIF) and language.
2. System creates User, Business, default Warehouse and Owner membership in one transaction, then logs them in.
- Email already used → `EMAIL_TAKEN`. Password policy enforced server-side.

**UC-02 · Log in / log out / stay logged in** — any user
- With several memberships, the user picks a business (or the last used one is selected). The access token is refreshed silently. Logout revokes the refresh token.

**UC-03 · Recover password** — any user
- Requests a link and gets the same response whether or not the email exists. The link is valid 30 minutes and single-use. Resetting revokes all sessions.

**UC-04 · Configure business** — Owner
- Profile, NIF, address, currency, timezone, default language, employee discount limit, analysis settings and anomaly thresholds.

**UC-05 · Invite employee** — Owner, Manager
1. Enters email and role. 2. System emails a link (7 days). 3. Invitee sets name and password (or logs in if they have an account) and joins.
- Manager can only choose Employee. Re-inviting replaces the old link.

**UC-06 · Manage members** — Owner
- Change role, suspend or reactivate, remove. Takes effect on the member's next request. Audited.

**UC-07 · View activity log** — Owner
- Filter by user, action, entity and date. Export to CSV.

### Catalogue

**UC-10 · Manage products** — Owner, Manager
1. Creates a product: name, SKU (auto-suggested), barcode, category, unit, prices, minimum stock, supplier, optional opening quantity and cost.
2. System validates SKU/barcode uniqueness and writes an `OPENING_BALANCE` movement if a quantity is given.
- Edit any field **except quantity**. The quantity field isn't editable, and the screen links to "Adjust stock". Archive hides the product from sales and search but keeps its history.

**UC-11 · Import products from CSV** — Owner, Manager *(Phase 3 stretch / onboarding service)*
- Upload, preview with row-level errors, then confirm. Creates products and opening balances in one transaction.

**UC-12 · Search and filter products** — all
- Search by name, SKU or barcode (a scanner types into the search box). Filter by category, stock status and supplier.

**UC-13 · Manage categories / suppliers** — Owner, Manager
- CRUD + archive. The supplier page shows supplied products, purchase history and open purchases.

### Purchasing

**UC-20 · Create purchase order** — Owner, Manager
1. Selects supplier and adds products with quantities and unit costs (pre-filled from last cost). 2. Saves as DRAFT, or marks it ORDERED (sets `expectedAt = today + lead time`).
- **Stock doesn't change.**

**UC-21 · Create purchase from recommendations** — Owner, Manager
- From the "Reorder" screen, selects suggested lines. The system creates one DRAFT purchase per supplier.

**UC-22 · Receive goods** — Owner, Manager, Employee
1. Opens an ORDERED purchase. 2. Enters the quantity actually received per line (defaults to remaining) and can correct the unit cost if the invoice differs (Manager+ only). 3. Confirms.
4. System creates `PURCHASE_RECEIPT` movements, updates weighted average cost, and sets status PARTIALLY_RECEIVED or RECEIVED.
- Can't receive more than remaining. Idempotent on retry.

**UC-23 · Cancel purchase** — Owner, Manager
- Allowed for DRAFT/ORDERED. For PARTIALLY_RECEIVED it closes the remaining quantity (received stock stays). Reason required.

**UC-24 · Return to supplier** — Owner, Manager
- Selects received lines and quantities, plus a reason. Creates `SUPPLIER_RETURN` movements.

### Sales

**UC-30 · Record a sale** — Owner, Manager, Employee
1. Adds products by search or scan. 2. Adjusts quantities and optional line discounts. 3. Selects payment method (cash, mobile money, bank transfer, card, other) and, for cash, the amount tendered to show change. 4. Completes.
5. System, in one transaction: checks stock, generates reference `SAL-2026-000123`, saves the sale with cost snapshots, and writes `SALE` movements.
6. Shows a printable receipt (80 mm and A4 layouts).
- Insufficient stock → clear message naming the product and available quantity. Discount above limit → `DISCOUNT_NOT_ALLOWED`. Retry → same sale returned (idempotency).

**UC-31 · View sales history** — all (Employee: own only)
- Filter by date, user, payment method, status and product. Open a sale to see lines and linked movements.

**UC-32 · Void a sale** — Owner, Manager
- Only if nothing has been returned. Reason required. Creates `SALE_VOID` reversal movements and sets status VOIDED. Audited, and visible in the anomaly review if frequent.

**UC-33 · Customer return** — Owner, Manager
- Selects lines and quantities (≤ sold − already returned) plus a reason. Creates `CUSTOMER_RETURN` movements at the original cost. Status → PARTIALLY_RETURNED or RETURNED.

### Inventory

**UC-40 · View stock and movement history** — all
- Per product: on-hand, status, average cost (cost roles only), and a ledger with type, change, before → after, user, time, reason and a link to the source document.

**UC-41 · Adjust stock** — Owner, Manager
- Product, new quantity *or* ±difference, and a reason (from a list + free text). Creates an `ADJUSTMENT`. May be flagged as unusual (UC-52).

**UC-42 · Stock count (stock-take)** — Owner, Manager
1. Starts a count for a category or all products. 2. Enters counted quantities. 3. Reviews differences (value impact shown). 4. Confirms.
- One `ADJUSTMENT` per differing product, sharing a `documentRef`.

**UC-43 · Record damaged / expired goods** — Owner, Manager, Employee
- Creates a `WRITE_OFF` with a mandatory reason. Subject to anomaly rules.

### Intelligence, alerts, reports

**UC-50 · View dashboard** — all (content varies by role; see 04 §10)

**UC-51 · Review reorder recommendations** — Owner, Manager
- List of products where inventory position ≤ reorder point, each with suggested quantity, confidence and a "Why?" explanation (04 §6). Can override quantities, then create purchases (UC-21).

**UC-52 · Review flagged adjustments** — Owner, Manager
- Sees the flagged movement, which rules fired and the user's history. Acknowledges with a note. The flag stays visible in the ledger.

**UC-53 · Manage alerts and notifications** — all (manage: Owner, Manager)
- Bell icon with unread count. Alerts list filterable by type and status. Low/out-of-stock alerts resolve automatically when stock is replenished.

**UC-54 · View slow-moving stock** — Owner, Manager
- List sorted by capital tied up, with days of cover and last sale date.

**UC-55 · Generate reports** — Owner, Manager
- Choose report type and filters (date range, category, product, supplier, user), then download PDF or CSV. See 05-api-spec §4.13 for the list.

## 4. Mapping to the pilot "definition of success" (brief §13)

| Success criterion | Use cases |
|---|---|
| 1. Register and configure business | UC-01, UC-04 |
| 2. Add products and suppliers | UC-10, UC-11, UC-13 |
| 3. Record incoming purchases | UC-20, UC-22 |
| 4. Record sales | UC-30 |
| 5. Inventory updates correctly | Stock engine (01 §7), UC-40 |
| 6. Review movement history | UC-40 |
| 7. Useful low-stock alerts | UC-53 |
| 8. Understand restocking recommendations | UC-51 |
| 9. Generate reports | UC-55 |
| 10. Manage employee access safely | UC-05, UC-06, permission matrix |
