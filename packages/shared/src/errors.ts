/** Error codes returned by the API (docs/05 §2). The UI translates by code. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'FRACTIONAL_QUANTITY_NOT_ALLOWED',
  'INVALID_STATE_TRANSITION',
  'QUANTITY_NOT_EDITABLE',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'REFRESH_TOKEN_REUSED',
  'FORBIDDEN',
  'PLAN_UPGRADE_REQUIRED',
  'DISCOUNT_NOT_ALLOWED',
  'LAST_OWNER',
  'CANNOT_MODIFY_SELF',
  'NOT_FOUND',
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
  'IDEMPOTENCY_KEY_REQUIRED',
  'TOKEN_EXPIRED_OR_USED',
  'RATE_LIMITED',
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
