import { HttpStatus, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppException } from '../app.exception';
import { normalizeError } from './all-exceptions.filter';

describe('normalizeError', () => {
  it('keeps the code and details of an AppException', () => {
    const details = [{ productId: 'p1', available: '3.000' }];
    const r = normalizeError(
      new AppException('INSUFFICIENT_STOCK', HttpStatus.CONFLICT, 'Not enough stock', details),
    );
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ code: 'INSUFFICIENT_STOCK', message: 'Not enough stock', details });
  });

  it('turns Zod errors into VALIDATION_ERROR with field paths', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    const r = normalizeError(result.error);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
    expect(r.body.details).toEqual([{ path: 'name', message: expect.any(String) }]);
  });

  it('maps Prisma unique violations to 409 CONFLICT', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(normalizeError(err)).toMatchObject({ status: 409, body: { code: 'CONFLICT' } });
  });

  it('maps Nest HTTP exceptions by status', () => {
    expect(normalizeError(new NotFoundException()).body.code).toBe('NOT_FOUND');
  });

  it('hides unknown errors behind INTERNAL_ERROR', () => {
    const r = normalizeError(new Error('database password is hunter2'));
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
});
