/**
 * Phase 7 — platform providers, webhooks and environment status. Server only.
 *
 * This module is a *read model* over the systems MunchReach already owns:
 *  - `email_providers`      → sending infrastructure (managed, server-side only)
 *  - `billing_providers`    → billing adapters (via billing/provider-health)
 *  - `integrations`         → customer-facing integrations catalog
 *  - webhook event tables   → billing / referral / integration activity
 *
 * It never creates a second credentials store and never returns a secret
 * value: only whether a secret is present, and safe human-readable messages.
 */
import type { BillingEnvironment } from "@/lib/billing/model";

export type ProviderCategory =
  | "sending"
  | "inbound"
  | "ai"
  | "verification"
  | "billing"
  | "analytics"
  | "other";

export type PlatformProvider = {
  /** Stable key: `${source}:${id}` */
  key: string;
  source: "email" | "billing" | "integration" | "platform";
  /** Row id where an admin action needs one (email providers, integrations). */
  id: string | null;
  name: string;
  category: ProviderCategory;
  enabled: boolean;
  environment: "test" | "live" | "n/a";
  status: "connected" | "failed" | "not_configured" | "not_tested" | "disabled";
  configured: boolean;
  lastTestAt: string | null;
  lastError: string | null;
  priority: number | null;
  detail: string;
  canTest: boolean;
  canToggle: boolean;
  canPrioritise: boolean;
};

export type SendingProviderRow = {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  status: string;
  priority: number;
  dailyCapacity: number;
  hourlyCapacity: number;
  sent24h: number;
  failed24h: number;
  lastTestAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  credentialSource: "provider_secret" | "platform_env" | null;
};

export type WebhookRow = {
  id: string;
  source: "billing" | "referral" | "integration";
  provider: string;
  event: string;
  status: string;
  signatureOk: boolean | null;
  receivedAt: string;
  processedAt: string | null;
  retryCount: number;
  error: string | null;
  environment: string;
  canRetry: boolean;
};

export type EnvVarStatus = {
  name: string;
  group: string;
  required: boolean;
  configured: boolean;
  environment: "shared" | "test" | "live";
  state: "CONFIGURED" | "MISSING" | "INVALID" | "NOT TESTED";
  note: string;
  lastVerifiedAt: string | null;
};

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function present(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* Providers                                                           */
/* ------------------------------------------------------------------ */

export async function loadPlatformProviders(): Promise<{
  environment: BillingEnvironment;
  providers: PlatformProvider[];
}> {
  const supabase = await db();
  const { loadProviderHealth } = await import("@/lib/billing/provider-health.server");
  const { platformKeyFor } = await import("@/lib/managed-sending.server");

  const [{ data: emailRows }, { data: integrationRows }, billing] = await Promise.all([
    supabase
      .from("email_providers")
      .select("id, name, provider, is_enabled, status, priority, last_error, last_tested_at")
      .order("priority", { ascending: true }),
    supabase.from("integrations").select("slug, name, category, is_enabled").order("sort_order"),
    loadProviderHealth(),
  ]);

  const providers: PlatformProvider[] = [];

  for (const row of (emailRows ?? []) as Array<Record<string, unknown>>) {
    const providerId = String(row["provider"]);
    const status = String(row["status"]);
    const envKey = platformKeyFor(providerId);
    const configured = status !== "untested" || (envKey ? present(envKey) : false);
    providers.push({
      key: `email:${String(row["id"])}`,
      source: "email",
      id: String(row["id"]),
      name: String(row["name"]),
      category: "sending",
      enabled: Boolean(row["is_enabled"]),
      environment: "live",
      status: !row["is_enabled"]
        ? "disabled"
        : status === "verified"
          ? "connected"
          : status === "failed"
            ? "failed"
            : configured
              ? "not_tested"
              : "not_configured",
      configured,
      lastTestAt: (row["last_tested_at"] as string | null) ?? null,
      lastError: (row["last_error"] as string | null) ?? null,
      priority: Number(row["priority"] ?? 0),
      detail: `Managed sending adapter (${providerId}). Credentials stay server-side.`,
      canTest: true,
      canToggle: true,
      canPrioritise: true,
    });
  }

  for (const row of billing.rows) {
    providers.push({
      key: `billing:${row.provider}:${row.environment}`,
      source: "billing",
      id: null,
      name: `${row.provider} (billing)`,
      category: "billing",
      enabled: row.enabled,
      environment: row.environment,
      status: !row.configured
        ? "not_configured"
        : row.connection.state === "connected"
          ? "connected"
          : row.connection.state === "failed"
            ? "failed"
            : "not_tested",
      configured: row.configured,
      lastTestAt: row.connection.checkedAt,
      lastError: row.lastError.message,
      priority: null,
      detail: row.missingSecrets.length
        ? `Missing: ${row.missingSecrets.join(", ")}`
        : "Credentials present for this environment.",
      canTest: row.configured,
      canToggle: false,
      canPrioritise: false,
    });
  }

  const categoryMap: Record<string, ProviderCategory> = {
    ai: "ai",
    automation: "other",
    crm: "other",
    calendar: "other",
    notifications: "other",
    data: "analytics",
  };

  for (const row of (integrationRows ?? []) as Array<Record<string, unknown>>) {
    const slug = String(row["slug"]);
    providers.push({
      key: `integration:${slug}`,
      source: "integration",
      id: slug,
      name: String(row["name"]),
      category: categoryMap[String(row["category"])] ?? "other",
      enabled: Boolean(row["is_enabled"]),
      environment: "n/a",
      status: row["is_enabled"] ? "not_tested" : "disabled",
      configured: true,
      lastTestAt: null,
      lastError: null,
      priority: null,
      detail: "Customer-connected integration. Each workspace supplies its own credentials.",
      canTest: false,
      canToggle: true,
      canPrioritise: false,
    });
  }

  // Platform-level services that are configured purely through secrets.
  const platformEntries: Array<{
    name: string;
    category: ProviderCategory;
    keys: string[];
    detail: string;
  }> = [
    {
      name: "Inbound email (Resend webhook)",
      category: "inbound",
      keys: ["RESEND_API_KEY", "INBOUND_EMAIL_SECRET"],
      detail: "Receives replies and routes them into the unified inbox.",
    },
    {
      name: "Lovable AI Gateway",
      category: "ai",
      keys: ["LOVABLE_API_KEY"],
      detail: "Used for AI copy assistance where enabled.",
    },
    {
      name: "Credential encryption",
      category: "verification",
      keys: ["PROVIDER_CREDENTIALS_KEY"],
      detail: "Encrypts provider and integration credentials at rest.",
    },
  ];

  for (const entry of platformEntries) {
    const missing = entry.keys.filter((k) => !present(k));
    providers.push({
      key: `platform:${entry.name}`,
      source: "platform",
      id: null,
      name: entry.name,
      category: entry.category,
      enabled: missing.length === 0,
      environment: "n/a",
      status: missing.length ? "not_configured" : "not_tested",
      configured: missing.length === 0,
      lastTestAt: null,
      lastError: null,
      priority: null,
      detail: missing.length ? `Not configured — missing ${missing.length} secret(s).` : entry.detail,
      canTest: false,
      canToggle: false,
      canPrioritise: false,
    });
  }

  return { environment: billing.settings.environment, providers };
}

/** Email/sending infrastructure view with real 24h volume. */
export async function loadSendingProviders(): Promise<SendingProviderRow[]> {
  const supabase = await db();
  const { loadManagedProviderCredentials } = await import("@/lib/managed-sending.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: rows }, { data: events }] = await Promise.all([
    supabase
      .from("email_providers")
      .select(
        "id, name, provider, is_enabled, status, priority, daily_capacity, hourly_capacity, last_error, last_tested_at",
      )
      .order("priority", { ascending: true }),
    supabase.from("email_events").select("provider, event_type, created_at").gte("created_at", since),
  ]);

  const evts = (events ?? []) as Array<{ provider: string | null; event_type: string; created_at: string }>;

  const out: SendingProviderRow[] = [];
  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    const providerId = String(row["provider"]);
    const mine = evts.filter((e) => e.provider === providerId);
    const sent = mine.filter((e) => ["sent", "delivered"].includes(e.event_type));
    const managed = await loadManagedProviderCredentials(supabase, {
      provider: providerId,
      provider_id: String(row["id"]),
    });
    out.push({
      id: String(row["id"]),
      name: String(row["name"]),
      provider: providerId,
      enabled: Boolean(row["is_enabled"]),
      status: String(row["status"]),
      priority: Number(row["priority"] ?? 0),
      dailyCapacity: Number(row["daily_capacity"] ?? 0),
      hourlyCapacity: Number(row["hourly_capacity"] ?? 0),
      sent24h: sent.length,
      failed24h: mine.filter((e) => ["bounced", "failed", "complained"].includes(e.event_type)).length,
      lastTestAt: (row["last_tested_at"] as string | null) ?? null,
      lastSuccessAt: sent[0]?.created_at ?? null,
      lastError: (row["last_error"] as string | null) ?? null,
      credentialSource: managed?.source ?? null,
    });
  }
  return out;
}

/** Server-side connection test. Returns a safe message — never credentials. */
export async function testPlatformProvider(input: {
  source: "email" | "billing";
  id?: string | undefined;
  provider?: string | undefined;
  environment?: BillingEnvironment | undefined;
  userId: string;
}): Promise<{ ok: boolean; message: string }> {
  if (input.source === "billing") {
    if (!input.provider || !input.environment) return { ok: false, message: "Provider missing." };
    const { testProviderConnection } = await import("@/lib/billing/provider-health.server");
    const result = await testProviderConnection(
      input.provider as never,
      input.environment,
      input.userId,
    );
    return { ok: Boolean(result.ok), message: safeMessage(result.detail ?? (result.ok ? "Connected." : "Failed.")) };
  }

  if (!input.id) return { ok: false, message: "Provider missing." };
  const supabase = await db();
  const { loadManagedProviderCredentials } = await import("@/lib/managed-sending.server");
  const { testProviderCredentials } = await import("@/lib/provider-credentials.server");

  const { data: row } = await supabase
    .from("email_providers")
    .select("id, provider")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, message: "Provider not found." };

  const managed = await loadManagedProviderCredentials(supabase, {
    provider: (row as { provider: string }).provider,
    provider_id: (row as { id: string }).id,
  });
  if (!managed) return { ok: false, message: "Not configured" };

  const test = await testProviderCredentials(managed.provider, managed.credentials);
  const message = safeMessage(test.message);
  await supabase
    .from("email_providers")
    .update({
      status: test.ok ? "verified" : "failed",
      last_tested_at: new Date().toISOString(),
      last_error: test.ok ? null : message,
    } as never)
    .eq("id", input.id);
  return { ok: test.ok, message };
}

/** Strips anything that looks like a key or bearer token from provider output. */
export function safeMessage(message: string | null | undefined): string {
  if (!message) return "No detail returned.";
  return message
    .replace(/(?:Bearer\s+)?[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/\b(sk|pk|re|key|secret)_[A-Za-z0-9_-]+/gi, "[redacted]")
    .slice(0, 400);
}

export async function setSendingProviderEnabled(id: string, enabled: boolean) {
  const supabase = await db();
  const { error } = await supabase
    .from("email_providers")
    .update({ is_enabled: enabled } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setSendingProviderPriority(id: string, priority: number) {
  const supabase = await db();
  const { error } = await supabase
    .from("email_providers")
    .update({ priority } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export async function loadWebhookActivity(filters: {
  source?: "all" | "billing" | "referral" | "integration" | undefined;
  status?: string | undefined;
  search?: string | undefined;
}): Promise<WebhookRow[]> {
  const supabase = await db();
  const source = filters.source ?? "all";
  const rows: WebhookRow[] = [];

  if (source === "all" || source === "billing") {
    const { data } = await supabase
      .from("billing_webhook_events")
      .select(
        "id, provider, environment, event_type, status, signature_ok, received_at, processed_at, retry_count, error",
      )
      .order("received_at", { ascending: false })
      .limit(250);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      rows.push({
        id: String(r["id"]),
        source: "billing",
        provider: String(r["provider"]),
        event: String(r["event_type"] ?? "—"),
        status: String(r["status"]),
        signatureOk: r["signature_ok"] as boolean,
        receivedAt: String(r["received_at"]),
        processedAt: (r["processed_at"] as string | null) ?? null,
        retryCount: Number(r["retry_count"] ?? 0),
        error: safeNullable(r["error"] as string | null),
        environment: String(r["environment"]),
        // Retry replays the stored, already signature-verified payload only.
        canRetry: Boolean(r["signature_ok"]) && String(r["status"]) !== "processed",
      });
    }
  }

  if (source === "all" || source === "referral") {
    const { data } = await supabase
      .from("referral_webhook_events")
      .select("id, provider, event_type, result, signature_ok, received_at, error, status_code")
      .order("received_at", { ascending: false })
      .limit(250);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      rows.push({
        id: String(r["id"]),
        source: "referral",
        provider: String(r["provider"]),
        event: String(r["event_type"] ?? "—"),
        status: String(r["result"] ?? (Number(r["status_code"]) < 300 ? "processed" : "failed")),
        signatureOk: r["signature_ok"] as boolean,
        receivedAt: String(r["received_at"]),
        processedAt: null,
        retryCount: 0,
        error: safeNullable(r["error"] as string | null),
        environment: "live",
        canRetry: false,
      });
    }
  }

  if (source === "all" || source === "integration") {
    const { data } = await supabase
      .from("integration_events")
      .select("id, slug, event_type, status, message, created_at, direction")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(250);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      rows.push({
        id: String(r["id"]),
        source: "integration",
        provider: String(r["slug"]),
        event: String(r["event_type"]),
        status: String(r["status"]),
        signatureOk: null,
        receivedAt: String(r["created_at"]),
        processedAt: null,
        retryCount: 0,
        error: safeNullable(r["message"] as string | null),
        environment: "live",
        canRetry: false,
      });
    }
  }

  const search = (filters.search ?? "").trim().toLowerCase();
  return rows
    .filter((r) => (filters.status && filters.status !== "all" ? r.status === filters.status : true))
    .filter((r) =>
      search
        ? `${r.provider} ${r.event} ${r.status} ${r.error ?? ""}`.toLowerCase().includes(search)
        : true,
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .slice(0, 300);
}

function safeNullable(value: string | null) {
  return value ? safeMessage(value) : null;
}

export async function loadWebhookDetail(source: WebhookRow["source"], id: string) {
  const supabase = await db();
  if (source === "billing") {
    const { data } = await supabase
      .from("billing_webhook_events")
      .select("id, provider, environment, event_id, event_type, status, signature_ok, received_at, processed_at, retry_count, error, http_status, payload")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new Error("Event not found");
    const row = data as Record<string, unknown>;
    return {
      id: String(row["id"]),
      provider: String(row["provider"]),
      environment: String(row["environment"]),
      eventId: String(row["event_id"]),
      event: String(row["event_type"] ?? "—"),
      status: String(row["status"]),
      signatureOk: Boolean(row["signature_ok"]),
      receivedAt: String(row["received_at"]),
      processedAt: (row["processed_at"] as string | null) ?? null,
      retryCount: Number(row["retry_count"] ?? 0),
      httpStatus: (row["http_status"] as number | null) ?? null,
      error: safeNullable(row["error"] as string | null),
      payload: row["payload"] ?? null,
    };
  }

  const table = source === "referral" ? "referral_webhook_events" : "integration_events";
  const { data } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Event not found");
  const row = data as Record<string, unknown>;
  return {
    id: String(row["id"]),
    provider: String(row["provider"] ?? row["slug"] ?? source),
    environment: "live",
    eventId: String(row["event_id"] ?? row["idempotency_key"] ?? row["id"]),
    event: String(row["event_type"] ?? "—"),
    status: String(row["result"] ?? row["status"] ?? "—"),
    signatureOk: row["signature_ok"] === undefined ? null : Boolean(row["signature_ok"]),
    receivedAt: String(row["received_at"] ?? row["created_at"]),
    processedAt: null,
    retryCount: 0,
    httpStatus: (row["status_code"] as number | null) ?? null,
    error: safeNullable((row["error"] ?? row["message"]) as string | null),
    payload: row["payload"] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Environment & secrets                                               */
/* ------------------------------------------------------------------ */

type EnvSpec = { name: string; group: string; required: boolean; environment?: "shared" | "test" | "live"; note: string };

const ENV_SPECS: EnvSpec[] = [
  { name: "SUPABASE_URL", group: "Database & auth", required: true, note: "Backend API endpoint." },
  { name: "SUPABASE_PUBLISHABLE_KEY", group: "Database & auth", required: true, note: "Public key used for user-scoped reads." },
  { name: "SUPABASE_SERVICE_ROLE_KEY", group: "Database & auth", required: true, note: "Privileged server-only key." },

  { name: "PROVIDER_CREDENTIALS_KEY", group: "Encryption", required: true, note: "Encrypts stored provider/integration credentials." },

  { name: "RESEND_API_KEY", group: "Email infrastructure", required: true, note: "Primary managed sending provider." },
  { name: "SENDGRID_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },
  { name: "MAILGUN_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },
  { name: "POSTMARK_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },
  { name: "BREVO_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },
  { name: "ZEPTOMAIL_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },
  { name: "EMAILIT_API_KEY", group: "Email infrastructure", required: false, note: "Optional fallback sending provider." },

  { name: "INBOUND_EMAIL_SECRET", group: "Inbound & webhooks", required: true, note: "Shared secret for the inbound email endpoint." },
  { name: "RESEND_WEBHOOK_SECRET", group: "Inbound & webhooks", required: true, note: "Svix signing secret for Resend webhooks." },
  { name: "INBOUND_WEBHOOK_SIGNING_SECRET", group: "Inbound & webhooks", required: false, note: "Optional HMAC secret for custom inbound senders." },
  { name: "REFERRAL_BILLING_SECRET", group: "Inbound & webhooks", required: false, note: "Verifies referral billing webhooks." },
  { name: "CRON_SECRET", group: "Inbound & webhooks", required: false, note: "Protects scheduled job endpoints." },

  { name: "STRIPE_SECRET_KEY_TEST", group: "Billing", required: false, environment: "test", note: "Stripe sandbox API key." },
  { name: "STRIPE_WEBHOOK_SECRET_TEST", group: "Billing", required: false, environment: "test", note: "Stripe sandbox webhook secret." },
  { name: "STRIPE_SECRET_KEY_LIVE", group: "Billing", required: false, environment: "live", note: "Stripe production API key." },
  { name: "STRIPE_WEBHOOK_SECRET_LIVE", group: "Billing", required: false, environment: "live", note: "Stripe production webhook secret." },
  { name: "PADDLE_API_KEY_TEST", group: "Billing", required: false, environment: "test", note: "Paddle sandbox API key." },
  { name: "PADDLE_WEBHOOK_SECRET_TEST", group: "Billing", required: false, environment: "test", note: "Paddle sandbox webhook secret." },
  { name: "PADDLE_API_KEY_LIVE", group: "Billing", required: false, environment: "live", note: "Paddle production API key." },
  { name: "PADDLE_WEBHOOK_SECRET_LIVE", group: "Billing", required: false, environment: "live", note: "Paddle production webhook secret." },
  { name: "LEMONSQUEEZY_API_KEY_TEST", group: "Billing", required: false, environment: "test", note: "Lemon Squeezy sandbox API key." },
  { name: "LEMONSQUEEZY_API_KEY_LIVE", group: "Billing", required: false, environment: "live", note: "Lemon Squeezy production API key." },
  { name: "LEMONSQUEEZY_STORE_ID_LIVE", group: "Billing", required: false, environment: "live", note: "Lemon Squeezy store id." },

  { name: "LOVABLE_API_KEY", group: "AI", required: false, note: "AI gateway credential for copy assistance." },
  { name: "OPENAI_API_KEY", group: "AI", required: false, note: "Optional direct OpenAI credential." },

  { name: "PUBLIC_APP_URL", group: "Application", required: false, note: "Absolute URL used in outbound emails." },
];

export async function loadEnvironmentStatus(): Promise<{
  appEnvironment: string;
  billingEnvironment: BillingEnvironment;
  vars: EnvVarStatus[];
}> {
  const supabase = await db();
  const { getBillingSettings } = await import("@/lib/billing/core.server");
  const settings = await getBillingSettings();

  // Last verification signal we actually have: provider test timestamps.
  const { data: providerRows } = await supabase
    .from("email_providers")
    .select("provider, status, last_tested_at");
  const { platformKeyFor } = await import("@/lib/managed-sending.server");
  const verified = new Map<string, { at: string | null; ok: boolean }>();
  for (const row of (providerRows ?? []) as Array<Record<string, unknown>>) {
    const key = platformKeyFor(String(row["provider"]));
    if (!key) continue;
    verified.set(key, {
      at: (row["last_tested_at"] as string | null) ?? null,
      ok: String(row["status"]) === "verified",
    });
  }

  const vars: EnvVarStatus[] = ENV_SPECS.map((spec) => {
    const configured = present(spec.name);
    const check = verified.get(spec.name);
    let state: EnvVarStatus["state"] = configured ? "NOT TESTED" : "MISSING";
    if (configured && check?.at) state = check.ok ? "CONFIGURED" : "INVALID";
    else if (configured && !check) state = "CONFIGURED";
    return {
      name: spec.name,
      group: spec.group,
      required: spec.required,
      configured,
      environment: spec.environment ?? "shared",
      state,
      note: spec.note,
      lastVerifiedAt: check?.at ?? null,
    };
  });

  return {
    appEnvironment: process.env["NODE_ENV"] === "production" ? "production" : "development",
    billingEnvironment: settings.environment,
    vars,
  };
}
