#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

: "${FIREBASE_PROJECT_ID:?FIREBASE_PROJECT_ID is required}"

npm ci --no-audit --no-fund
npm run build:hosting
firebase deploy --only hosting --project "$FIREBASE_PROJECT_ID" --non-interactive

site="$(node -p "require('./firebase.json').hosting.site")"
if [ -n "${ORBIT_URL_FILE:-}" ]; then
  printf 'https://%s.web.app\n' "$site" > "$ORBIT_URL_FILE"
fi
