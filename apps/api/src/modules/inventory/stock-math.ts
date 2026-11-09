import type { MovementType, StockStatus } from '@stockwise/shared';
import { D, Decimal, roundCost } from '../../common/decimal';

/**
 * Weighted average cost after an incoming movement (docs/04 §9):
 *   newAvg = (before ≤ 0) ? inCost : (before × oldAvg + q × inCost) / (before + q)
 * Outgoing movements leave the average unchanged. Rounded to 4 decimals.
 */
export function incomingAverageCost(
  before: Decimal,
  oldAverage: Decimal,
  quantityIn: Decimal,
  inCost: Decimal,
): Decimal {
  if (before.lte(0)) return roundCost(inCost);
  const after = before.plus(quantityIn);
  return roundCost(before.times(oldAverage).plus(quantityIn.times(inCost)).dividedBy(after));
}

/** docs/04 §1: OUT if OH ≤ 0, LOW if 0 < OH ≤ MIN, otherwise OK. */
export function stockStatus(onHand: Decimal, minStockLevel: Decimal): StockStatus {
  if (onHand.lte(0)) return 'OUT';
  if (onHand.lte(minStockLevel)) return 'LOW';
  return 'OK';
}

/** Which direction each movement type may move stock (+1 in, −1 out, 0 either). */
export const MOVEMENT_DIRECTION: Record<MovementType, 1 | -1 | 0> = {
  OPENING_BALANCE: 1,
  PURCHASE_RECEIPT: 1,
  SUPPLIER_RETURN: -1,
  SALE: -1,
  SALE_VOID: 1,
  CUSTOMER_RETURN: 1,
  ADJUSTMENT: 0,
  WRITE_OFF: -1,
  TRANSFER_IN: 1,
  TRANSFER_OUT: -1,
};

/** Types whose incoming cost must be supplied by the caller (not taken from the current WAC). */
export const REQUIRES_UNIT_COST: ReadonlySet<MovementType> = new Set([
  'OPENING_BALANCE',
  'PURCHASE_RECEIPT',
  'CUSTOMER_RETURN',
]);

/** Types that must carry a reason (docs/01 §7.1). */
export const REQUIRES_REASON: ReadonlySet<MovementType> = new Set([
  'ADJUSTMENT',
  'WRITE_OFF',
  'SUPPLIER_RETURN',
  'CUSTOMER_RETURN',
  'SALE_VOID',
]);

export { D };
