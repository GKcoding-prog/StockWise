import { z } from 'zod';
import { PURCHASE_STATUSES, SUPPLIER_RETURN_REASONS } from '../enums';
import {
  PaginationQuerySchema,
  localDate,
  nullableLocalDate,
  nullableText,
  quantity,
  unitCost,
} from './common';

/** One product per purchase: receiving and returns are tracked per line. */
const uniqueProducts = (items: { productId: string }[]) =>
  new Set(items.map((i) => i.productId)).size === items.length;

const purchaseItem = z.object({
  productId: z.uuid(),
  quantityOrdered: quantity('positive'),
  unitCost: unitCost(),
});

const purchaseItems = z
  .array(purchaseItem)
  .min(1)
  .max(200)
  .refine(uniqueProducts, { message: 'sw.duplicateProduct' });

/** UC-20. Stock does not change until goods are received (invariant I6). */
export const CreatePurchaseSchema = z.object({
  supplierId: z.uuid(),
  /** Business-local date; defaults to order date + supplier lead time when ordered. */
  expectedAt: nullableLocalDate,
  notes: nullableText(1000),
  items: purchaseItems,
  /** Create directly as ORDERED instead of DRAFT. */
  markOrdered: z.boolean().default(false),
});
export type CreatePurchaseInput = z.input<typeof CreatePurchaseSchema>;

/**
 * Only while nothing has been received. `items` replaces all lines. A missing field means
 * "leave unchanged": `.optional()` stops the empty-to-null transforms from running on it.
 */
export const UpdatePurchaseSchema = z.object({
  supplierId: z.uuid().optional(),
  expectedAt: nullableLocalDate.optional(),
  notes: nullableText(1000).optional(),
  items: purchaseItems.optional(),
});
export type UpdatePurchaseInput = z.input<typeof UpdatePurchaseSchema>;

/** UC-22. Lines with quantity 0 are ignored; at least one must be positive. */
export const ReceivePurchaseSchema = z.object({
  note: nullableText(500),
  lines: z
    .array(
      z.object({
        purchaseItemId: z.uuid(),
        quantity: quantity('nonnegative'),
        /** Invoice cost if it differs from the ordered cost (needs purchases.manage). */
        unitCost: unitCost().optional(),
      }),
    )
    .min(1)
    .max(200)
    .refine((lines) => new Set(lines.map((l) => l.purchaseItemId)).size === lines.length, {
      message: 'sw.duplicateLine',
    })
    .refine((lines) => lines.some((l) => /[1-9]/.test(l.quantity)), {
      message: 'sw.nothingToReceive',
    }),
});
export type ReceivePurchaseInput = z.input<typeof ReceivePurchaseSchema>;

/** UC-23. */
export const CancelPurchaseSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type CancelPurchaseInput = z.input<typeof CancelPurchaseSchema>;

/** UC-24. */
export const SupplierReturnSchema = z.object({
  reason: z.enum(SUPPLIER_RETURN_REASONS),
  note: nullableText(500),
  lines: z
    .array(z.object({ purchaseItemId: z.uuid(), quantity: quantity('positive') }))
    .min(1)
    .max(200)
    .refine((lines) => new Set(lines.map((l) => l.purchaseItemId)).size === lines.length, {
      message: 'sw.duplicateLine',
    }),
});
export type SupplierReturnInput = z.input<typeof SupplierReturnSchema>;

export const PurchaseListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(PURCHASE_STATUSES).optional(),
  supplierId: z.uuid().optional(),
  from: localDate.optional(),
  to: localDate.optional(),
});
export type PurchaseListQuery = z.infer<typeof PurchaseListQuerySchema>;
