import type { PermissionKey } from '@stockwise/shared';
import type { Product, SaleDetail, SaleStatus } from '@/lib/types';

type Tone = 'green' | 'amber' | 'red' | 'stone' | 'blue';

export const STATUS_TONE: Record<SaleStatus, Tone> = {
  COMPLETED: 'green',
  PARTIALLY_RETURNED: 'amber',
  RETURNED: 'stone',
  VOIDED: 'red',
};

/** One cart line on the sale screen. Quantity and discount are the raw input text. */
export interface CartLine {
  product: Product;
  quantity: string;
  discount: string;
}

/*
 * Everything below is display arithmetic for the live preview. The server recomputes every
 * amount with exact decimals and its result is what gets saved and printed.
 */

const cents = (v: number) => Math.round(v * 100) / 100;
const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

const QUANTITY = /^\d{1,15}(\.\d{1,3})?$/;
const MONEY = /^\d{1,15}(\.\d{1,2})?$/;

/** Positive, at most 3 decimals, whole if the product isn't sold by fractions. */
export function isValidQuantity(value: string, allowFractional: boolean): boolean {
  const v = value.trim();
  if (!QUANTITY.test(v) || !/[1-9]/.test(v)) return false;
  return allowFractional || Number.isInteger(Number(v));
}

/** Empty (no discount) or a non-negative amount with at most 2 decimals. */
export function isValidMoney(value: string): boolean {
  const v = value.trim();
  return v === '' || MONEY.test(v);
}

export function lineGross(line: CartLine): number {
  return cents(num(line.quantity) * Number(line.product.sellingPrice));
}

export function lineTotal(line: CartLine): number {
  return cents(lineGross(line) - num(line.discount));
}

/** Discount as a percentage of the line, the rule the API applies to Employees. */
export function discountPercent(line: CartLine): number {
  const gross = lineGross(line);
  const discount = num(line.discount);
  if (gross <= 0 || discount <= 0) return 0;
  return (discount / gross) * 100;
}

export function cartTotals(lines: CartLine[]) {
  const subtotal = cents(lines.reduce((acc, l) => acc + lineGross(l), 0));
  const discount = cents(lines.reduce((acc, l) => acc + num(l.discount), 0));
  return { subtotal, discount, total: cents(subtotal - discount) };
}

/** What's wrong with a line, if anything, before the cart can be sent. */
export function lineProblem(
  line: CartLine,
  maxDiscountPercent: number | null,
): 'quantity' | 'discount' | 'discountAboveLine' | 'discountLimit' | null {
  if (!isValidQuantity(line.quantity, line.product.allowFractional)) return 'quantity';
  if (!isValidMoney(line.discount)) return 'discount';
  if (num(line.discount) > lineGross(line)) return 'discountAboveLine';
  if (maxDiscountPercent !== null && discountPercent(line) > maxDiscountPercent + 1e-9) {
    return 'discountLimit';
  }
  return null;
}

/** More than what's on hand. A hint only: the business may allow negative stock. */
export function exceedsStock(line: CartLine): boolean {
  return num(line.quantity) > Number(line.product.quantityOnHand);
}

/** Change for a cash payment, or null while the amount tendered is empty or too low. */
export function changeDue(tendered: string, total: number): number | null {
  if (tendered.trim() === '' || !isValidMoney(tendered)) return null;
  const change = cents(Number(tendered) - total);
  return change >= 0 ? change : null;
}

/** Adds a product, or one more unit of it if it's already in the cart. */
export function addToCart(lines: CartLine[], product: Product): CartLine[] {
  const existing = lines.find((l) => l.product.id === product.id);
  if (!existing) return [...lines, { product, quantity: '1', discount: '' }];
  return lines.map((l) =>
    l === existing && isValidQuantity(l.quantity, true)
      ? { ...l, quantity: trimNumber(Number(l.quantity) + 1) }
      : l,
  );
}

/** 3 → "3", 1.5 → "1.5", 0.1 + 0.2 → "0.3": a number back to friendly input text. */
export function trimNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Which actions a sale allows, mirroring the API (docs/05 §4.11): void only with no returns,
 * returns until everything is back. The server enforces all of this.
 */
export function saleActions(s: SaleDetail, can: (perm: PermissionKey) => boolean) {
  const anyReturnable = s.items.some((i) => Number(i.quantityReturnable) > 0);
  return {
    void: can('sales.void') && s.status === 'COMPLETED' && Number(s.returnedTotal) === 0,
    return: can('sales.return') && s.status !== 'VOIDED' && anyReturnable,
  };
}

/**
 * Refund preview for returning `quantity` more units of a line, rounded the way the API does
 * it (pro rata of the amount paid, so a full return refunds exactly the line total).
 */
export function refundPreview(
  item: Pick<SaleDetail['items'][number], 'lineTotal' | 'quantity' | 'quantityReturned'>,
  quantity: number,
): number {
  const total = Number(item.lineTotal);
  const sold = Number(item.quantity);
  const before = Number(item.quantityReturned);
  const share = (returned: number) => cents((total * returned) / sold);
  return cents(share(before + quantity) - share(before));
}
