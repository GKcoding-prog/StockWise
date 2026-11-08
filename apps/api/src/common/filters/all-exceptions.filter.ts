import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@stockwise/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../app.exception';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

interface Normalized {
  status: number;
  body: ApiErrorBody['error'];
}

/** Converts any thrown error into the API's single error format (docs/05 §2). */
export function normalizeError(exception: unknown): Normalized {
  if (exception instanceof AppException) {
    return {
      status: exception.getStatus(),
      body: { code: exception.code, message: exception.message, details: exception.details },
    };
  }

  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'CONFLICT', message: 'A record with these values already exists' },
      };
    }
    if (exception.code === 'P2025') {
      return { status: HttpStatus.NOT_FOUND, body: { code: 'NOT_FOUND', message: 'Not found' } };
    }
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return {
      status,
      body: {
        code: STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR'),
        message: exception.message,
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { status, body } = normalizeError(exception);

    if (status >= 500) {
      // Full details go to the logs only — never to the client.
      this.logger.error(`${req.method} ${req.url}`, (exception as Error)?.stack ?? exception);
    }

    const requestId = req.headers['x-request-id'];
    res.status(status).json({
      error: { ...body, ...(typeof requestId === 'string' ? { requestId } : {}) },
    } satisfies ApiErrorBody);
  }
}
