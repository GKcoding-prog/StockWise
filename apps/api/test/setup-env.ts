import 'dotenv/config';

// E2E suites run against a separate database so they never wipe development data.
const testUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://stockwise:stockwise@localhost:5433/stockwise_test';
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.THROTTLE_ENABLED = 'false';
process.env.TENANT_GUARD_RAIL = 'true';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
