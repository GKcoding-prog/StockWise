import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@stockwise/shared';

/**
 * Throw this for business-rule failures. The global filter turns it into
 * `{ error: { code, message, details } }` — the UI translates by `code`.
 *
 *   throw new AppException('INSUFFICIENT_STOCK', HttpStatus.CONFLICT, 'Not enough stock', [...]);
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: HttpStatus,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
