import type { PermissionKey } from '@stockwise/shared';
import type { PurchaseDetail, PurchaseStatus } from '@/lib/types';

type Tone = 'green' | 'amber' | 'red' | 'stone' | 'blue';

export const STATUS_TONE: Record<PurchaseStatus, Tone> = {
  DRAFT: 'stone',
  ORDERED: 'blue',
  PARTIALLY_RECEIVED: 'amber',
  RECEIVED: 'green',
  CANCELLED: 'red',
};

const isPositive = (v: string) => /[1-9]/.test(v) && !v.trim().startsWith('-');

/**
 * Which actions a purchase allows, mirroring the API's status machine (docs/05 §4.10).
 * The server enforces all of this; the UI only hides buttons that would fail.
 */
export function purchaseActions(p: PurchaseDetail, can: (perm: PermissionKey) => boolean) {
  const anyReceived = p.items.some((i) => isPositive(i.quantityReceived));
  const anyReturnable = p.items.some(
    (i) => Number(i.quantityReceived) - Number(i.quantityReturned) > 0,
  );
  return {
    edit:
      can('purchases.manage') && (p.status === 'DRAFT' || p.status === 'ORDERED') && !anyReceived,
    order: can('purchases.manage') && p.status === 'DRAFT',
    receive:
      can('purchases.receive') && (p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED'),
    cancel:
      can('purchases.manage') && ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(p.status),
    return: can('purchases.return') && anyReturnable,
  };
}

/** True when an open order is past its expected delivery date. */
export function isOverdue(
  p: Pick<PurchaseDetail, 'status' | 'expectedAt'>,
  now: Date = new Date(),
): boolean {
  return (
    (p.status === 'ORDERED' || p.status === 'PARTIALLY_RECEIVED') &&
    !!p.expectedAt &&
    new Date(p.expectedAt).getTime() < now.getTime()
  );
}

/**
 * Line total for the form's live preview only. The server recomputes every amount with exact
 * decimals; this is display arithmetic, so floating point is acceptable here.
 */
export function previewLineTotal(quantity: string, unitCost: string): number | null {
  const q = Number(quantity);
  const c = Number(unitCost);
  if (quantity.trim() === '' || unitCost.trim() === '' || Number.isNaN(q) || Number.isNaN(c)) {
    return null;
  }
  return Math.round(q * c * 100) / 100;
}

/** "24.000" → "24", "1250.5000" → "1250.5", "100" → "100": API decimals as friendly input text. */
export function trimDecimal(value: string | null | undefined): string {
  if (!value) return '';
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}

/** New Idempotency-Key. Falls back where crypto.randomUUID is missing (plain-http LAN testing). */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
