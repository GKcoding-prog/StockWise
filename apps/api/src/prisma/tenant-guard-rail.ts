import { Prisma } from '../generated/prisma/client';

/**
 * Development/test guard-rail (docs/01 §6, layer 3): a query on a tenant model without
 * `businessId` in its top-level `where` (or `data` for creates) throws immediately, so a
 * forgotten scope fails a test instead of leaking another tenant's rows.
 *
 * Not covered: raw SQL (the stock engine scopes those by hand) and nested relation reads,
 * which are reached through an already-scoped parent.
 */
export const TENANT_MODELS = new Set<string>([
  'Warehouse',
  'Category',
  'Supplier',
  'Product',
  'StockLevel',
  'StockMovement',
  'ProductBatch',
  'DocumentSequence',
  'Purchase',
  'PurchaseItem',
  'Sale',
  'SaleItem',
  'Alert',
  'Notification',
  'InventorySnapshot',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

function whereHasTenant(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const w = where as Record<string, unknown>;
  if (typeof w.businessId === 'string') return true;
  // Compound unique inputs such as `businessId_sku: { businessId, sku }`.
  return Object.entries(w).some(
    ([key, value]) =>
      key.startsWith('businessId_') &&
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Record<string, unknown>).businessId === 'string',
  );
}

function dataHasTenant(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(dataHasTenant);
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return typeof d.businessId === 'string' || typeof d.business === 'object';
}

export function hasTenantScope(operation: string, args: unknown): boolean {
  const a = (args ?? {}) as Record<string, unknown>;
  if (CREATE_OPS.has(operation)) return dataHasTenant(a.data);
  if (operation === 'upsert') return whereHasTenant(a.where) && dataHasTenant(a.create);
  return whereHasTenant(a.where);
}

export const tenantGuardRail = Prisma.defineExtension({
  name: 'tenant-guard-rail',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (TENANT_MODELS.has(model) && !hasTenantScope(operation, args)) {
          throw new Error(
            `Tenant guard-rail: ${model}.${operation} must be scoped by businessId (docs/01 §6)`,
          );
        }
        return query(args);
      },
    },
  },
});
