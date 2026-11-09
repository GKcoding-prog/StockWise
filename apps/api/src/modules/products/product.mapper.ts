import { ZERO, moneyString, qtyString, roundMoney } from '../../common/decimal';
import type { Prisma } from '../../generated/prisma/client';
import { stockStatus } from '../inventory/stock-math';

export const productInclude = (warehouseId: string) =>
  ({
    category: { select: { id: true, name: true } },
    defaultSupplier: { select: { id: true, name: true, leadTimeDays: true } },
    stockLevels: {
      where: { warehouseId },
      select: { quantityOnHand: true, averageCost: true, lastMovementAt: true },
    },
  }) satisfies Prisma.ProductInclude;

export type ProductWithStock = Prisma.ProductGetPayload<{
  include: ReturnType<typeof productInclude>;
}>;

/** API shape of a product. Cost fields only for roles with products.view_cost (docs/03 §2). */
export function toProductDto(p: ProductWithStock, canSeeCost: boolean) {
  const level = p.stockLevels[0];
  const quantityOnHand = level?.quantityOnHand ?? ZERO;
  const averageCost = level?.averageCost ?? ZERO;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    description: p.description,
    unit: p.unit,
    allowFractional: p.allowFractional,
    sellingPrice: moneyString(p.sellingPrice),
    minStockLevel: qtyString(p.minStockLevel),
    targetStockLevel: p.targetStockLevel ? qtyString(p.targetStockLevel) : null,
    reorderMultiple: p.reorderMultiple ? qtyString(p.reorderMultiple) : null,
    leadTimeDaysOverride: p.leadTimeDaysOverride,
    trackExpiry: p.trackExpiry,
    imageUrl: p.imageUrl,
    category: p.category,
    defaultSupplier: p.defaultSupplier,
    quantityOnHand: qtyString(quantityOnHand),
    stockStatus: stockStatus(quantityOnHand, p.minStockLevel),
    lastMovementAt: level?.lastMovementAt ?? null,
    archivedAt: p.archivedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    ...(canSeeCost
      ? {
          costPrice: p.costPrice ? p.costPrice.toFixed(4) : null,
          averageCost: averageCost.toFixed(4),
          stockValue: moneyString(roundMoney(quantityOnHand.times(averageCost))),
        }
      : {}),
  };
}

export type ProductDto = ReturnType<typeof toProductDto>;
