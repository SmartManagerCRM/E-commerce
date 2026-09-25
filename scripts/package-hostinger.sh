#!/usr/bin/env bash
# Builds the ZIP uploaded to Hostinger (Websites → Add Website → Node.js web app
# → Upload your files). Contains the committed source only — no node_modules,
# no .next, no .env files. Hostinger installs dependencies and runs the build.
#
#   npm run package:hostinger            # from the current commit (HEAD)
#   npm run package:hostinger -- <ref>   # from a branch, tag or commit
set -euo pipefail

REF="${1:-HEAD}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$REF" == "HEAD" ]] && ! git diff --quiet HEAD --; then
  echo "Warning: uncommitted changes are NOT included (the ZIP is built from $REF)." >&2
fi

SHA="$(git rev-parse --short "$REF")"
mkdir -p dist
OUT="dist/smartmanager-ecommerce-${SHA}.zip"
rm -f "$OUT"

# Tests, CI and local tooling are not needed on the server.
git archive --format=zip -o "$OUT" "$REF" -- . \
  ':(exclude)tests' ':(exclude).github' ':(exclude)supabase/tests' ':(exclude)playwright.config.ts'

echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
