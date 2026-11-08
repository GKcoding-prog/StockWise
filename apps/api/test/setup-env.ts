import 'dotenv/config';

// Defaults so the e2e suite runs with just `pnpm db:up` and no .env file.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://stockwise:stockwise@localhost:5432/stockwise';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-test-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret-000';
