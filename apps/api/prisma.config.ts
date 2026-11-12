import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` runs on `pnpm install`, before apps/api/.env exists in a fresh clone.
    // It doesn't connect, so fall back to the docker-compose URL instead of failing the install.
    url: process.env.DATABASE_URL ?? 'postgresql://stockwise:stockwise@localhost:5433/stockwise',
  },
});
