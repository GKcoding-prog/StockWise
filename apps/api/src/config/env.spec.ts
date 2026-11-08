import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('splits CORS origins', () => {
    const env = validateEnv({ ...valid, CORS_ORIGINS: 'https://a.bi, https://b.bi' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.bi', 'https://b.bi']);
  });

  it('rejects short secrets with a readable message', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET: must be at least 32 characters/,
    );
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
