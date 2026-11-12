import type { MovementType, PermissionKey, Plan, StockStatus } from '@stockwise/shared';

/** GET /me — drives navigation, permissions and formatting. */
export interface Me {
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    locale: string | null;
  };
  business: {
    id: string;
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    plan: Plan;
  } | null;
  role: { id: string; key: string; name: string } | null;
  permissions: PermissionKey[];
  features: string[];
  memberships: { businessId: string; businessName: string; role: { key: string; name: string } }[];
}

export interface Ref {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  unit: string;
  allowFractional: boolean;
  sellingPrice: string;
  minStockLevel: string;
  targetStockLevel: string | null;
  reorderMultiple: string | null;
  leadTimeDaysOverride: number | null;
  category: Ref | null;
  defaultSupplier: (Ref & { leadTimeDays: number }) | null;
  quantityOnHand: string;
  stockStatus: StockStatus;
  lastMovementAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Only with products.view_cost
  costPrice?: string | null;
  averageCost?: string;
  stockValue?: string;
}

export interface ProductDetail extends Product {
  stockByWarehouse: {
    warehouseId: string;
    warehouseName: string;
    quantityOnHand: string;
    averageCost?: string;
  }[];
  velocity: {
    daysOfHistory: number;
    windows: { days: number; netSold: string; averageDailySales: string }[];
  };
}

export interface Movement {
  id: string;
  seq: string;
  type: MovementType;
  productId: string;
  quantityChange: string;
  quantityBefore: string;
  quantityAfter: string;
  reason: string | null;
  note: string | null;
  documentRef: string | null;
  isFlagged: boolean;
  flagReasons: string[];
  occurredAt: string;
  product?: { id: string; name: string; sku: string; unit: string };
  user?: { id: string; fullName: string };
  sale?: { id: string; reference: string } | null;
  purchase?: { id: string; reference: string } | null;
  unitCost?: string;
  averageCostAfter?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  parent: Ref | null;
  productCount: number;
  archivedAt: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nif: string | null;
  leadTimeDays: number;
  notes: string | null;
  archivedAt: string | null;
  productCount?: number;
  openPurchases?: { count: number; value?: string };
}

export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

/** GET /purchases row. `total` only with products.view_cost. */
export interface PurchaseSummary {
  id: string;
  reference: string;
  status: PurchaseStatus;
  supplier: Ref;
  itemCount: number;
  orderedAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string; unit: string; allowFractional: boolean };
  quantityOrdered: string;
  quantityReceived: string;
  quantityReturned: string;
  quantityRemaining: string;
  // Only with products.view_cost
  unitCost?: string;
  lineTotal?: string;
}

export interface PurchaseDetail extends Omit<PurchaseSummary, 'supplier' | 'itemCount'> {
  supplier: Ref & { phone: string | null; leadTimeDays: number };
  createdBy: { id: string; fullName: string };
  items: PurchaseItem[];
}
