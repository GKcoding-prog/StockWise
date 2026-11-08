-- =============================================================================
-- StockWise — integrity guards that Prisma's schema language cannot express.
--
-- Applied as its own migration right after the initial one by `pnpm db:init`
-- (see scripts/add-integrity-migration.mjs). Prisma ignores triggers and CHECK
-- constraints when it compares the database with schema.prisma, so these
-- survive future `prisma migrate dev` runs.
--
-- Column names are camelCase (Prisma default), hence the double quotes.
-- Partial unique indexes and trigram indexes live in schema.prisma instead.
-- =============================================================================

-- 1. Append-only ledgers: stock_movements and audit_logs can never be edited or
--    deleted. Corrections are made by inserting a reversing movement.
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (attempted %)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
-- Note: this also blocks ON DELETE CASCADE from businesses. Erasing a whole
-- tenant is an explicit admin script that disables these triggers inside a
-- maintenance transaction — never an API operation.

-- 2. Ledger arithmetic must be consistent on every row.
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_arithmetic
  CHECK ("quantityAfter" = "quantityBefore" + "quantityChange");
ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_nonzero CHECK ("quantityChange" <> 0);

-- 3. Sanity checks on documents and products.
ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_qty_positive CHECK ("quantityOrdered" > 0);
ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_received_range
  CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered");
ALTER TABLE purchase_items
  ADD CONSTRAINT purchase_items_cost_nonneg CHECK ("unitCost" >= 0);
ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_qty_positive CHECK (quantity > 0);
ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_returned_range
  CHECK ("quantityReturned" >= 0 AND "quantityReturned" <= quantity);
ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_discount_range
  CHECK ("discountAmount" >= 0 AND "discountAmount" <= "unitPrice" * quantity);
ALTER TABLE products
  ADD CONSTRAINT products_prices_nonneg
  CHECK ("purchasePrice" >= 0 AND "sellingPrice" >= 0 AND "minStockLevel" >= 0);
