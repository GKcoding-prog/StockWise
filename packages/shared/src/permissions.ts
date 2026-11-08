/**
 * Permission catalogue — single source of truth for backend guards, the database
 * seed and frontend <Can> checks. Mirrors docs/03-roles-and-use-cases.md §2.
 */
export const PERMISSIONS = {
  'business.manage': 'Edit business profile, currency, locale and settings',
  'business.plan': 'View and change subscription plan',
  'users.view': 'See members and invitations',
  'users.invite': 'Invite users (managers: employee role only)',
  'users.manage': 'Change roles, suspend or remove members',
  'audit.view': 'View the activity / audit log',
  'warehouses.manage': 'Manage locations',
  'products.view': 'View products and stock',
  'products.view_cost': 'See purchase prices, average cost, margins and inventory value',
  'products.manage': 'Create, edit and archive products; set thresholds',
  'categories.manage': 'Manage categories',
  'suppliers.view': 'View suppliers',
  'suppliers.manage': 'Create, edit and archive suppliers',
  'purchases.view': 'View purchases',
  'purchases.manage': 'Create, edit, order and cancel purchases',
  'purchases.receive': 'Record goods received',
  'purchases.return': 'Return goods to supplier',
  'sales.create': 'Record sales',
  'sales.view_all': "See everyone's sales (otherwise own sales only)",
  'sales.discount_unlimited': 'Give discounts above the employee limit',
  'sales.void': 'Void a sale',
  'sales.return': 'Record customer returns',
  'inventory.view_movements': 'View stock movement history',
  'inventory.adjust': 'Manual adjustments and stock counts',
  'inventory.write_off': 'Record damaged or expired goods',
  'analytics.view': 'Dashboard financials, recommendations, slow movers',
  'reports.export': 'Generate and download reports',
  'alerts.view': 'See stock alerts',
  'alerts.manage': 'Acknowledge and resolve alerts; review flagged adjustments',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES = ['OWNER', 'MANAGER', 'EMPLOYEE'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const OWNER_ONLY: Permission[] = [
  'business.manage',
  'business.plan',
  'users.manage',
  'audit.view',
  'warehouses.manage',
];

const EMPLOYEE: Permission[] = [
  'products.view',
  'suppliers.view',
  'purchases.view',
  'purchases.receive',
  'sales.create',
  'inventory.view_movements',
  'inventory.write_off',
  'alerts.view',
];

/** Default permission set of each system role. */
export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  MANAGER: ALL_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p)),
  EMPLOYEE,
};

export function roleHasPermission(role: SystemRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
