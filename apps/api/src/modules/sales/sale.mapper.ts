import { moneyString, qtyString, roundMoney, ZERO } from '../../common/decimal';
import type { Prisma } from '../../generated/prisma/client';

export const saleSummaryInclude = {
  soldBy: { select: { id: true, fullName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SaleInclude;

export const saleDetailInclude = {
  soldBy: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
  items: {
    include: {
      product: {
        select: { id: true, name: true, sku: true, unit: true, allowFractional: true },
      },
    },
    orderBy: { productName: 'asc' },
  },
} satisfies Prisma.SaleInclude;

type SaleSummaryRow = Prisma.SaleGetPayload<{ include: typeof saleSummaryInclude }>;
type SaleDetailRow = Prisma.SaleGetPayload<{ include: typeof saleDetailInclude }>;

const baseFields = (s: SaleSummaryRow | SaleDetailRow) => ({
  id: s.id,
  reference: s.reference,
  status: s.status,
  paymentMethod: s.paymentMethod,
  customerName: s.customerName,
  customerPhone: s.customerPhone,
  subtotal: moneyString(s.subtotal),
  discountTotal: moneyString(s.discountTotal),
  total: moneyString(s.total),
  returnedTotal: moneyString(s.returnedTotal),
  /** What the business keeps: total − refunds, or 0 once voided. */
  netTotal: moneyString(s.status === 'VOIDED' ? ZERO : s.total.minus(s.returnedTotal)),
  soldAt: s.soldAt,
  voidedAt: s.voidedAt,
  voidReason: s.voidReason,
  soldBy: s.soldBy,
});

/** History row. Selling amounts are visible to every role; costs never appear here. */
export function toSaleSummaryDto(s: SaleSummaryRow) {
  return { ...baseFields(s), itemCount: s._count.items };
}

/** Sale detail. `unitCost` (the average cost at the time of sale) only with products.view_cost. */
export function toSaleDetailDto(s: SaleDetailRow, canSeeCost: boolean) {
  return {
    ...baseFields(s),
    amountTendered: s.amountTendered === null ? null : moneyString(s.amountTendered),
    changeDue: s.changeDue === null ? null : moneyString(s.changeDue),
    notes: s.notes,
    voidedBy: s.voidedBy,
    createdAt: s.createdAt,
    items: s.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      product: i.product,
      quantity: qtyString(i.quantity),
      quantityReturned: qtyString(i.quantityReturned),
      quantityReturnable: qtyString(
        s.status === 'VOIDED' ? ZERO : i.quantity.minus(i.quantityReturned),
      ),
      unitPrice: moneyString(i.unitPrice),
      discountAmount: moneyString(i.discountAmount),
      lineTotal: moneyString(i.lineTotal),
      ...(canSeeCost
        ? {
            unitCost: i.unitCost.toFixed(4),
            lineCost: moneyString(roundMoney(i.unitCost.times(i.quantity))),
          }
        : {}),
    })),
  };
}
