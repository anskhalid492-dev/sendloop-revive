/**
 * Inbound operations: admin alerting, automatic retry with backoff, redacted
 * event detail and reconciliation between webhook events and inbox threads.
 *
 * All settings live in `platform_settings.inbound_ops` so nothing here needs a
 * schema change, and no provider credential is ever returned to the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { safeFetch } from "@/lib/ssrf-guard.server";

export type InboundOpsSettings = {
  maxRetries: number;
  backoffMinutes: number;
  backoffFactor: number;
  retryEnabled: boolean;
  notifyEmail: string | null;
  notifyWebhookUrl: string | null;
  notifyOnSignatureFailure: boolean;
  notifyOnRetryThreshold: boolean;
  retryAlertThreshold: number;
};

export const DEFAULT_INBOUND_OPS: InboundOpsSettings = {
  maxRetries: 5,
  backoffMinutes: 5,
  backoffFactor: 2,
  retryEnabled: true,
  notifyEmail: null,
  notifyWebhookUrl: null,
  notifyOnSignatureFailure: true,
  notifyOnRetryThreshold: true,
  retryAlertThreshold: 3,
};

export async function getInboundOpsSettings(): Promise<InboundOpsSettings> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "inbound_ops")
    .maybeSingle();
  const value = (data?.value ?? {}) as Partial<InboundOpsSettings>;
  return { ...DEFAULT_INBOUND_OPS, ...value };
}

export async function saveInboundOpsSettings(
  patch: Partial<InboundOpsSettings>,
): Promise<InboundOpsSettings> {
  const next = { ...(await getInboundOpsSettings()), ...patch };
  const { error } = await supabaseAdmin
    .from("platform_settings")
    .upsert({ key: "inbound_ops", value: next as never }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return next;
}

/** Grace period before an event recorded but never processed is retried. */
export const STALLED_GRACE_MS = 60_000;

/** Backoff delay in minutes for the nth attempt. */
export function backoffMinutes(settings: InboundOpsSettings, attempt: number) {
  const factor = Math.max(1, settings.backoffFactor);
  return Math.round(settings.backoffMinutes * Math.pow(factor, Math.max(0, attempt - 1)));
}

type AlertKind = "signature_failure" | "retry_threshold" | "retry_exhausted";

/**
 * Sends an admin alert by email (through the managed Resend key) and/or an
 * outbound webhook. Failures are swallowed: alerting must never break
 * inbound processing.
 */
export async function notifyAdmins(
  kind: AlertKind,
  title: string,
  detail: Record<string, unknown>,
) {
  const settings = await getInboundOpsSettings();
  if (kind === "signature_failure" && !settings.notifyOnSignatureFailure) return;
  if (kind !== "signature_failure" && !settings.notifyOnRetryThreshold) return;

  const body = { kind, title, detail, at: new Date().toISOString() };

  /** Records one delivery attempt in the admin notification audit log. */
  const audit = async (row: {
    channel: "webhook" | "email";
    destination: string;
    status: "sent" | "failed" | "skipped";
    error?: string | null;
    responseCode?: number | null;
    durationMs?: number | null;
  }) => {
    try {
      await supabaseAdmin.from("admin_notifications").insert({
        kind,
        title,
        channel: row.channel,
        destination: row.destination,
        status: row.status,
        error: row.error ?? null,
        response_code: row.responseCode ?? null,
        duration_ms: row.durationMs ?? null,
        detail: (redact(detail) ?? {}) as never,
      });
    } catch {
      /* auditing is best effort */
    }
  };

  if (settings.notifyWebhookUrl) {
    const started = Date.now();
    try {
      const res = await safeFetch(settings.notifyWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await audit({
        channel: "webhook",
        destination: settings.notifyWebhookUrl,
        status: res.ok ? "sent" : "failed",
        responseCode: res.status,
        durationMs: Date.now() - started,
        error: res.ok ? null : (await res.text().catch(() => "")).slice(0, 500) || `HTTP ${res.status}`,
      });
    } catch (error) {
      await audit({
        channel: "webhook",
        destination: settings.notifyWebhookUrl,
        status: "failed",
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Request failed",
      });
    }
  }

  const key = process.env["RESEND_API_KEY"];
  if (settings.notifyEmail && !key) {
    await audit({
      channel: "email",
      destination: settings.notifyEmail,
      status: "skipped",
      error: "No sending key configured for alert email",
    });
  }
  if (settings.notifyEmail && key) {
    const lines = Object.entries(detail)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join("\n");
    const started = Date.now();
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: "MunchReach Alerts <onboarding@resend.dev>",
          to: [settings.notifyEmail],
          subject: `[MunchReach] ${title}`,
          text: `${title}\n\n${lines}\n`,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      await audit({
        channel: "email",
        destination: settings.notifyEmail,
        status: res.ok ? "sent" : "failed",
        responseCode: res.status,
        durationMs: Date.now() - started,
        error: res.ok ? null : (payload.message ?? `HTTP ${res.status}`),
      });
    } catch (error) {
      await audit({
        channel: "email",
        destination: settings.notifyEmail,
        status: "failed",
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Request failed",
      });
    }
  }

  if (!settings.notifyEmail && !settings.notifyWebhookUrl) {
    await audit({
      channel: "webhook",
      destination: "none",
      status: "skipped",
      error: "No alert destination configured",
    });
  }

  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: "inbound_last_alert",
      value: { kind, title, at: body.at, detail } as never,
    },
    { onConflict: "key" },
  );
}


export async function getLastAlert() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", "inbound_last_alert")
    .maybeSingle();
  const value = (data?.value ?? {}) as { kind?: string; title?: string; at?: string };
  return value.title ? { ...value, updatedAt: data?.updated_at ?? null } : null;
}

/**
 * Retries failed inbound events whose backoff window has elapsed. Events past
 * the retry ceiling are left alone and reported once.
 */
export async function runInboundRetrySweep(limit = 25) {
  const settings = await getInboundOpsSettings();
  if (!settings.retryEnabled) return { retried: 0, skipped: 0, exhausted: 0, disabled: true };

  const { data: rows, error } = await supabaseAdmin
    .from("email_events")
    .select("id, attempts, status, last_retry_at, created_at, failure_code, from_email, subject, workspace_id, conversation_id, lead_id, routing_token")
    // `pending` rows are events that were recorded but whose processing never
    // finished — the runtime cancelled it, so no error was ever written. They
    // are picked up after a short grace period instead of sitting unfiled.
    .in("status", ["failed", "retrying", "pending"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const now = Date.now();
  let retried = 0;
  let skipped = 0;
  let exhausted = 0;
  const { retryStoredEvent } = await import("@/lib/email-events.server");

  for (const row of rows ?? []) {
    if (retried >= limit) break;
    const attempts = row.attempts ?? 0;
    if (attempts >= settings.maxRetries) {
      exhausted += 1;
      continue;
    }
    const last = new Date(row.last_retry_at ?? row.created_at).getTime();
    // A stalled (never-processed) event is not a failure needing backoff: it is
    // simply unfinished work, so it is picked up after a one-minute grace.
    const wait =
      row.status === "pending" ? STALLED_GRACE_MS : backoffMinutes(settings, attempts + 1) * 60_000;
    if (now - last < wait) {
      skipped += 1;
      continue;
    }
    try {
      const result = await retryStoredEvent(row.id, false, null, "auto_retry");
      retried += 1;
      const nextAttempts = attempts + 1;
      if (result.status === "failed" || result.status === "unmatched") {
        if (nextAttempts >= settings.maxRetries) {
          await notifyAdmins("retry_exhausted", "Inbound event exhausted its retries", {
            eventId: row.id,
            attempts: nextAttempts,
            from: row.from_email,
            subject: row.subject,
            reason: result.reason ?? row.failure_code,
            workspaceId: row.workspace_id,
            conversationId: row.conversation_id,
            leadId: row.lead_id,
            token: row.routing_token,
          });
        } else if (nextAttempts >= settings.retryAlertThreshold) {
          await notifyAdmins("retry_threshold", "Inbound event passed the retry threshold", {
            eventId: row.id,
            attempts: nextAttempts,
            from: row.from_email,
            subject: row.subject,
            reason: result.reason ?? row.failure_code,
            workspaceId: row.workspace_id,
            conversationId: row.conversation_id,
            leadId: row.lead_id,
            token: row.routing_token,
          });
        }
      }
    } catch {
      skipped += 1;
    }
  }

  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: "inbound_retry_sweep",
      value: { retried, skipped, exhausted, at: new Date().toISOString() } as never,
    },
    { onConflict: "key" },
  );

  return { retried, skipped, exhausted, disabled: false };
}

const SENSITIVE_KEYS = /(auth|secret|token|password|api[_-]?key|signature|cookie|credential)/i;

/** Recursively redacts secrets and truncates huge blobs for safe display. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  if (typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? "[redacted]" : redact(raw, depth + 1);
  }
  return out;
}

/** Full detail for one event: redacted payload, routing lookup and links. */
export async function getEventDetail(id: string) {
  const { data: event, error } = await supabaseAdmin
    .from("email_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) throw new Error("Event not found");

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const headers =
    (payload["headers"] as Record<string, unknown> | undefined) ??
    ((payload["data"] as Record<string, unknown> | undefined)?.["headers"] as
      | Record<string, unknown>
      | undefined) ??
    null;

  let route: {
    token: string;
    purpose: string;
    workspace_id: string;
    conversation_id: string | null;
    lead_id: string | null;
    campaign_id: string | null;
    last_used_at: string | null;
  } | null = null;
  if (event.routing_token) {
    const { data } = await supabaseAdmin
      .from("inbound_routes")
      .select("token, purpose, workspace_id, conversation_id, lead_id, campaign_id, last_used_at")
      .eq("token", event.routing_token)
      .maybeSingle();
    route = data ?? null;
  }

  let conversation: {
    id: string;
    subject: string;
    prospect_email: string;
    status: string;
    workspace_id: string;
    message_count: number;
    last_message_at: string;
  } | null = null;
  if (event.conversation_id) {
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("id, subject, prospect_email, status, workspace_id, message_count, last_message_at")
      .eq("id", event.conversation_id)
      .maybeSingle();
    conversation = data ?? null;
  }

  let lead: { id: string; email: string; first_name: string | null; company: string | null } | null =
    null;
  if (event.lead_id) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, email, first_name, company")
      .eq("id", event.lead_id)
      .maybeSingle();
    lead = data ?? null;
  }

  const settings = await getInboundOpsSettings();
  const nextRetryAt =
    event.status === "failed" && (event.attempts ?? 0) < settings.maxRetries
      ? new Date(
          new Date(event.last_retry_at ?? event.created_at).getTime() +
            backoffMinutes(settings, (event.attempts ?? 0) + 1) * 60_000,
        ).toISOString()
      : null;

  return {
    event: { ...event, payload: null },
    payloadJson: JSON.stringify(redact(payload), null, 2),
    headersJson: headers ? JSON.stringify(redact(headers), null, 2) : null,
    route,
    conversation,
    lead,
    nextRetryAt,
    maxRetries: settings.maxRetries,
  };
}

export type ReconciliationRow = {
  id: string;
  created_at: string;
  from_email: string | null;
  subject: string | null;
  status: string;
  routing_token: string | null;
  token_status: string | null;
  conversation_id: string | null;
  issue: string;
  detail: string;
  fixable: boolean;
};

/**
 * Reconciles inbound webhook events against the unified inbox: every processed
 * inbound delivery should point at a live conversation that actually contains
 * the message. Anything else is reported with a concrete reason.
 */
export async function reconcileInboundEvents(limit = 300) {
  const { data: events, error } = await supabaseAdmin
    .from("email_events")
    .select(
      "id, created_at, from_email, subject, status, message_id, routing_token, token_status, conversation_id",
    )
    .eq("event_type", "inbound")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = events ?? [];

  const conversationIds = [...new Set(rows.map((r) => r.conversation_id).filter(Boolean))] as string[];
  const messageIds = [...new Set(rows.map((r) => r.message_id).filter(Boolean))] as string[];

  const liveConversations = new Set<string>();
  if (conversationIds.length) {
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .in("id", conversationIds);
    for (const c of data ?? []) liveConversations.add(c.id);
  }

  const messageIndex = new Map<string, string>();
  if (messageIds.length) {
    const { data } = await supabaseAdmin
      .from("conversation_messages")
      .select("message_id, conversation_id")
      .in("message_id", messageIds);
    for (const m of data ?? []) if (m.message_id) messageIndex.set(m.message_id, m.conversation_id);
  }

  const mismatches: ReconciliationRow[] = [];
  let linked = 0;

  for (const row of rows) {
    const threadForMessage = row.message_id ? messageIndex.get(row.message_id) : undefined;

    if (row.conversation_id && !liveConversations.has(row.conversation_id)) {
      mismatches.push({
        ...row,
        issue: "dangling_conversation",
        detail: "The event points at a conversation that no longer exists.",
        fixable: Boolean(threadForMessage),
      });
      continue;
    }

    if (!row.conversation_id && threadForMessage) {
      mismatches.push({
        ...row,
        issue: "missing_link",
        detail: "The message is in the inbox but the event was never linked to its thread.",
        fixable: true,
      });
      continue;
    }

    if (!row.conversation_id && row.status === "processed") {
      mismatches.push({
        ...row,
        issue: "no_conversation",
        detail: "Processed as inbound but no conversation was created for it.",
        fixable: false,
      });
      continue;
    }

    if (row.status === "failed") {
      mismatches.push({
        ...row,
        issue: "unprocessed",
        detail: "Inbound delivery never landed in a thread — retry or reprocess it.",
        fixable: Boolean(threadForMessage),
      });
      continue;
    }

    if (
      row.conversation_id &&
      threadForMessage &&
      threadForMessage !== row.conversation_id
    ) {
      mismatches.push({
        ...row,
        issue: "thread_mismatch",
        detail: "The stored message lives in a different thread than the event references.",
        fixable: true,
      });
      continue;
    }

    if (row.conversation_id) linked += 1;
  }

  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: "inbound_reconciliation",
      value: {
        scanned: rows.length,
        linked,
        mismatched: mismatches.length,
        at: new Date().toISOString(),
      } as never,
    },
    { onConflict: "key" },
  );

  return {
    scanned: rows.length,
    linked,
    mismatched: mismatches.length,
    mismatches: mismatches.slice(0, 100),
    checkedAt: new Date().toISOString(),
  };
}

/** Repairs one reconciliation mismatch by relinking the event to its thread. */
export async function repairEventLink(id: string) {
  const { data: event } = await supabaseAdmin
    .from("email_events")
    .select("id, message_id")
    .eq("id", id)
    .maybeSingle();
  if (!event) throw new Error("Event not found");
  if (!event.message_id) throw new Error("This event has no message id to match against.");

  const { data: message } = await supabaseAdmin
    .from("conversation_messages")
    .select("conversation_id, workspace_id")
    .eq("message_id", event.message_id)
    .maybeSingle();
  if (!message) throw new Error("No inbox message matches this event — retry it instead.");

  const { error } = await supabaseAdmin
    .from("email_events")
    .update({
      conversation_id: message.conversation_id,
      workspace_id: message.workspace_id,
      status: "processed",
      failure_code: null,
      error: null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return { conversationId: message.conversation_id };
}

export type InboundAlertContext = {
  token: string | null;
  tokenStatus: "matched" | "unmatched" | "none";
  workspaceId: string | null;
  workspaceName: string | null;
  conversationId: string | null;
  conversationSubject: string | null;
  leadId: string | null;
  prospectEmail: string | null;
  campaignId: string | null;
};

/**
 * Best-effort context for an inbound delivery that failed verification, so an
 * admin can jump straight to the affected workspace / inbox thread.
 * The payload is untrusted here, so nothing is written — we only look up ids.
 */
export async function resolveInboundAlertContext(rawBody: string): Promise<InboundAlertContext> {
  const empty: InboundAlertContext = {
    token: null,
    tokenStatus: "none",
    workspaceId: null,
    workspaceName: null,
    conversationId: null,
    conversationSubject: null,
    leadId: null,
    prospectEmail: null,
    campaignId: null,
  };

  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody.trimStart().startsWith("{")
      ? (JSON.parse(rawBody) as Record<string, unknown>)
      : (Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, unknown>);
  } catch {
    return empty;
  }

  const flat = JSON.stringify(payload);
  const addresses = flat.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const { tokenFromAddress } = await import("@/lib/inbound-routing.server");

  let token: string | null = null;
  for (const address of addresses) {
    const candidate = tokenFromAddress(address);
    if (candidate) {
      token = candidate;
      break;
    }
  }
  if (!token) {
    return { ...empty, prospectEmail: addresses[0] ?? null };
  }

  const { data: route } = await supabaseAdmin
    .from("inbound_routes")
    .select("workspace_id, conversation_id, lead_id, campaign_id")
    .eq("token", token)
    .maybeSingle();
  if (!route) {
    return { ...empty, token, tokenStatus: "unmatched", prospectEmail: addresses[0] ?? null };
  }

  const [{ data: workspace }, { data: conversation }] = await Promise.all([
    supabaseAdmin.from("workspaces").select("name").eq("id", route.workspace_id).maybeSingle(),
    route.conversation_id
      ? supabaseAdmin
          .from("conversations")
          .select("subject, prospect_email")
          .eq("id", route.conversation_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { subject: string; prospect_email: string } | null }),
  ]);

  return {
    token,
    tokenStatus: "matched",
    workspaceId: route.workspace_id,
    workspaceName: workspace?.name ?? null,
    conversationId: route.conversation_id,
    conversationSubject: conversation?.subject ?? null,
    leadId: route.lead_id,
    prospectEmail: conversation?.prospect_email ?? addresses[0] ?? null,
    campaignId: route.campaign_id,
  };
}
