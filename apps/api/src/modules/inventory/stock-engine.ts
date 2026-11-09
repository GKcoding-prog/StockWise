import type { MovementType } from '@stockwise/shared';
import { D, Decimal, ZERO, qtyString } from '../../common/decimal';
import { AppError } from '../../common/errors/app-error';
import type { Prisma, StockMovement } from '../../generated/prisma/client';
import type { Tx } from '../../prisma/prisma.service';
import {
  MOVEMENT_DIRECTION,
  REQUIRES_REASON,
  REQUIRES_UNIT_COST,
  incomingAverageCost,
} from './stock-math';

export interface MovementInput {
  productId: string;
  warehouseId: string;
  type: MovementType;
  /** Signed: + in, − out. Exactly one of quantityChange / targetQuantity. */
  quantityChange?: Decimal;
  /**
   * ADJUSTMENT only: the counted/desired quantity. The change is computed under the row lock,
   * so a sale landing between reading and writing can't skew a stock count. No movement is
   * written when it equals the current quantity.
   */
  targetQuantity?: Decimal;
  /** Required for OPENING_BALANCE, PURCHASE_RECEIPT and CUSTOMER_RETURN (original sale cost). */
  unitCost?: Decimal;
  reason?: string;
  note?: string;
  documentRef?: string;
  idempotencyKey?: string;
  refs?: {
    purchaseId?: string;
    purchaseItemId?: string;
    saleId?: string;
    saleItemId?: string;
    reversalOfId?: string;
    batchId?: string;
    transferId?: string;
  };
}

export interface EngineContext {
  businessId: string;
  userId: string;
  allowNegativeStock: boolean;
  /** Defaults to now. Only the seed and imports back-date movements. */
  occurredAt?: Date;
}

interface LockedLevel {
  id: string;
  quantityOnHand: Decimal;
  averageCost: Decimal;
}

const keyOf = (l: { productId: string; warehouseId: string }) => `${l.productId}:${l.warehouseId}`;

/**
 * The only writer of StockLevel and StockMovement (docs/01 §7). Must run inside the caller's
 * transaction; never opens its own.
 *
 * 1. Validates lines (sign per type, reasons, costs, fractional rule, tenant ownership).
 * 2. Locks every affected StockLevel row in (productId, warehouseId) order — a consistent
 *    lock order means concurrent sales can't deadlock.
 * 3. Applies lines in order: before/after, negative-stock rule, weighted average cost.
 * 4. Writes the balances and the ledger rows.
 */
export async function applyMovements(
  tx: Tx,
  ctx: EngineContext,
  lines: MovementInput[],
): Promise<StockMovement[]> {
  if (lines.length === 0) return [];
  await validateLines(tx, ctx, lines);

  const keys = [...new Set(lines.map(keyOf))].sort();
  const levels = new Map<string, LockedLevel>();
  for (const key of keys) {
    const [productId, warehouseId] = key.split(':');
    levels.set(key, await lockLevel(tx, ctx.businessId, productId, warehouseId));
  }

  const initial = new Map([...levels].map(([k, l]) => [k, l.quantityOnHand]));
  const changes = new Map<MovementInput, Decimal>();
  const negative = new Set<string>();
  const occurredAt = ctx.occurredAt ?? new Date();
  const rows: Prisma.StockMovementCreateManyInput[] = [];
  for (const line of lines) {
    const key = keyOf(line);
    const level = levels.get(key)!;
    const before = level.quantityOnHand;
    const change = line.targetQuantity ? line.targetQuantity.minus(before) : line.quantityChange!;
    if (change.isZero()) continue; // a count that matches the system quantity
    changes.set(line, change);
    const after = before.plus(change);
    if (after.lt(0) && !ctx.allowNegativeStock) negative.add(key);

    let unitCost: Decimal;
    let averageAfter: Decimal;
    if (change.gt(0)) {
      unitCost = line.unitCost ?? level.averageCost; // adjustments in: current WAC
      averageAfter = incomingAverageCost(before, level.averageCost, change, unitCost);
    } else {
      unitCost = level.averageCost; // issues are costed at, and don't change, the WAC
      averageAfter = level.averageCost;
    }
    level.quantityOnHand = after;
    level.averageCost = averageAfter;

    rows.push({
      businessId: ctx.businessId,
      productId: line.productId,
      warehouseId: line.warehouseId,
      type: line.type,
      quantityChange: change,
      quantityBefore: before,
      quantityAfter: after,
      unitCost,
      averageCostAfter: averageAfter,
      userId: ctx.userId,
      reason: line.reason ?? null,
      note: line.note ?? null,
      documentRef: line.documentRef ?? null,
      idempotencyKey: line.idempotencyKey ?? null,
      purchaseId: line.refs?.purchaseId ?? null,
      purchaseItemId: line.refs?.purchaseItemId ?? null,
      saleId: line.refs?.saleId ?? null,
      saleItemId: line.refs?.saleItemId ?? null,
      reversalOfId: line.refs?.reversalOfId ?? null,
      batchId: line.refs?.batchId ?? null,
      transferId: line.refs?.transferId ?? null,
      occurredAt,
    });
  }

  if (negative.size > 0) {
    throw new AppError(
      'INSUFFICIENT_STOCK',
      'Insufficient stock for one or more products',
      [...negative].map((key) => {
        const [productId, warehouseId] = key.split(':');
        const requested = lines
          .filter((l) => keyOf(l) === key)
          .reduce((acc, l) => acc.minus(changes.get(l) ?? ZERO), ZERO);
        return {
          productId,
          warehouseId,
          available: qtyString(initial.get(key)!),
          requested: qtyString(requested),
        };
      }),
    );
  }

  if (rows.length === 0) return [];
  const touched = new Set([...changes.keys()].map(keyOf));
  for (const key of touched) {
    const level = levels.get(key)!;
    await tx.stockLevel.update({
      where: { id: level.id, businessId: ctx.businessId },
      data: {
        quantityOnHand: level.quantityOnHand,
        averageCost: level.averageCost,
        version: { increment: 1 },
        lastMovementAt: occurredAt,
      },
    });
  }

  return tx.stockMovement.createManyAndReturn({ data: rows });
}

async function validateLines(tx: Tx, ctx: EngineContext, lines: MovementInput[]): Promise<void> {
  for (const line of lines) {
    if ((line.quantityChange === undefined) === (line.targetQuantity === undefined)) {
      throw new Error('Provide exactly one of quantityChange or targetQuantity');
    }
    if (line.targetQuantity) {
      if (line.type !== 'ADJUSTMENT')
        throw new Error('targetQuantity is only valid for ADJUSTMENT');
      if (line.targetQuantity.lt(0)) {
        throw new AppError('VALIDATION_ERROR', 'Quantity must not be negative');
      }
    } else if (line.quantityChange!.isZero()) {
      throw new AppError('VALIDATION_ERROR', 'Quantity change must not be zero', {
        productId: line.productId,
      });
    }
    const direction = MOVEMENT_DIRECTION[line.type];
    if (
      direction !== 0 &&
      line.quantityChange &&
      line.quantityChange.isPositive() !== direction > 0
    ) {
      throw new Error(`${line.type} movement has the wrong sign (${line.quantityChange})`);
    }
    if (REQUIRES_UNIT_COST.has(line.type) && !line.unitCost) {
      throw new Error(`${line.type} movement requires a unit cost`);
    }
    if (line.unitCost?.lt(0)) throw new Error('Unit cost must not be negative');
    if (REQUIRES_REASON.has(line.type) && !line.reason?.trim()) {
      throw new AppError('VALIDATION_ERROR', `A reason is required for ${line.type}`);
    }
  }

  // Referenced ids must belong to the caller's business (docs/01 §6, layer 4).
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const warehouseIds = [...new Set(lines.map((l) => l.warehouseId))];
  const [products, warehouses] = await Promise.all([
    tx.product.findMany({
      where: { businessId: ctx.businessId, id: { in: productIds } },
      select: { id: true, allowFractional: true },
    }),
    tx.warehouse.findMany({
      where: { businessId: ctx.businessId, id: { in: warehouseIds } },
      select: { id: true },
    }),
  ]);
  if (products.length !== productIds.length) throw AppError.notFound('Product');
  if (warehouses.length !== warehouseIds.length) throw AppError.notFound('Warehouse');

  const wholeOnly = new Set(products.filter((p) => !p.allowFractional).map((p) => p.id));
  const fractional = lines.filter(
    (l) => wholeOnly.has(l.productId) && !(l.quantityChange ?? l.targetQuantity)!.isInteger(),
  );
  if (fractional.length) {
    throw new AppError(
      'FRACTIONAL_QUANTITY_NOT_ALLOWED',
      'This product is sold in whole units only',
      fractional.map((l) => ({ productId: l.productId })),
    );
  }
}

/** Creates the balance row if missing, then locks it until the transaction ends. */
async function lockLevel(
  tx: Tx,
  businessId: string,
  productId: string,
  warehouseId: string,
): Promise<LockedLevel> {
  await tx.$executeRaw`
    INSERT INTO "stock_levels" ("id", "businessId", "productId", "warehouseId", "updatedAt")
    VALUES (gen_random_uuid(), ${businessId}::uuid, ${productId}::uuid, ${warehouseId}::uuid, now())
    ON CONFLICT ("productId", "warehouseId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ id: string; qty: string; avg: string }[]>`
    SELECT "id", "quantityOnHand"::text AS qty, "averageCost"::text AS avg
    FROM "stock_levels"
    WHERE "productId" = ${productId}::uuid
      AND "warehouseId" = ${warehouseId}::uuid
      AND "businessId" = ${businessId}::uuid
    FOR UPDATE`;
  if (rows.length !== 1) throw AppError.notFound('Stock level');
  return { id: rows[0].id, quantityOnHand: D(rows[0].qty), averageCost: D(rows[0].avg) };
}
