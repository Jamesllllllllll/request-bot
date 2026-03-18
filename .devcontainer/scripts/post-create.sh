#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
fi

if [ ! -f package.json ]; then
  exit 0
fi

npm install
npx playwright install --with-deps chromium

if [ -f wrangler.jsonc ]; then
  npm run cf-typegen || true
fi
