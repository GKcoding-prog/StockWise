/**
 * Error codes returned by the API as `{ error: { code, message, details } }`.
 * The frontend translates by code (docs/05-api-spec.md §2).
 */
export const ERROR_CODES = [
  // 400
  'VALIDATION_ERROR',
  'FRACTIONAL_QUANTITY_NOT_ALLOWED',
  'INVALID_STATE_TRANSITION',
  // 401
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'REFRESH_TOKEN_REUSED',
  // 403
  'FORBIDDEN',
  'PLAN_UPGRADE_REQUIRED',
  'DISCOUNT_NOT_ALLOWED',
  'LAST_OWNER',
  'CANNOT_MODIFY_SELF',
  // 404
  'NOT_FOUND',
  // 409
  'CONFLICT',
  'EMAIL_TAKEN',
  'SKU_TAKEN',
  'BARCODE_TAKEN',
  'NAME_TAKEN',
  'CATEGORY_IN_USE',
  'INSUFFICIENT_STOCK',
  'OVER_RECEIPT',
  'OVER_RETURN',
  'ALREADY_VOIDED',
  'HAS_RETURNS',
  'IDEMPOTENCY_CONFLICT',
  // 410
  'TOKEN_EXPIRED_OR_USED',
  // 429
  'RATE_LIMITED',
  // 500
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
