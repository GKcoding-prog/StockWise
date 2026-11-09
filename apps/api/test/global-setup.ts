import 'dotenv/config';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

/** Applies all migrations (including integrity_guards) to the test database once per run. */
export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://stockwise:stockwise@localhost:5433/stockwise_test';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
