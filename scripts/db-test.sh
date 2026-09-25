#!/usr/bin/env bash
# Runs every migration, the dev seed and the pgTAP suite against a throwaway
# Supabase Postgres container (same image/version as the hosted project).
#
#   npm run test:db            # fresh container, removed afterwards
#   KEEP_DB=1 npm run test:db  # keep the container running for inspection
set -euo pipefail

IMAGE="${SUPABASE_PG_IMAGE:-supabase/postgres:17.6.1.166}"
NAME="${DB_TEST_CONTAINER:-smartmanager-db-test}"
PORT="${DB_TEST_PORT:-54330}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PGPASSWORD=postgres
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

cleanup() { [[ "${KEEP_DB:-0}" == "1" ]] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null

echo "Waiting for Postgres…"
for _ in $(seq 1 60); do
  if "${PSQL[@]}" -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
# The image runs its own init scripts after first accepting connections.
sleep 3
until "${PSQL[@]}" -c "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; do sleep 1; done

echo "Applying migrations…"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  "${PSQL[@]}" -1 -f "$f"
done
echo "Applying seed…"
"${PSQL[@]}" -1 -f "$ROOT/supabase/seed.sql"

echo "Running pgTAP tests…"
status=0
for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "── $(basename "$f")"
  out="$("${PSQL[@]}" -At -f "$f" 2>&1)" || status=1
  echo "$out" | grep -E '^(ok|not ok|#|1\.\.)' || true
  if echo "$out" | grep -qE '^not ok|Looks like|ERROR'; then
    echo "$out" | grep -E 'ERROR' || true
    status=1
  fi
done

if [[ $status -ne 0 ]]; then echo "DATABASE TESTS FAILED"; exit 1; fi
echo "All database tests passed."
