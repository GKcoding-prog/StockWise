import { moneyString, qtyString, ZERO } from '../../common/decimal';
import type { Prisma } from '../../generated/prisma/client';

export const purchaseSummaryInclude = {
  supplier: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.PurchaseInclude;

export const purchaseDetailInclude = {
  supplier: {
    select: { id: true, name: true, phone: true, leadTimeDays: true },
  },
  createdBy: { select: { id: true, fullName: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          allowFractional: true,
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
  },
} satisfies Prisma.PurchaseInclude;

type PurchaseSummaryRow = Prisma.PurchaseGetPayload<{
  include: typeof purchaseSummaryInclude;
}>;
type PurchaseDetailRow = Prisma.PurchaseGetPayload<{
  include: typeof purchaseDetailInclude;
}>;
type PurchaseItemRow = PurchaseDetailRow['items'][number];

const baseFields = (p: PurchaseSummaryRow | PurchaseDetailRow) => ({
  id: p.id,
  reference: p.reference,
  status: p.status,
  orderedAt: p.orderedAt,
  expectedAt: p.expectedAt,
  receivedAt: p.receivedAt,
  cancelledAt: p.cancelledAt,
  cancelReason: p.cancelReason,
  notes: p.notes,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

/** List row. The total is a cost, so only roles with products.view_cost get it. */
export function toPurchaseSummaryDto(p: PurchaseSummaryRow, canSeeCost: boolean) {
  return {
    ...baseFields(p),
    supplier: p.supplier,
    itemCount: p._count.items,
    ...(canSeeCost ? { total: moneyString(p.total) } : {}),
  };
}

/** Remaining to receive. A cancelled purchase has nothing left to receive. */
export function remainingOf(
  item: Pick<PurchaseItemRow, 'quantityOrdered' | 'quantityReceived'>,
  status: string,
) {
  if (status === 'CANCELLED') return ZERO;
  return item.quantityOrdered.minus(item.quantityReceived);
}

export function toPurchaseDetailDto(p: PurchaseDetailRow, canSeeCost: boolean) {
  return {
    ...baseFields(p),
    supplier: p.supplier,
    createdBy: p.createdBy,
    ...(canSeeCost ? { total: moneyString(p.total) } : {}),
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      product: i.product,
      quantityOrdered: qtyString(i.quantityOrdered),
      quantityReceived: qtyString(i.quantityReceived),
      quantityReturned: qtyString(i.quantityReturned),
      quantityRemaining: qtyString(remainingOf(i, p.status)),
      ...(canSeeCost
        ? {
            unitCost: i.unitCost.toFixed(4),
            lineTotal: moneyString(i.lineTotal),
          }
        : {}),
    })),
  };
}
