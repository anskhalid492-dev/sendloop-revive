#!/usr/bin/env bash
# MunchReach — production deploy to Cloudflare Workers (munchreach.com)
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/deploy-production.sh
#
# Requires: bun, a Cloudflare account with munchreach.com as an active zone, and every
# secret from .env.production.example already pushed with `wrangler secret put NAME`.
#
# PHASE 6: the app must point at the NEW Supabase project
# (rihgzkofoxcjljlbvbya). The OLD project (ciaxsdojimcupxzpbpev) stays untouched
# as the rollback target — set EXPECTED_SUPABASE_PROJECT=ciaxsdojimcupxzpbpev to
# redeploy the rollback build.
set -euo pipefail

WORKER_NAME="${WORKER_NAME:-munchreach}"
DOMAIN="${DOMAIN:-munchreach.com}"
EXPECTED_SUPABASE_PROJECT="${EXPECTED_SUPABASE_PROJECT:-rihgzkofoxcjljlbvbya}"

echo "==> Safety check: Supabase project must be $EXPECTED_SUPABASE_PROJECT"
CONFIGURED="${VITE_SUPABASE_PROJECT_ID:-${SUPABASE_PROJECT_ID:-}}"
if [ -z "$CONFIGURED" ] && [ -f .env ]; then
  CONFIGURED=$(grep -E '^VITE_SUPABASE_PROJECT_ID=' .env | head -1 | cut -d= -f2- | tr -d '"')
fi
if [ "$CONFIGURED" != "$EXPECTED_SUPABASE_PROJECT" ]; then
  echo "STOP: configured Supabase project is '$CONFIGURED', expected '$EXPECTED_SUPABASE_PROJECT'."
  echo "      Export VITE_SUPABASE_* / SUPABASE_* for the intended project before building. Aborting."
  exit 1
fi
echo "    ok — building against Supabase project $CONFIGURED"

echo "==> 1/4 Building production bundle"
bun install --frozen-lockfile
bun run build

CONF="dist/server/wrangler.json"
test -f "$CONF" || { echo "missing $CONF — build did not produce a worker"; exit 1; }
test -d dist/client || { echo "missing dist/client — build did not produce static assets"; exit 1; }

echo "==> 2/4 Pinning worker name, nodejs_compat and custom domains in $CONF"
node -e '
const fs = require("fs");
const p = process.argv[1], name = process.argv[2], domain = process.argv[3];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.name = name;
c.compatibility_flags = Array.from(new Set([...(c.compatibility_flags || []), "nodejs_compat"]));
c.compatibility_date = c.compatibility_date || "2025-01-01";
c.routes = [
  { pattern: domain, custom_domain: true },
  { pattern: "www." + domain, custom_domain: true },
];
c.observability = { enabled: true };
fs.writeFileSync(p, JSON.stringify(c, null, 2));
console.log(JSON.stringify({ name: c.name, flags: c.compatibility_flags, routes: c.routes }, null, 2));
' "$CONF" "$WORKER_NAME" "$DOMAIN"

echo "==> 3/4 Deploying worker + attaching custom domains (SSL is auto-provisioned by Cloudflare)"
npx wrangler deploy --config "$CONF"

echo "==> 4/4 Production smoke tests"
fail=0
check() { # path expected-codes method
  local path="$1" expect="$2" method="${3:-GET}"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" \
    ${4:+-H 'content-type: application/json'} ${4:+--data "$4"} "https://$DOMAIN$path")
  if echo "$expect" | tr ' ' '\n' | grep -qx "$code"; then
    echo "  PASS $method $path -> $code"
  else
    echo "  FAIL $method $path -> $code (expected: $expect)"; fail=1
  fi
}

# SSR pages
check /            200
check /pricing     200
check /blog        200

# Representative public API routes (auth/signature rejection == route is live)
check /api/public/inbound/email          "400 401 403" POST '{}'
check /api/public/billing/stripe         "400 401 403" POST '{}'
check /api/public/billing/paddle         "400 401 403" POST '{}'
check /api/public/billing/lemonsqueezy   "400 401 403" POST '{}'
check /api/public/integrations/smoke-test "400 401 403 404"  POST '{}'
check /api/public/automations/smoke-test  "400 401 403 404"  POST '{}'
check /api/public/referral/billing        "400 401 403" POST '{}'
check /api/public/cron/run-campaigns      "400 401 403" POST '{}'
check /api/public/media/smoke-test        "400 401 403 404"

# Must NOT exist
check /api/public/webhooks/stripe 404 POST '{}'

echo "==> Backend binding check (client bundle must reference $CONFIGURED)"
if grep -rqa "$CONFIGURED.supabase.co" dist/client; then
  echo "  PASS client bundle points at $CONFIGURED"
else
  echo "  FAIL client bundle does not reference $CONFIGURED"; fail=1
fi

echo "==> Host headers (must show Cloudflare, not LiteSpeed/PHP)"
curl -sI "https://$DOMAIN/" | grep -iE '^(server|x-powered-by|cf-ray)' || true
if curl -sI "https://$DOMAIN/" | grep -qiE 'litespeed|x-powered-by: php'; then
  echo "  FAIL: old LiteSpeed/PHP host is still answering — DNS has not cut over"; fail=1
fi

# HTTPS/SSL
curl -sS -o /dev/null "https://$DOMAIN/" && echo "  PASS TLS handshake on https://$DOMAIN" || { echo "  FAIL TLS"; fail=1; }

exit $fail
