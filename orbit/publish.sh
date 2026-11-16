#!/usr/bin/env bash
# Publish the Demo_Ecom release marker to its own Firebase Hosting site.
#
# The shop itself runs locally with Node.js and PostgreSQL. This script deploys
# the small deterministic static page in hosting/ so Orbit's release check has a
# stable URL. It never reads a token from the environment: the Firebase CLI is
# already signed in when Orbit starts it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

read_json() {
  node -e "const c=require('./firebase.json');process.stdout.write(String(c.hosting[process.argv[1]]))" "$1"
}

DECLARED_SITE="$(read_json site)"
# The legacy Setup value demo-ecom is reserved globally, so the validated,
# available site id from firebase.json always wins.
SITE="${DECLARED_SITE:-}"
if [ -z "$SITE" ] || [ "$SITE" = "demo-ecom" ]; then
  echo "publish.sh: firebase.json must declare an available hosting site id" >&2
  exit 1
fi
if [ -n "${FIREBASE_SITE:-}" ] && [ "$FIREBASE_SITE" != "$SITE" ]; then
  echo "publish.sh: using declared site '$SITE' instead of FIREBASE_SITE '$FIREBASE_SITE'" >&2
fi

PROJECT="${FIREBASE_PROJECT_ID:-fir-ecom-b0dfe}"
CHANNEL="${FIREBASE_CHANNEL:-${ORBIT_CHANNEL:-}}"
PUBLIC_DIR="$(read_json public)"

if [ ! -d node_modules ]; then
  npm ci
fi

node scripts/build-hosting.mjs

if [ ! -d "$PUBLIC_DIR" ]; then
  echo "publish.sh: the static build did not create $PUBLIC_DIR" >&2
  exit 1
fi

FIREBASE=(firebase)
if ! command -v firebase >/dev/null 2>&1; then
  FIREBASE=(npx --yes firebase-tools@13.29.1)
fi

if ! "${FIREBASE[@]}" hosting:sites:list --project "$PROJECT" --json 2>/dev/null \
  | grep -q "/sites/$SITE\""; then
  "${FIREBASE[@]}" hosting:sites:create "$SITE" --project "$PROJECT" || true
fi

URL=""
if [ -n "$CHANNEL" ]; then
  RESULT_FILE="$(mktemp)"
  trap 'rm -f "$RESULT_FILE"' EXIT
  "${FIREBASE[@]}" hosting:channel:deploy "$CHANNEL" \
    --only "hosting:$SITE" --project "$PROJECT" --json > "$RESULT_FILE"
  URL="$(node -e '
    const data = require(process.argv[1]);
    const sites = data.result && typeof data.result === "object" ? Object.values(data.result) : [];
    const first = sites.find((entry) => entry && entry.url);
    process.stdout.write(first ? first.url : "");
  ' "$RESULT_FILE")"
else
  RESULT_FILE="$(mktemp)"
  trap 'rm -f "$RESULT_FILE"' EXIT
  "${FIREBASE[@]}" deploy --only "hosting:$SITE" --project "$PROJECT" \
    --non-interactive --json > "$RESULT_FILE"
  URL="$(node -e '
    const data = require(process.argv[1]);
    const result = data.result && typeof data.result === "object" ? data.result : {};
    const hosting = result.hosting;
    const value = typeof hosting === "string" ? hosting : hosting && hosting.url;
    process.stdout.write(value || "");
  ' "$RESULT_FILE")"
fi

if [ -z "$URL" ]; then
  echo "publish.sh: the deploy finished without printing a URL" >&2
  exit 1
fi

if [ -n "${ORBIT_URL_FILE:-}" ]; then
  printf '%s\n' "$URL" > "$ORBIT_URL_FILE"
fi
printf '%s\n' "$URL"
