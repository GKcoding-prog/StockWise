import { Prisma } from '../generated/prisma/client';

/**
 * Decimal helpers. Quantities and money never go through JS `number` (docs/02 §5).
 * Prisma.Decimal is decimal.js; its toJSON() yields a string, so responses stay exact.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type DecimalLike = Prisma.Decimal | string | number;

export const D = (v: DecimalLike): Decimal => new Prisma.Decimal(v);
export const ZERO = D(0);

export const roundQty = (d: Decimal): Decimal => d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
export const roundMoney = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const roundCost = (d: Decimal): Decimal => d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

export const sum = (values: Decimal[]): Decimal => values.reduce((acc, v) => acc.plus(v), ZERO);

/** Formats with a fixed scale for API responses ("12.500"). */
export const qtyString = (d: Decimal): string => d.toFixed(3);
export const moneyString = (d: Decimal): string => d.toFixed(2);
