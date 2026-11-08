import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads the connection URL from here, not from schema.prisma.
// `prisma generate` doesn't need a database, so fall back to the local dev URL
// to let it run in a fresh clone or in CI without a .env file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://stockwise:stockwise@localhost:5432/stockwise',
  },
});
