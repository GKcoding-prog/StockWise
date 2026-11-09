import { z } from 'zod';

type Sign = 'any' | 'nonnegative' | 'positive';

/**
 * A decimal sent as a string ("12.500") or a number, normalised to a string so it never
 * passes through JS floating point on the server. `scale` is the max number of decimals.
 */
export function decimalString(scale: number, sign: Sign = 'any') {
  const pattern = new RegExp(`^-?\\d{1,15}(\\.\\d{1,${scale}})?$`);
  return z
    .union([z.string().trim(), z.number()])
    .transform((v) => (typeof v === 'number' ? String(v) : v))
    .pipe(
      z
        .string()
        .regex(pattern, { message: `sw.decimals${scale}` })
        .refine((v) => sign === 'any' || !v.startsWith('-'), { message: 'sw.notNegative' })
        .refine((v) => sign !== 'positive' || /[1-9]/.test(v), { message: 'sw.positive' }),
    );
}

/** Quantities: Decimal(14,3). */
export const quantity = (sign: Sign = 'any') => decimalString(3, sign);
/** Amounts: Decimal(18,2). */
export const money = (sign: Sign = 'nonnegative') => decimalString(2, sign);
/** Unit costs: Decimal(18,4). */
export const unitCost = (sign: Sign = 'nonnegative') => decimalString(4, sign);

/** Optional free text; empty strings from forms become null. */
export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const uuid = z.uuid();
export const nullableUuid = z
  .union([z.uuid(), z.literal('')])
  .nullish()
  .transform((v) => (v ? v : null));

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.string().max(50).optional(),
  q: z.string().trim().max(100).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Query-string boolean ("true"/"false"/"1"/"0"). z.coerce.boolean treats "false" as true. */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

/** Business-local calendar date, e.g. 2026-11-01. */
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'sw.dateFormat' });

/**
 * Custom validation messages are translation keys ("sw.notNegative"), so the API's
 * VALIDATION_ERROR details and client-side form errors can both be shown in FR or EN.
 */
export const VALIDATION_MESSAGE_PREFIX = 'sw.';
