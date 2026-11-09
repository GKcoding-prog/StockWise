/** Mirrors of the Prisma enums, for use in the web app and in Zod schemas. */
export const PLANS = ['STARTER', 'BUSINESS', 'PRO'] as const;
export type Plan = (typeof PLANS)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MOVEMENT_TYPES = [
  'OPENING_BALANCE',
  'PURCHASE_RECEIPT',
  'SUPPLIER_RETURN',
  'SALE',
  'SALE_VOID',
  'CUSTOMER_RETURN',
  'ADJUSTMENT',
  'WRITE_OFF',
  'TRANSFER_IN',
  'TRANSFER_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PURCHASE_STATUSES = [
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const SALE_STATUSES = ['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'VOIDED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ALERT_TYPES = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'UNUSUAL_ADJUSTMENT',
  'PURCHASE_OVERDUE',
  'EXPIRY_APPROACHING',
  'RECONCILIATION_MISMATCH',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const STOCK_STATUSES = ['OK', 'LOW', 'OUT'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const WRITE_OFF_REASONS = ['DAMAGED', 'EXPIRED', 'LOST', 'OTHER'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export const ADJUSTMENT_REASONS = [
  'COUNT_CORRECTION',
  'FOUND',
  'THEFT_OR_LOSS',
  'DATA_ENTRY_ERROR',
  'OTHER',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
