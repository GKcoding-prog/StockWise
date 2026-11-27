#!/bin/sh
# Container start-up for the local Docker stack (docker-compose.yml, profile "app"):
# apply migrations, seed, then start the API.
set -e

echo "▶ Applying database migrations…"
./node_modules/.bin/prisma migrate deploy

# Always seeds roles and permissions (the app needs them). Also loads the demo shop unless
# SEED_DEMO=false. Idempotent: an existing demo business is skipped.
echo "▶ Seeding…"
./node_modules/.bin/prisma db seed

echo "▶ Starting the API on port ${PORT:-3000}"
exec node dist/main.js
