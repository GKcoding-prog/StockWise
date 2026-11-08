import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  parseBusinessSettings,
  roleHasPermission,
} from './index';

describe('role permissions (docs/03 §2)', () => {
  it('gives the owner every permission', () => {
    expect([...ROLE_PERMISSIONS.OWNER].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('keeps business settings, user management and audit owner-only', () => {
    for (const p of ['business.manage', 'users.manage', 'audit.view'] as const) {
      expect(roleHasPermission('MANAGER', p)).toBe(false);
      expect(roleHasPermission('EMPLOYEE', p)).toBe(false);
    }
  });

  it('lets managers invite but not employees', () => {
    expect(roleHasPermission('MANAGER', 'users.invite')).toBe(true);
    expect(roleHasPermission('EMPLOYEE', 'users.invite')).toBe(false);
  });

  it('lets employees sell and receive goods but not see costs or void sales', () => {
    expect(roleHasPermission('EMPLOYEE', 'sales.create')).toBe(true);
    expect(roleHasPermission('EMPLOYEE', 'purchases.receive')).toBe(true);
    expect(roleHasPermission('EMPLOYEE', 'products.view_cost')).toBe(false);
    expect(roleHasPermission('EMPLOYEE', 'sales.void')).toBe(false);
  });

  it('only references known permissions', () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      for (const p of perms) expect(ALL_PERMISSIONS).toContain(p);
    }
  });
});

describe('business settings', () => {
  it('fills every default from an empty object', () => {
    const s = parseBusinessSettings({});
    expect(s.allowNegativeStock).toBe(false);
    expect(s.analysis.salesWindowDays).toBe(30);
    expect(s.analysis.safetyStockDays).toBe(3);
    expect(s.anomaly.valueThreshold).toBe(100_000);
  });

  it('keeps provided values and fills the rest', () => {
    const s = parseBusinessSettings({ analysis: { salesWindowDays: 60 } });
    expect(s.analysis.salesWindowDays).toBe(60);
    expect(s.analysis.reviewPeriodDays).toBe(14);
  });

  it('rejects out-of-range values', () => {
    expect(() => parseBusinessSettings({ employeeMaxDiscountPercent: 150 })).toThrow();
  });
});
