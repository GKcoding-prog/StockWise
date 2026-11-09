import { z } from 'zod';
import { STOCK_STATUSES } from '../enums';
import {
  PaginationQuerySchema,
  money,
  nullableText,
  nullableUuid,
  quantity,
  queryBoolean,
  unitCost,
} from './common';

// ── Categories ─────────────────────────────────────────────────────────────

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parentId: nullableUuid,
  description: nullableText(250),
});
export const UpdateCategorySchema = CreateCategorySchema.partial();

export const CategoryListQuerySchema = z.object({
  archived: queryBoolean,
  q: z.string().trim().max(100).optional(),
});

// ── Suppliers ──────────────────────────────────────────────────────────────

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: nullableText(100),
  phone: nullableText(30),
  email: nullableText(254),
  address: nullableText(250),
  nif: nullableText(40),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(7),
  notes: nullableText(1000),
});
export const UpdateSupplierSchema = CreateSupplierSchema.partial();

export const SupplierListQuerySchema = PaginationQuerySchema.extend({ archived: queryBoolean });

// ── Products ───────────────────────────────────────────────────────────────

const productFields = {
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(40).optional(),
  barcode: nullableText(64),
  description: nullableText(1000),
  categoryId: nullableUuid,
  defaultSupplierId: nullableUuid,
  unit: z.string().trim().min(1).max(20).default('pcs'),
  allowFractional: z.boolean().default(false),
  sellingPrice: money(),
  costPrice: unitCost().nullish(),
  minStockLevel: quantity('nonnegative').default('0'),
  targetStockLevel: quantity('nonnegative').nullish(),
  reorderMultiple: quantity('positive').nullish(),
  leadTimeDaysOverride: z.coerce.number().int().min(0).max(365).nullish(),
};

export const CreateProductSchema = z
  .object({
    ...productFields,
    openingQuantity: quantity('nonnegative').optional(),
    openingUnitCost: unitCost().optional(),
  })
  .refine((v) => !v.openingQuantity || Number(v.openingQuantity) === 0 || v.openingUnitCost, {
    message: 'sw.openingCostRequired',
    path: ['openingUnitCost'],
  });
export type CreateProductInput = z.input<typeof CreateProductSchema>;

/** Quantity is deliberately absent: stock only changes through movements (docs/02 §1). */
export const UpdateProductSchema = z.object(productFields).partial();
export type UpdateProductInput = z.input<typeof UpdateProductSchema>;

/** Fields that must never appear on a product update. */
export const NON_EDITABLE_PRODUCT_FIELDS = [
  'quantity',
  'quantityOnHand',
  'openingQuantity',
  'openingUnitCost',
] as const;

export const ProductListQuerySchema = PaginationQuerySchema.extend({
  categoryId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  stockStatus: z.enum(STOCK_STATUSES).optional(),
  archived: queryBoolean,
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductLookupQuerySchema = z.object({ code: z.string().trim().min(1).max(64) });
