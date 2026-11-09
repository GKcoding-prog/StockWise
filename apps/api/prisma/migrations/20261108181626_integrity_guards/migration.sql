-- StockWise integrity guards (docs/02 §4).
-- Rules Prisma can't express: CHECK constraints, append-only triggers and partial unique indexes.
-- Installed by the `integrity_guards` migration right after `init`. Column names are quoted
-- camelCase because the schema maps table names only.

-- ─── I2: ledger arithmetic ─────────────────────────────────────────────────────
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_change_nonzero" CHECK ("quantityChange" <> 0),
  ADD CONSTRAINT "stock_movements_after_eq_before_plus_change"
    CHECK ("quantityAfter" = "quantityBefore" + "quantityChange"),
  ADD CONSTRAINT "stock_movements_costs_nonnegative"
    CHECK ("unitCost" >= 0 AND "averageCostAfter" >= 0);

ALTER TABLE "stock_levels"
  ADD CONSTRAINT "stock_levels_average_cost_nonnegative" CHECK ("averageCost" >= 0);

-- ─── I3: the ledger is append-only ─────────────────────────────────────────────
-- Only the anomaly flag columns may change after insert (set by the anomaly check, docs/04 §8).
-- TRUNCATE is not blocked so test suites can reset the database.
CREATE OR REPLACE FUNCTION stock_movements_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stock_movements is append-only: DELETE is not allowed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (to_jsonb(NEW) - 'isFlagged' - 'flagReasons') IS DISTINCT FROM
     (to_jsonb(OLD) - 'isFlagged' - 'flagReasons') THEN
    RAISE EXCEPTION 'stock_movements is append-only: only isFlagged/flagReasons may be updated'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "stock_movements_append_only"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();

CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ─── I7: received/returned quantities stay within bounds ───────────────────────
ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_ordered_positive" CHECK ("quantityOrdered" > 0),
  ADD CONSTRAINT "purchase_items_received_within_ordered"
    CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered"),
  ADD CONSTRAINT "purchase_items_returned_within_received"
    CHECK ("quantityReturned" >= 0 AND "quantityReturned" <= "quantityReceived"),
  ADD CONSTRAINT "purchase_items_amounts_nonnegative" CHECK ("unitCost" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "sale_items_returned_within_sold"
    CHECK ("quantityReturned" >= 0 AND "quantityReturned" <= "quantity"),
  ADD CONSTRAINT "sale_items_amounts_nonnegative"
    CHECK ("unitPrice" >= 0 AND "discountAmount" >= 0 AND "lineTotal" >= 0 AND "unitCost" >= 0);

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_amounts_nonnegative"
    CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "total" >= 0),
  ADD CONSTRAINT "sales_returned_within_total"
    CHECK ("returnedTotal" >= 0 AND "returnedTotal" <= "total");

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_total_nonnegative" CHECK ("total" >= 0);

-- ─── Catalogue sanity ──────────────────────────────────────────────────────────
ALTER TABLE "products"
  ADD CONSTRAINT "products_prices_nonnegative"
    CHECK ("sellingPrice" >= 0 AND ("costPrice" IS NULL OR "costPrice" >= 0)),
  ADD CONSTRAINT "products_levels_nonnegative"
    CHECK ("minStockLevel" >= 0 AND ("targetStockLevel" IS NULL OR "targetStockLevel" >= 0)),
  ADD CONSTRAINT "products_reorder_multiple_positive"
    CHECK ("reorderMultiple" IS NULL OR "reorderMultiple" > 0),
  ADD CONSTRAINT "products_lead_time_nonnegative"
    CHECK ("leadTimeDaysOverride" IS NULL OR "leadTimeDaysOverride" >= 0);

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_lead_time_nonnegative" CHECK ("leadTimeDays" >= 0);

ALTER TABLE "document_sequences"
  ADD CONSTRAINT "document_sequences_last_value_nonnegative" CHECK ("lastValue" >= 0);

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- ─── Partial unique indexes ────────────────────────────────────────────────────
-- One default warehouse per business.
CREATE UNIQUE INDEX "warehouses_one_default_per_business"
  ON "warehouses" ("businessId") WHERE "isDefault";

-- One non-resolved alert per condition (dedupe, docs/01 §10).
CREATE UNIQUE INDEX "alerts_one_open_per_dedupe_key"
  ON "alerts" ("businessId", "dedupeKey") WHERE "status" <> 'RESOLVED';

-- System roles (businessId IS NULL) have unique keys; @@unique([businessId, key]) treats NULLs as distinct.
CREATE UNIQUE INDEX "roles_system_key_unique"
  ON "roles" ("key") WHERE "businessId" IS NULL;
