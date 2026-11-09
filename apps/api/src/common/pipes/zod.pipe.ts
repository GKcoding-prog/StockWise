import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error';

/**
 * Validates and transforms a request part with a shared Zod schema.
 * Usage: `@Body(new ZodPipe(CreateProductSchema)) body: Out<typeof CreateProductSchema>`
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Request validation failed',
        result.error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          message: i.message,
        })),
      );
    }
    return result.data;
  }
}

export type Out<S extends z.ZodType> = z.output<S>;
