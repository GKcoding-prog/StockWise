import { describe, expect, it } from 'vitest';
import { parseBusinessSettings } from './business-settings';
import { ROLE_PERMISSIONS } from './permissions';
import { CreateProductSchema, UpdateProductSchema } from './schemas/catalogue';
import { quantity } from './schemas/common';

describe('role matrix (docs/03 §2)', () => {
  it('gives Owner every permission', () => {
    expect(ROLE_PERMISSIONS.OWNER).toHaveLength(29);
  });

  it('keeps business settings, user management and audit away from Managers', () => {
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('business.manage');
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('users.manage');
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('audit.view');
    expect(ROLE_PERMISSIONS.MANAGER).toContain('users.invite');
    expect(ROLE_PERMISSIONS.MANAGER).toContain('sales.void');
  });

  it('hides costs, voids and reports from Employees', () => {
    expect(ROLE_PERMISSIONS.EMPLOYEE).not.toContain('products.view_cost');
    expect(ROLE_PERMISSIONS.EMPLOYEE).not.toContain('sales.void');
    expect(ROLE_PERMISSIONS.EMPLOYEE).not.toContain('reports.export');
    expect(ROLE_PERMISSIONS.EMPLOYEE).toContain('inventory.write_off');
    expect(ROLE_PERMISSIONS.EMPLOYEE).toContain('purchases.receive');
  });
});

describe('decimal strings', () => {
  it('normalises numbers to strings without float drift', () => {
    expect(quantity().parse(1.5)).toBe('1.5');
    expect(quantity().parse(' 12.500 ')).toBe('12.500');
  });

  it('enforces scale and sign', () => {
    expect(quantity().safeParse('1.2345').success).toBe(false);
    expect(quantity('nonnegative').safeParse('-1').success).toBe(false);
    expect(quantity('positive').safeParse('0.000').success).toBe(false);
    expect(quantity('positive').safeParse('0.001').success).toBe(true);
    expect(quantity().safeParse('1e5').success).toBe(false);
  });
});

describe('products', () => {
  it('requires an opening unit cost with an opening quantity', () => {
    const base = { name: 'Sugar 1 kg', sellingPrice: '3500' };
    expect(CreateProductSchema.safeParse({ ...base, openingQuantity: '10' }).success).toBe(false);
    expect(
      CreateProductSchema.safeParse({ ...base, openingQuantity: '10', openingUnitCost: '2800' })
        .success,
    ).toBe(true);
  });

  it('has no quantity field on update', () => {
    expect(Object.keys(UpdateProductSchema.shape)).not.toContain('quantityOnHand');
  });
});

describe('business settings', () => {
  it('fills nested defaults from an empty object', () => {
    const s = parseBusinessSettings({});
    expect(s.allowNegativeStock).toBe(false);
    expect(s.analysis.salesWindowDays).toBe(30);
    expect(s.anomaly.valueThreshold).toBe(100_000);
  });
});
