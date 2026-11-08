import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates and parses a request body/query/param with a Zod schema from
 * @stockwise/shared, so frontend and backend use the same rules.
 *
 *   @Post()
 *   create(@Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductInput) {}
 *
 * Failures throw ZodError, which the global filter turns into VALIDATION_ERROR.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
