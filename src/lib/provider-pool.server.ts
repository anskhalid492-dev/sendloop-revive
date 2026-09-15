/**
 * MunchReach Provider Manager.
 *
 * A single, global pool of sending providers (Resend, Amazon SES, Mailgun,
 * Brevo, SendGrid) owned by MunchReach. There is NO workspace -> provider
 * assignment anywhere: when a domain needs infrastructure, this manager picks
 * one deterministically from the healthy, enabled, in-capacity providers.
 *
 *   Customer -> Provider Manager -> provider pool -> automatic routing
 *
 * Customers never see, choose, or configure a provider. Admins configure the
 * pool globally (enabled, mode, credentials, region, capacity, priority) and
 * everything else is automatic, including failover.
 */
import type { ProviderCredentials } from "@/lib/domain-providers/adapter.server";
import {
  isProviderEnabledForScope,
  type EmailScope,
} from "@/lib/email-provider-scope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type PoolProviderRow = {
  id: string;
  provider: string;
  name: string;
  is_enabled: boolean;
  /** May carry customer (campaign) email. */
  customer_enabled: boolean;
  /** May carry admin/system transactional email. */
  system_enabled: boolean;
  priority: number;
  daily_capacity: number;
  hourly_capacity: number;
  status: string | null;
  mode: string | null;
  region: string | null;
  health_status: string | null;
  health_checked_at: string | null;
  health_detail: string | null;
  sent_hour: number | null;
  sent_day: number | null;
  success_count: number | null;
  failure_count: number | null;
  last_success_at: string | null;
  last_tested_at: string | null;
  last_error: string | null;
};

export type PoolCandidate = {
  row: PoolProviderRow;
  credentials: ProviderCredentials;
  credentialSource: "stored" | "platform_env";
};

export type SelectedProvider = {
  provider: string;
  providerId: string | null;
  credentials: ProviderCredentials;
  mode: "sandbox" | "live";
  region: string | null;
};

const POOL_BASE_COLUMNS =
  "id, provider, name, is_enabled, priority, daily_capacity, hourly_capacity, status, mode, region, health_status, health_checked_at, health_detail, sent_hour, sent_day, success_count, failure_count, last_success_at, last_tested_at, last_error";

const POOL_COLUMNS = `${POOL_BASE_COLUMNS}, customer_enabled, system_enabled`;

/** Stable 32-bit hash so a given domain keeps landing on the same provider. */
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function errorRate(row: PoolProviderRow): number {
  const ok = row.success_count ?? 0;
  const bad = row.failure_count ?? 0;
  const total = ok + bad;
  return total === 0 ? 0 : bad / total;
}

/** 0..1 — how much of the hourly/daily capacity is already used. */
export function loadFactor(row: PoolProviderRow): number {
  const hourly = row.hourly_capacity > 0 ? (row.sent_hour ?? 0) / row.hourly_capacity : 0;
  const daily = row.daily_capacity > 0 ? (row.sent_day ?? 0) / row.daily_capacity : 0;
  return Math.max(hourly, daily);
}

export function hasCapacity(row: PoolProviderRow): boolean {
  return loadFactor(row) < 1;
}

export async function loadPool(admin: Admin): Promise<PoolProviderRow[]> {
  const { data, error } = await admin
    .from("email_providers")
    .select(POOL_COLUMNS)
    .order("priority", { ascending: true });
  if (!error) return (data ?? []) as PoolProviderRow[];

  // A deployment whose database has not got the scope columns yet must NOT
  // silently lose its whole provider pool (that collapses routing to a blind
  // last-resort key and sends domains through the wrong provider). Fall back to
  // the legacy columns; `isProviderEnabledForScope` treats missing scope flags
  // as the legacy master switch.
  console.error("provider pool: scoped columns unavailable, using legacy columns", error.message);
  const legacy = await admin
    .from("email_providers")
    .select(POOL_BASE_COLUMNS)
    .order("priority", { ascending: true });
  if (legacy.error) {
    console.error("provider pool: unable to load providers", legacy.error.message);
    return [];
  }
  return (legacy.data ?? []) as PoolProviderRow[];
}

/** Server-side only: decrypts stored credentials, else falls back to a platform key. */
export async function credentialsFor(
  admin: Admin,
  row: Pick<PoolProviderRow, "id" | "provider">,
): Promise<{ credentials: ProviderCredentials; source: "stored" | "platform_env" } | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");
  const { platformKeyFor } = await import("@/lib/managed-sending.server");

  const { data: secret } = await admin
    .from("email_provider_secrets")
    .select("credentials_ciphertext")
    .eq("provider_id", row.id)
    .maybeSingle();

  if (secret?.credentials_ciphertext) {
    try {
      const credentials = readCredentials(secret.credentials_ciphertext) as ProviderCredentials;
      if (credentials && Object.keys(credentials).length > 0) {
        return { credentials, source: "stored" };
      }
    } catch {
      /* fall through to the platform key */
    }
  }

  const envKey = platformKeyFor(row.provider);
  return envKey ? { credentials: { api_key: envKey }, source: "platform_env" } : null;
}

/**
 * The single credential resolution used by every read-only provider check
 * (domain status, receiving status, readiness). It reuses `credentialsFor`, the
 * same decryption the domain-provisioning path uses, so no caller ever talks to
 * a provider API with an empty credential.
 */
export async function credentialsForProviderRef(
  admin: Admin,
  ref: { provider?: string | null; providerId?: string | null },
): Promise<{ provider: string; providerId: string; credentials: ProviderCredentials } | null> {
  let row: { id: string; provider: string } | null = null;

  if (ref.providerId) {
    const { data } = await admin
      .from("email_providers")
      .select("id, provider")
      .eq("id", ref.providerId)
      .maybeSingle();
    row = (data as { id: string; provider: string } | null) ?? null;
  }
  if (!row && ref.provider) {
    const { data } = await admin
      .from("email_providers")
      .select("id, provider, is_enabled, priority")
      .eq("provider", ref.provider)
      .order("is_enabled", { ascending: false })
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();
    row = (data as { id: string; provider: string } | null) ?? null;
  }
  if (!row) return null;

  const resolved = await credentialsFor(admin, row);
  if (!resolved) return null;
  return { provider: row.provider, providerId: row.id, credentials: resolved.credentials };
}

export async function logRoutingEvent(
  admin: Admin,
  input: {
    providerId?: string | null;
    previousProviderId?: string | null;
    domainId?: string | null;
    domain?: string | null;
    workspaceId?: string | null;
    event: string;
    reason?: string | null;
    detail?: string | null;
  },
): Promise<void> {
  await admin
    .from("provider_routing_events")
    .insert({
      provider_id: input.providerId ?? null,
      previous_provider_id: input.previousProviderId ?? null,
      domain_id: input.domainId ?? null,
      domain: input.domain ?? null,
      workspace_id: input.workspaceId ?? null,
      event: input.event,
      reason: input.reason ?? null,
      detail: (input.detail ?? "").slice(0, 2000) || null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Records a real send/failure against the provider's usage counters. */
export async function recordProviderUsage(
  admin: Admin,
  providerId: string | null,
  { sent = 0, failed = 0 }: { sent?: number; failed?: number },
): Promise<void> {
  if (!providerId) return;
  await admin
    .rpc("provider_record_usage", { _provider_id: providerId, _sent: sent, _failed: failed })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Live health probe against the provider API.
 *
 * The probe is a real, safe read-only operation (credential + domain API call).
 * Its result is appended to the rolling operations log, then health is
 * recomputed from that window — a passing credential test alone never forces
 * the provider to "healthy".
 */
export async function checkProviderHealth(
  admin: Admin,
  row: PoolProviderRow,
): Promise<{ health: string; detail: string; reason: string }> {
  const { recordProviderOperation, refreshProviderHealth, httpStatusFrom } = await import(
    "@/lib/provider-health.server"
  );

  const creds = await credentialsFor(admin, row);
  if (!creds) {
    const detail = "No credentials configured for this provider.";
    await recordProviderOperation(admin, row.id, {
      operation: "credential_check",
      ok: false,
      message: detail,
    });
    const diagnostics = await refreshProviderHealth(admin, row.id);
    await admin
      .from("email_providers")
      .update({ health_status: "down", health_reason: detail, health_detail: detail })
      .eq("id", row.id);
    return { health: "down", detail, reason: diagnostics.reason };
  }

  const { testProviderCredentials } = await import("@/lib/provider-credentials.server");
  let ok = false;
  let detail = "";
  try {
    const result = await testProviderCredentials(row.provider, creds.credentials);
    ok = result.ok;
    detail = result.message;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  await recordProviderOperation(admin, row.id, {
    operation: "credential_check",
    ok,
    httpStatus: httpStatusFrom(detail),
    message: detail,
  });

  await admin
    .from("email_providers")
    .update({
      status: ok ? "verified" : "failed",
      last_tested_at: new Date().toISOString(),
      last_error: ok ? null : detail.slice(0, 500),
      ...(ok ? { last_success_at: new Date().toISOString() } : {}),
    })
    .eq("id", row.id);

  const diagnostics = await refreshProviderHealth(admin, row.id);
  // Capacity exhaustion is a real routing constraint, not an API failure.
  if (diagnostics.health === "healthy" && !hasCapacity(row)) {
    await admin
      .from("email_providers")
      .update({
        health_status: "degraded",
        health_reason: "At capacity — hourly/daily sending limit reached.",
      })
      .eq("id", row.id);
    return { health: "degraded", detail, reason: "At capacity — hourly/daily limit reached." };
  }

  return { health: diagnostics.health, detail, reason: diagnostics.reason };
}


export async function checkPoolHealth(
  admin: Admin,
): Promise<Array<{ id: string; provider: string; health: string; detail: string; reason: string }>> {
  const pool = await loadPool(admin);
  const results: Array<{
    id: string;
    provider: string;
    health: string;
    detail: string;
    reason: string;
  }> = [];
  for (const row of pool) {
    const result = await checkProviderHealth(admin, row);
    results.push({ id: row.id, provider: row.provider, ...result });
    await logRoutingEvent(admin, {
      providerId: row.id,
      event: "health_check",
      reason: result.health,
      detail: result.reason,
    });
  }
  return results;
}

/**
 * Deterministic routing.
 *
 * Filters: enabled -> domain capability -> valid credentials -> health -> capacity.
 * Ordering: configured priority, then least loaded, then lowest error rate, and
 * finally a stable hash of the routing key so identical scores never flap.
 */
export async function selectProvider(
  admin: Admin,
  options: {
    /** Routing key — the domain name keeps a domain on one provider. */
    key: string;
    /** Provider currently assigned; kept whenever it is still eligible. */
    currentProviderId?: string | null;
    /** Only consider providers with a domain API. */
    requireDomainApi?: boolean;
    /** Providers to exclude (failover). */
    exclude?: string[];
    /**
     * Which email type this send belongs to. Customer and system permissions
     * are independent, so each keeps its own priority/fallback ordering.
     */
    scope?: EmailScope;
    /**
     * Provider the sender/domain was actually provisioned on. Routing must
     * never move a domain to a different provider (the other provider does not
     * know the domain and rejects the send as unverified).
     */
    preferredProvider?: string | null;
  },
): Promise<SelectedProvider | null> {
  const { DOMAIN_CAPABLE_PROVIDERS } = await import("@/lib/domain-providers/registry.server");
  const pool = await loadPool(admin);
  const exclude = new Set(options.exclude ?? []);
  const scope: EmailScope = options.scope ?? "customer";
  const preferred = options.preferredProvider ?? null;

  const eligible: PoolCandidate[] = [];
  for (const row of pool) {
    if (!isProviderEnabledForScope(row, scope)) continue;
    if (exclude.has(row.id)) continue;
    if (options.requireDomainApi && !DOMAIN_CAPABLE_PROVIDERS.includes(row.provider)) continue;
    if (row.health_status === "down") continue;
    if (!hasCapacity(row)) continue;
    const creds = await credentialsFor(admin, row);
    if (!creds) continue;
    eligible.push({ row, credentials: creds.credentials, credentialSource: creds.source });
  }

  // Provider affinity: when the sender is already provisioned on a provider,
  // only that provider may carry the send.
  const affine = preferred ? eligible.filter((c) => c.row.provider === preferred) : [];
  const pickFrom = affine.length ? affine : preferred ? [] : eligible;

  if (pickFrom.length === 0) {
    // An admin-configured provider that is disabled, unhealthy or out of
    // capacity must stay off — never silently substituted by a platform key.
    if (preferred && pool.some((row) => row.provider === preferred)) return null;
    // Last resort: a platform key so the very first deployment can verify a
    // domain before the pool is configured. It is ONLY for infrastructure the
    // admin has never configured: a provider that has a pool row is governed by
    // its Providers settings, so a disabled, unhealthy or out-of-capacity row
    // must never be resurrected through an environment key. Ignoring this is
    // how a transient failure on the active provider used to hand domains to
    // switched-off infrastructure.
    const { platformKeyFor } = await import("@/lib/managed-sending.server");
    const order = preferred ? [preferred] : DOMAIN_CAPABLE_PROVIDERS;
    for (const provider of order) {
      if (pool.some((row) => row.provider === provider)) continue;
      const envKey = platformKeyFor(provider);
      if (envKey) {
        return {
          provider,
          providerId: null,
          credentials: { api_key: envKey },
          mode: "live",
          region: null,
        };
      }
    }
    console.error(
      `[provider-pool] no active provider available: ${JSON.stringify({
        reason: "no_enabled_provider",
        scope,
        key: options.key,
        preferred,
        poolSize: pool.length,
        excluded: [...exclude],
        requireDomainApi: options.requireDomainApi === true,
      })}`,
    );
    return null;
  }

  // Stickiness first: never move a domain that is already on a healthy provider.
  const current = options.currentProviderId
    ? pickFrom.find((c) => c.row.id === options.currentProviderId)
    : undefined;
  const chosen = current ?? pickDeterministic(pickFrom, options.key);

  return {
    provider: chosen.row.provider,
    providerId: chosen.row.id,
    credentials: chosen.credentials,
    mode: chosen.row.mode === "sandbox" ? "sandbox" : "live",
    region: chosen.row.region,
  };
}

function pickDeterministic(candidates: PoolCandidate[], key: string): PoolCandidate {
  const scored = [...candidates].sort((a, b) => {
    if (a.row.priority !== b.row.priority) return a.row.priority - b.row.priority;
    const healthRank = (r: PoolProviderRow) =>
      r.health_status === "healthy" ? 0 : r.health_status === "unknown" ? 1 : 2;
    if (healthRank(a.row) !== healthRank(b.row)) return healthRank(a.row) - healthRank(b.row);
    const loadDelta = loadFactor(a.row) - loadFactor(b.row);
    if (Math.abs(loadDelta) > 0.05) return loadDelta;
    const errDelta = errorRate(a.row) - errorRate(b.row);
    if (Math.abs(errDelta) > 0.02) return errDelta;
    return a.row.id.localeCompare(b.row.id);
  });

  // Everything in the top tier is equally good — hash the key to spread load
  // deterministically instead of randomly.
  const best = scored[0]!;
  const tier = scored.filter(
    (c) =>
      c.row.priority === best.row.priority &&
      Math.abs(loadFactor(c.row) - loadFactor(best.row)) <= 0.05,
  );
  return tier[stableHash(key) % tier.length]!;
}

/**
 * Scope permission for a provider addressed by its provider id (e.g. the one
 * resolved from platform environment keys rather than a pool row).
 * Providers with no pool row are permitted — their availability is decided by
 * credentials alone, exactly as before.
 */
export async function isProviderAllowedForScope(
  admin: Admin,
  provider: string,
  scope: EmailScope,
): Promise<boolean> {
  const { data } = await admin
    .from("email_providers")
    .select("is_enabled, customer_enabled, system_enabled")
    .eq("provider", provider);
  const rows = (data ?? []) as Array<{
    is_enabled: boolean;
    customer_enabled: boolean | null;
    system_enabled: boolean | null;
  }>;
  if (rows.length === 0) return true;
  return rows.some((row) => isProviderEnabledForScope(row, scope));
}
