import { qtyString } from '../../common/decimal';
import type { Prisma, StockMovement } from '../../generated/prisma/client';

export const movementInclude = {
  product: { select: { id: true, name: true, sku: true, unit: true } },
  user: { select: { id: true, fullName: true } },
  sale: { select: { id: true, reference: true } },
  purchase: { select: { id: true, reference: true } },
} satisfies Prisma.StockMovementInclude;

type MovementWithRefs = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

/** Ledger row. Costs only for roles with products.view_cost. */
export function toMovementDto(m: StockMovement | MovementWithRefs, canSeeCost: boolean) {
  const withRefs = 'product' in m ? (m as MovementWithRefs) : undefined;
  return {
    id: m.id,
    seq: m.seq.toString(),
    type: m.type,
    productId: m.productId,
    warehouseId: m.warehouseId,
    quantityChange: qtyString(m.quantityChange),
    quantityBefore: qtyString(m.quantityBefore),
    quantityAfter: qtyString(m.quantityAfter),
    reason: m.reason,
    note: m.note,
    documentRef: m.documentRef,
    saleId: m.saleId,
    purchaseId: m.purchaseId,
    reversalOfId: m.reversalOfId,
    isFlagged: m.isFlagged,
    flagReasons: m.flagReasons,
    occurredAt: m.occurredAt,
    userId: m.userId,
    ...(withRefs
      ? {
          product: withRefs.product,
          user: withRefs.user,
          sale: withRefs.sale,
          purchase: withRefs.purchase,
        }
      : {}),
    ...(canSeeCost
      ? { unitCost: m.unitCost.toFixed(4), averageCostAfter: m.averageCostAfter.toFixed(4) }
      : {}),
  };
}
