#!/usr/bin/env bash
# Publish the static Demo_Ecom release marker to this product's own Firebase
# Hosting site. The shop itself is not hosted: it runs locally with Node.js
# and PostgreSQL. This script never reads or passes a token; the Firebase CLI
# is already signed in when Orbit runs it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi

npm run build:hosting

PROJECT="${FIREBASE_PROJECT_ID:-fir-ecom-b0dfe}"
SITE="fir-ecom-f5081"

if [ -n "${FIREBASE_CHANNEL:-}" ]; then
  CHANNEL_LOG="$(mktemp)"
  firebase hosting:channel:deploy "$FIREBASE_CHANNEL" \
    --project "$PROJECT" \
    --expires 7d \
    --json > "$CHANNEL_LOG"
  URL="$(jq -r '[.. | objects | .url? // empty] | map(select(type == "string")) | .[0] // empty' "$CHANNEL_LOG")"
  if [ -z "$URL" ]; then
    URL="https://${SITE}--${FIREBASE_CHANNEL}.web.app"
  fi
else
  firebase deploy --only hosting --project "$PROJECT"
  URL="https://${SITE}.web.app"
fi

if [ -n "${ORBIT_URL_FILE:-}" ]; then
  printf '%s\n' "$URL" > "$ORBIT_URL_FILE"
fi
printf '%s\n' "$URL"
