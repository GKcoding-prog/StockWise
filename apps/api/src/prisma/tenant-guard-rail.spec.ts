import { hasTenantScope } from './tenant-guard-rail';

describe('tenant guard-rail (docs/01 §6, layer 3)', () => {
  const bid = '0b6c3a8e-0000-4000-8000-000000000000';

  it('accepts reads scoped by businessId', () => {
    expect(hasTenantScope('findMany', { where: { businessId: bid, archivedAt: null } })).toBe(true);
    expect(hasTenantScope('findFirst', { where: { id: 'x', businessId: bid } })).toBe(true);
    expect(hasTenantScope('count', { where: { businessId: bid } })).toBe(true);
  });

  it('accepts compound unique keys that contain businessId', () => {
    expect(
      hasTenantScope('findUnique', { where: { businessId_sku: { businessId: bid, sku: 'A' } } }),
    ).toBe(true);
  });

  it('rejects unscoped reads and writes', () => {
    expect(hasTenantScope('findMany', {})).toBe(false);
    expect(hasTenantScope('findUnique', { where: { id: 'x' } })).toBe(false);
    expect(hasTenantScope('updateMany', { where: { id: { in: ['x'] } }, data: {} })).toBe(false);
    expect(hasTenantScope('deleteMany', undefined)).toBe(false);
  });

  it('requires businessId on created rows', () => {
    expect(hasTenantScope('create', { data: { businessId: bid, name: 'A' } })).toBe(true);
    expect(hasTenantScope('create', { data: { name: 'A' } })).toBe(false);
    expect(hasTenantScope('createMany', { data: [{ businessId: bid }, { name: 'B' }] })).toBe(
      false,
    );
    expect(hasTenantScope('createMany', { data: [{ businessId: bid }, { businessId: bid }] })).toBe(
      true,
    );
  });
});
