import { z, ZodError } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ quantity: z.coerce.number().positive(), note: z.string().optional() }),
  );

  it('returns the parsed value', () => {
    expect(pipe.transform({ quantity: '3' })).toEqual({ quantity: 3 });
  });

  it('throws a ZodError on invalid input', () => {
    expect(() => pipe.transform({ quantity: -1 })).toThrow(ZodError);
  });
});
