// Creates prisma/migrations/<timestamp>_integrity_guards/migration.sql from
// prisma/sql/integrity_guards.sql, unless a migration with that name already exists.
// Run once, right after the initial migration (`pnpm db:init` does this for you).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'prisma', 'migrations');
const source = join(root, 'prisma', 'sql', 'integrity_guards.sql');

const existing = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];
if (!existing.some((name) => /^\d{14}_init$/.test(name))) {
  console.error('No *_init migration found. Run the initial migration first (pnpm db:init).');
  process.exit(1);
}
if (existing.some((name) => name.endsWith('_integrity_guards'))) {
  console.log('Integrity guards migration already exists — nothing to do.');
  process.exit(0);
}

// Prisma orders migrations by folder name: YYYYMMDDHHMMSS_<name>.
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const target = join(migrationsDir, `${stamp}_integrity_guards`);
mkdirSync(target);
copyFileSync(source, join(target, 'migration.sql'));
console.log(`Created ${target}/migration.sql`);
