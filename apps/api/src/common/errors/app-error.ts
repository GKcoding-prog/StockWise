import { HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@stockwise/shared';

const STATUS_BY_CODE: Partial<Record<ErrorCode, HttpStatus>> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  FRACTIONAL_QUANTITY_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  INVALID_STATE_TRANSITION: HttpStatus.BAD_REQUEST,
  QUANTITY_NOT_EDITABLE: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  TOKEN_EXPIRED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  REFRESH_TOKEN_REUSED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  PLAN_UPGRADE_REQUIRED: HttpStatus.FORBIDDEN,
  DISCOUNT_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  LAST_OWNER: HttpStatus.FORBIDDEN,
  CANNOT_MODIFY_SELF: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  SKU_TAKEN: HttpStatus.CONFLICT,
  BARCODE_TAKEN: HttpStatus.CONFLICT,
  NAME_TAKEN: HttpStatus.CONFLICT,
  CATEGORY_IN_USE: HttpStatus.CONFLICT,
  INSUFFICIENT_STOCK: HttpStatus.CONFLICT,
  OVER_RECEIPT: HttpStatus.CONFLICT,
  OVER_RETURN: HttpStatus.CONFLICT,
  ALREADY_VOIDED: HttpStatus.CONFLICT,
  HAS_RETURNS: HttpStatus.CONFLICT,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  TOKEN_EXPIRED_OR_USED: HttpStatus.GONE,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Business error with a stable code (docs/05 §2). `message` is an English fallback for
 * developers; the UI translates by `code`.
 */
export class AppError extends Error {
  readonly status: HttpStatus;

  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.status = STATUS_BY_CODE[code] ?? HttpStatus.BAD_REQUEST;
  }

  static notFound(entity = 'Resource'): AppError {
    return new AppError('NOT_FOUND', `${entity} not found`);
  }

  static forbidden(message = 'You do not have permission to do this'): AppError {
    return new AppError('FORBIDDEN', message);
  }
}
