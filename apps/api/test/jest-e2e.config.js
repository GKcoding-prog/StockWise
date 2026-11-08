/**
 * API tests against a real PostgreSQL database (Supertest).
 * Needs DATABASE_URL — locally `pnpm db:up`, in CI a Postgres service container.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  setupFiles: ['<rootDir>/setup-env.ts'],
};
