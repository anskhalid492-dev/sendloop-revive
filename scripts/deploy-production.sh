#!/usr/bin/env bash
# MunchReach — production deploy to Cloudflare Workers (munchreach.com)
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/deploy-production.sh
#
# Requires: bun (or npm), a Cloudflare account with munchreach.com as an active zone,
# and every secret from .env.production.example already pushed with `wrangler secret put`.
set -euo pipefail

WORKER_NAME="${WORKER_NAME:-munchreach}"
DOMAIN="${DOMAIN:-munchreach.com}"

echo "==> Building production bundle"
bun install --frozen-lockfile
bun run build

CONF="dist/server/wrangler.json"
test -f "$CONF" || { echo "missing $CONF — build did not produce a worker"; exit 1; }

echo "==> Pinning worker name + custom domains in $CONF"
node -e '
const fs = require("fs");
const p = process.argv[1], name = process.argv[2], domain = process.argv[3];
const c = JSON.parse(fs.readFileSync(p, "utf8"));
c.name = name;
c.compatibility_flags = Array.from(new Set([...(c.compatibility_flags || []), "nodejs_compat"]));
c.routes = [
  { pattern: domain, custom_domain: true },
  { pattern: "www." + domain, custom_domain: true },
];
c.observability = { enabled: true };
fs.writeFileSync(p, JSON.stringify(c, null, 2));
console.log(JSON.stringify(c, null, 2));
' "$CONF" "$WORKER_NAME" "$DOMAIN"

echo "==> Deploying"
npx wrangler deploy --config "$CONF"

echo "==> Smoke test"
for path in / /pricing /blog; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN$path")
  echo "  https://$DOMAIN$path -> $code"
done
echo "Done. Verify no 'server: LiteSpeed' / 'x-powered-by: PHP' headers remain:"
curl -sI "https://$DOMAIN/" | grep -iE '^(server|x-powered-by)' || echo "  (clean)"
