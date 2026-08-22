#!/usr/bin/env bash
# MunchReach migration Phase 2 — structure-only apply + verify.
#
#   ./apply.sh "postgresql://postgres:<pw>@db.<new-ref>.supabase.co:5432/postgres"
#
# Applies extensions -> schema -> realtime to the NEW project, then diffs the
# resulting object counts against the production baseline in baseline.txt.
# Applies NO data: no rows, no auth users, no storage objects, no secrets.
set -euo pipefail

TARGET="${1:-${TARGET_DB_URL:-}}"
if [ -z "$TARGET" ]; then
  echo "usage: ./apply.sh <new-project-postgres-connection-string>" >&2
  exit 1
fi
cd "$(dirname "$0")"

echo "== 0/4 extensions =="
psql "$TARGET" -v ON_ERROR_STOP=1 -f 00_extensions.sql

echo "== 1/4 public schema (tables, enums, functions, triggers, indexes, FKs, grants, RLS policies) =="
psql "$TARGET" -v ON_ERROR_STOP=1 -f 01_public_schema.sql

echo "== 2/4 realtime publication =="
psql "$TARGET" -v ON_ERROR_STOP=1 -f 03_realtime.sql

echo "== 3/4 counts =="
psql "$TARGET" -At -F'=' -f 02_verify.sql | sort > /tmp/munchreach-new-counts.txt
cat /tmp/munchreach-new-counts.txt

echo "== 4/4 diff vs production baseline =="
if diff -u baseline.txt /tmp/munchreach-new-counts.txt; then
  echo "MATCH — new structure is identical to production."
else
  echo "DIFFERENCES FOUND — review the diff above before proceeding to Phase 3." >&2
  exit 2
fi

echo "== RLS posture =="
psql "$TARGET" -f 04_rls_isolation_check.sql
