import { z } from 'zod';
import { CUSTOMER_RETURN_REASONS, PAYMENT_METHODS, SALE_STATUSES } from '../enums';
import { PaginationQuerySchema, localDate, money, nullableText, quantity } from './common';

/** Optional amount; an empty form field ("") means "not given". */
const nullableMoney = z
  .union([money(), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null));

const saleItem = z.object({
  productId: z.uuid(),
  quantity: quantity('positive'),
  /** Defaults to the product's selling price. A lower price counts as a discount. */
  unitPrice: money().optional(),
  /** Amount taken off the line (not a percentage). */
  discountAmount: money().default('0'),
});

/**
 * UC-30. Totals are always recomputed on the server; the client never sends them.
 * One line per product: the cart merges repeated scans, and returns are tracked per line.
 */
export const CreateSaleSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  customerName: nullableText(120),
  customerPhone: nullableText(30),
  /** Cash only: what the customer handed over, to compute the change. */
  amountTendered: nullableMoney,
  notes: nullableText(500),
  items: z
    .array(saleItem)
    .min(1)
    .max(200)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: 'sw.duplicateProduct',
    }),
});
export type CreateSaleInput = z.input<typeof CreateSaleSchema>;

/** UC-32. */
export const VoidSaleSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type VoidSaleInput = z.input<typeof VoidSaleSchema>;

/** UC-33. Each line: up to the quantity sold minus what was already returned. */
export const CustomerReturnSchema = z.object({
  reason: z.enum(CUSTOMER_RETURN_REASONS),
  note: nullableText(500),
  lines: z
    .array(z.object({ saleItemId: z.uuid(), quantity: quantity('positive') }))
    .min(1)
    .max(200)
    .refine((lines) => new Set(lines.map((l) => l.saleItemId)).size === lines.length, {
      message: 'sw.duplicateLine',
    }),
});
export type CustomerReturnInput = z.input<typeof CustomerReturnSchema>;

/** UC-31. `q` matches the reference or the customer's name/phone. */
export const SaleListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(SALE_STATUSES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  userId: z.uuid().optional(),
  productId: z.uuid().optional(),
  from: localDate.optional(),
  to: localDate.optional(),
});
export type SaleListQuery = z.infer<typeof SaleListQuerySchema>;
