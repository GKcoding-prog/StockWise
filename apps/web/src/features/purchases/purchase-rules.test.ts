import type { PermissionKey } from '@stockwise/shared';
import type { PurchaseDetail, PurchaseStatus } from '@/lib/types';
import {
  isOverdue,
  newIdempotencyKey,
  previewLineTotal,
  purchaseActions,
  trimDecimal,
} from './purchase-rules';

const purchase = (
  status: PurchaseStatus,
  items: { received: string; returned?: string }[] = [{ received: '0.000' }],
): PurchaseDetail =>
  ({
    status,
    expectedAt: null,
    items: items.map((i, n) => ({
      id: `i${n}`,
      quantityOrdered: '10.000',
      quantityReceived: i.received,
      quantityReturned: i.returned ?? '0.000',
      quantityRemaining: '0.000',
    })),
  }) as unknown as PurchaseDetail;

const roles: Record<string, PermissionKey[]> = {
  manager: ['purchases.manage', 'purchases.receive', 'purchases.return'],
  employee: ['purchases.receive'],
};
const canAs = (role: keyof typeof roles) => (p: PermissionKey) => roles[role].includes(p);

describe('trimDecimal', () => {
  it.each([
    ['24.000', '24'],
    ['1250.5000', '1250.5'],
    ['0.250', '0.25'],
    ['100', '100'],
    ['', ''],
    [null, ''],
  ])('%s → %s', (input, expected) => {
    expect(trimDecimal(input)).toBe(expected);
  });
});

describe('previewLineTotal', () => {
  it('multiplies quantity by cost, rounded to cents', () => {
    expect(previewLineTotal('24', '1250')).toBe(30000);
    expect(previewLineTotal('3', '2500.5')).toBe(7501.5);
  });
  it('is empty until both values are numbers', () => {
    expect(previewLineTotal('', '1250')).toBeNull();
    expect(previewLineTotal('2', 'abc')).toBeNull();
  });
});

describe('purchaseActions (mirrors docs/05 §4.10)', () => {
  it('drafts can be edited and ordered, not received', () => {
    expect(purchaseActions(purchase('DRAFT'), canAs('manager'))).toMatchObject({
      edit: true,
      order: true,
      receive: false,
      cancel: true,
      return: false,
    });
  });

  it('ordered purchases can be received; editing stops after the first receipt', () => {
    expect(purchaseActions(purchase('ORDERED'), canAs('manager'))).toMatchObject({
      edit: true,
      receive: true,
    });
    const partial = purchase('PARTIALLY_RECEIVED', [{ received: '4.000' }]);
    expect(purchaseActions(partial, canAs('manager'))).toMatchObject({
      edit: false,
      receive: true,
      cancel: true,
      return: true,
    });
  });

  it('received purchases only allow returns, until everything went back', () => {
    const received = purchase('RECEIVED', [{ received: '10.000' }]);
    expect(purchaseActions(received, canAs('manager'))).toMatchObject({
      receive: false,
      cancel: false,
      return: true,
    });
    const allBack = purchase('RECEIVED', [{ received: '10.000', returned: '10.000' }]);
    expect(purchaseActions(allBack, canAs('manager')).return).toBe(false);
  });

  it('employees can only receive', () => {
    expect(purchaseActions(purchase('ORDERED'), canAs('employee'))).toEqual({
      edit: false,
      order: false,
      receive: true,
      cancel: false,
      return: false,
    });
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('flags open orders past their expected date', () => {
    expect(isOverdue({ status: 'ORDERED', expectedAt: '2026-11-10T22:00:00Z' }, now)).toBe(true);
    expect(isOverdue({ status: 'ORDERED', expectedAt: '2026-11-13T22:00:00Z' }, now)).toBe(false);
  });
  it('never flags received or cancelled purchases', () => {
    expect(isOverdue({ status: 'RECEIVED', expectedAt: '2026-11-01T22:00:00Z' }, now)).toBe(false);
    expect(isOverdue({ status: 'CANCELLED', expectedAt: '2026-11-01T22:00:00Z' }, now)).toBe(false);
  });
});

describe('newIdempotencyKey', () => {
  it('produces distinct keys the API accepts', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  });
});
