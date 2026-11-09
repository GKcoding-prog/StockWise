import { z } from 'zod';
import { ADJUSTMENT_REASONS, MOVEMENT_TYPES, STOCK_STATUSES, WRITE_OFF_REASONS } from '../enums';
import { PaginationQuerySchema, localDate, nullableText, quantity, queryBoolean } from './common';

const adjustmentLine = z
  .object({
    productId: z.uuid(),
    newQuantity: quantity('nonnegative').optional(),
    quantityChange: quantity().optional(),
  })
  .refine((l) => (l.newQuantity === undefined) !== (l.quantityChange === undefined), {
    message: 'sw.oneQuantity',
  });

export const CreateAdjustmentSchema = z.object({
  reason: z.enum(ADJUSTMENT_REASONS),
  note: nullableText(500),
  lines: z.array(adjustmentLine).min(1).max(200),
});
export type CreateAdjustmentInput = z.input<typeof CreateAdjustmentSchema>;

export const CreateWriteOffSchema = z.object({
  reason: z.enum(WRITE_OFF_REASONS),
  note: z.string().trim().min(1).max(500),
  lines: z
    .array(z.object({ productId: z.uuid(), quantity: quantity('positive') }))
    .min(1)
    .max(200),
});
export type CreateWriteOffInput = z.input<typeof CreateWriteOffSchema>;

export const StockCountSchema = z.object({
  note: nullableText(500),
  lines: z
    .array(z.object({ productId: z.uuid(), countedQuantity: quantity('nonnegative') }))
    .min(1)
    .max(1000),
});
export type StockCountInput = z.input<typeof StockCountSchema>;

export const MovementListQuerySchema = PaginationQuerySchema.extend({
  productId: z.uuid().optional(),
  userId: z.uuid().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: localDate.optional(),
  to: localDate.optional(),
  flagged: queryBoolean,
});
export type MovementListQuery = z.infer<typeof MovementListQuerySchema>;

export const StockListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  status: z.enum(STOCK_STATUSES).optional(),
});
export type StockListQuery = z.infer<typeof StockListQuerySchema>;
