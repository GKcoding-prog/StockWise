/**
 * Permission keys and the system-role matrix (docs/03 §2).
 * The backend enforces these; the frontend uses them only to hide or disable UI.
 */
export const PERMISSIONS = {
  'business.manage': {
    group: 'business',
    description: 'Edit business profile, currency, locale, settings',
  },
  'business.plan': { group: 'business', description: 'View and change subscription plan' },
  'users.view': { group: 'users', description: 'See members and invitations' },
  'users.invite': { group: 'users', description: 'Invite users (Manager: Employee role only)' },
  'users.manage': { group: 'users', description: 'Change roles, suspend, remove members' },
  'audit.view': { group: 'users', description: 'View the activity / audit log' },
  'warehouses.manage': { group: 'inventory', description: 'Manage locations' },
  'products.view': { group: 'products', description: 'View products and stock' },
  'products.view_cost': {
    group: 'products',
    description: 'See purchase price, average cost, margins, inventory value',
  },
  'products.manage': {
    group: 'products',
    description: 'Create, edit, archive products; set thresholds',
  },
  'categories.manage': { group: 'products', description: 'Manage categories' },
  'suppliers.view': { group: 'suppliers', description: 'View suppliers' },
  'suppliers.manage': { group: 'suppliers', description: 'Create, edit, archive suppliers' },
  'purchases.view': { group: 'purchases', description: 'View purchases' },
  'purchases.manage': { group: 'purchases', description: 'Create, edit, order, cancel purchases' },
  'purchases.receive': { group: 'purchases', description: 'Record goods received' },
  'purchases.return': { group: 'purchases', description: 'Return goods to supplier' },
  'sales.create': { group: 'sales', description: 'Record sales' },
  'sales.view_all': { group: 'sales', description: 'See all sales (Employees see only their own)' },
  'sales.discount_unlimited': {
    group: 'sales',
    description: 'Discount beyond employeeMaxDiscountPercent',
  },
  'sales.void': { group: 'sales', description: 'Void a sale' },
  'sales.return': { group: 'sales', description: 'Record customer returns' },
  'inventory.view_movements': { group: 'inventory', description: 'View stock movement history' },
  'inventory.adjust': { group: 'inventory', description: 'Manual adjustments and stock counts' },
  'inventory.write_off': {
    group: 'inventory',
    description: 'Record damaged / expired goods (reason required)',
  },
  'analytics.view': {
    group: 'analytics',
    description: 'Dashboard financials, recommendations, slow movers',
  },
  'reports.export': { group: 'analytics', description: 'Generate and download reports' },
  'alerts.view': { group: 'alerts', description: 'See stock alerts' },
  'alerts.manage': {
    group: 'alerts',
    description: 'Acknowledge/resolve alerts; review flagged adjustments',
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const SYSTEM_ROLES = ['OWNER', 'MANAGER', 'EMPLOYEE'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLES)[number];

const MANAGER_DENIED: PermissionKey[] = [
  'business.manage',
  'business.plan',
  'users.manage',
  'audit.view',
  'warehouses.manage',
];

const EMPLOYEE_ALLOWED: PermissionKey[] = [
  'products.view',
  'suppliers.view',
  'purchases.view',
  'purchases.receive',
  'sales.create',
  'inventory.view_movements',
  'inventory.write_off',
  'alerts.view',
];

export const ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  OWNER: [...PERMISSION_KEYS],
  MANAGER: PERMISSION_KEYS.filter((k) => !MANAGER_DENIED.includes(k)),
  EMPLOYEE: EMPLOYEE_ALLOWED,
};

export const ROLE_NAMES: Record<SystemRoleKey, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};
