import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { ApiErrorBody, ErrorCode } from '@stockwise/shared';
import type { Response } from 'express';
import { ClsServiceManager } from 'nestjs-cls';
import { isProduction } from '../../config/env';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../errors/app-error';

/** Every error leaves the API as `{ error: { code, message, details, requestId } }`. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, code, message, details } = this.toError(exception);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    let requestId: string | undefined;
    try {
      requestId = ClsServiceManager.getClsService().getId() ?? undefined;
    } catch {
      requestId = undefined;
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message: status >= 500 && isProduction() ? 'Internal server error' : message,
        ...(details !== undefined ? { details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
    if (status === HttpStatus.TOO_MANY_REQUESTS) res.setHeader('Retry-After', '60');
    res.status(status).json(body);
  }

  private toError(e: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
  } {
    if (e instanceof AppError) {
      return { status: e.status, code: e.code, message: e.message, details: e.details };
    }
    if (e instanceof ThrottlerException) {
      return { status: 429, code: 'RATE_LIMITED', message: 'Too many requests' };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return { status: 404, code: 'NOT_FOUND', message: 'Resource not found' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code: ErrorCode =
        status === 404
          ? 'NOT_FOUND'
          : status === 401
            ? 'UNAUTHENTICATED'
            : status === 403
              ? 'FORBIDDEN'
              : status === 429
                ? 'RATE_LIMITED'
                : status >= 500
                  ? 'INTERNAL_ERROR'
                  : 'VALIDATION_ERROR';
      return { status, code, message: e.message };
    }
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: e instanceof Error ? e.message : 'Internal server error',
    };
  }
}
