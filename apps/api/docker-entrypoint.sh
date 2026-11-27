#!/bin/sh
# Container start-up for the local Docker stack (docker-compose.yml, profile "app"):
# apply migrations, seed, then start the API.
set -e

# Local tools (prisma, and tsx for the seed command in prisma.config.ts) aren't on the PATH in
# the container the way they are inside `pnpm` scripts.
export PATH="$PWD/node_modules/.bin:$PATH"

echo "▶ Applying database migrations…"
prisma migrate deploy

# Always seeds roles and permissions (the app needs them). Also loads the demo shop unless
# SEED_DEMO=false. Idempotent: an existing demo business is skipped.
echo "▶ Seeding…"
prisma db seed

echo "▶ Starting the API on port ${PORT:-3000}"
exec node dist/main.js
