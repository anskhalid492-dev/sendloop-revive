/**
 * MunchReach transactional email engine (server only).
 *
 * Responsibilities:
 *  - resolve the template for an application event (stored copy, else default)
 *  - render subject/html/text with whitelisted variables only
 *  - enqueue the message in `transactional_emails` (idempotent)
 *  - deliver queued messages through MunchReach-managed sending infrastructure
 *
 * Templates are content, never code. Customers never supply provider keys and
 * never see provider names.
 */
import { DEFAULT_TEMPLATES, defaultTemplate } from "@/lib/transactional/catalog";
import { htmlToText } from "@/lib/transactional/layout";
import {
  SAMPLE_VARIABLES,
  extractVariables,
  invalidVariables,
  renderTemplateString,
} from "@/lib/transactional/variables";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

const SETTINGS_KEY = "transactional_email";
const LEASE_MS = 4 * 60 * 1000;

export type TransactionalSettings = {
  enabled: boolean;
  paused: boolean;
  pause_reason?: string | null;
  test_mode: boolean;
  test_recipient?: string | null;
  from_name: string;
  from_email: string;
  reply_to: string;
  retry_count: number;
  retry_delay_seconds: number;
  batch_size: number;
  lease_until?: string | null;
};

const DEFAULT_SETTINGS: TransactionalSettings = {
  enabled: true,
  paused: false,
  test_mode: false,
  from_name: "MunchReach",
  from_email: "support@munchreach.com",
  reply_to: "support@munchreach.com",
  retry_count: 3,
  retry_delay_seconds: 300,
  batch_size: 25,
};

export async function getTransactionalSettings(admin: Admin): Promise<TransactionalSettings> {
  const { data } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data?.value ?? {}) as Partial<TransactionalSettings>) };
}

export async function saveTransactionalSettings(
  admin: Admin,
  patch: { [K in keyof TransactionalSettings]?: TransactionalSettings[K] | undefined },
): Promise<TransactionalSettings> {
  const current = await getTransactionalSettings(admin);
  const next: TransactionalSettings = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
    if (value === null) (next as Record<string, unknown>)[key] = null;
  }
  await admin.from("platform_settings").upsert({ key: SETTINGS_KEY, value: next }, { onConflict: "key" });
  return next;
}

/* ------------------------------------------------------------- templates */

export type StoredTemplate = {
  id: string;
  event_key: string;
  name: string;
  category: string;
  enabled: boolean;
  status: string;
  version: number;
  subject: string;
  preheader: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  html: string;
  text_body: string | null;
  variables: string[];
  draft: Record<string, unknown> | null;
  is_default: boolean;
  updated_at: string;
};

/** Seeds every catalog template that does not exist yet. Never overwrites edits. */
export async function ensureDefaultTemplates(admin: Admin): Promise<{ created: number }> {
  const { data } = await admin.from("transactional_templates").select("event_key");
  const existing = new Set(((data ?? []) as { event_key: string }[]).map((r) => r.event_key));
  const missing = DEFAULT_TEMPLATES.filter((t) => !existing.has(t.eventKey));
  if (missing.length === 0) return { created: 0 };

  await admin.from("transactional_templates").insert(
    missing.map((t) => ({
      event_key: t.eventKey,
      name: t.name,
      category: t.category,
      subject: t.subject,
      preheader: t.preheader,
      html: t.html,
      text_body: t.text,
      variables: t.variables,
      is_default: true,
      enabled: true,
      status: "published",
      version: 1,
    })),
  );
  return { created: missing.length };
}

/** Restores one template to its shipped default (published as a new version). */
export async function restoreDefaultTemplate(admin: Admin, eventKey: string, userId: string | null) {
  const def = defaultTemplate(eventKey);
  if (!def) throw new Error("Unknown template");
  const { data: current } = await admin
    .from("transactional_templates")
    .select("id, version")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (!current) {
    await ensureDefaultTemplates(admin);
    return;
  }
  const version = (current.version ?? 1) + 1;
  await admin
    .from("transactional_templates")
    .update({
      name: def.name,
      category: def.category,
      subject: def.subject,
      preheader: def.preheader,
      html: def.html,
      text_body: def.text,
      variables: def.variables,
      from_name: null,
      from_email: null,
      reply_to: null,
      draft: null,
      is_default: true,
      status: "published",
      version,
      updated_by: userId,
    })
    .eq("id", current.id);
  await admin.from("transactional_template_versions").insert({
    template_id: current.id,
    version,
    subject: def.subject,
    preheader: def.preheader,
    html: def.html,
    text_body: def.text,
    published_by: userId,
  });
}

export type TemplateDraftInput = {
  subject: string;
  preheader?: string | null | undefined;
  from_name?: string | null | undefined;
  from_email?: string | null | undefined;
  reply_to?: string | null | undefined;
  html: string;
  text_body?: string | null | undefined;
};

/** Validation shared by draft saves and publishes. */
export function validateTemplateInput(input: TemplateDraftInput): string[] {
  const errors: string[] = [];
  if (!input.subject.trim()) errors.push("Subject is required.");
  if (!input.html.trim()) errors.push("Email body is required.");
  const bad = invalidVariables(input.subject, input.preheader, input.html, input.text_body);
  if (bad.length > 0) errors.push(`Unknown variables: ${bad.map((b) => `{{${b}}}`).join(", ")}`);
  if (/<script/i.test(input.html)) errors.push("Scripts are not allowed in email templates.");
  return errors;
}

export async function publishTemplate(
  admin: Admin,
  eventKey: string,
  input: TemplateDraftInput,
  userId: string | null,
) {
  const errors = validateTemplateInput(input);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const { data: current } = await admin
    .from("transactional_templates")
    .select("id, version")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (!current) throw new Error("Unknown template");

  const version = (current.version ?? 1) + 1;
  const text = input.text_body?.trim() ? input.text_body : htmlToText(input.html);

  await admin
    .from("transactional_templates")
    .update({
      subject: input.subject,
      preheader: input.preheader ?? null,
      from_name: input.from_name ?? null,
      from_email: input.from_email ?? null,
      reply_to: input.reply_to ?? null,
      html: input.html,
      text_body: text,
      variables: extractVariables(input.subject, input.html, text),
      draft: null,
      is_default: false,
      status: "published",
      version,
      updated_by: userId,
    })
    .eq("id", current.id);

  await admin.from("transactional_template_versions").insert({
    template_id: current.id,
    version,
    subject: input.subject,
    preheader: input.preheader ?? null,
    from_name: input.from_name ?? null,
    from_email: input.from_email ?? null,
    reply_to: input.reply_to ?? null,
    html: input.html,
    text_body: text,
    published_by: userId,
  });

  return { version };
}

export async function rollbackTemplate(admin: Admin, eventKey: string, version: number, userId: string | null) {
  const { data: tpl } = await admin
    .from("transactional_templates")
    .select("id, version")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (!tpl) throw new Error("Unknown template");
  const { data: snapshot } = await admin
    .from("transactional_template_versions")
    .select("subject, preheader, from_name, from_email, reply_to, html, text_body")
    .eq("template_id", tpl.id)
    .eq("version", version)
    .maybeSingle();
  if (!snapshot) throw new Error("Version not found");
  return publishTemplate(admin, eventKey, snapshot as TemplateDraftInput, userId);
}

/* --------------------------------------------------------------- render */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  missingVariables: string[];
};

export async function renderTemplate(
  admin: Admin,
  eventKey: string,
  variables: Record<string, unknown>,
  options: { useDraft?: boolean } = {},
): Promise<{ template: StoredTemplate | null; rendered: RenderedEmail } | null> {
  const settings = await getTransactionalSettings(admin);
  const { data } = await admin
    .from("transactional_templates")
    .select("*")
    .eq("event_key", eventKey)
    .maybeSingle();
  const stored = (data ?? null) as StoredTemplate | null;
  const fallback = defaultTemplate(eventKey);
  if (!stored && !fallback) return null;

  const draft = options.useDraft ? ((stored?.draft ?? null) as TemplateDraftInput | null) : null;
  const source = {
    subject: draft?.subject ?? stored?.subject ?? fallback!.subject,
    preheader: draft?.preheader ?? stored?.preheader ?? fallback!.preheader,
    html: draft?.html ?? stored?.html ?? fallback!.html,
    text: draft?.text_body ?? stored?.text_body ?? fallback!.text,
    fromName: draft?.from_name ?? stored?.from_name ?? settings.from_name,
    fromEmail: draft?.from_email ?? stored?.from_email ?? settings.from_email,
    replyTo: draft?.reply_to ?? stored?.reply_to ?? settings.reply_to,
  };

  const used = extractVariables(source.subject, source.html, source.text);
  const missingVariables = used.filter((key) => {
    const value = variables[key];
    return value === undefined || value === null || String(value).length === 0;
  });

  return {
    template: stored,
    rendered: {
      subject: renderTemplateString(source.subject, variables, "text").trim(),
      html: renderTemplateString(source.html, variables, "html"),
      text: renderTemplateString(source.text || htmlToText(source.html), variables, "text"),
      fromName: source.fromName,
      fromEmail: source.fromEmail,
      replyTo: source.replyTo,
      missingVariables,
    },
  };
}

/** Preview rendering for the admin editor — uses sample data for gaps. */
export async function previewTemplate(
  admin: Admin,
  eventKey: string,
  overrides: Record<string, string> = {},
  options: { useDraft?: boolean } = {},
) {
  return renderTemplate(admin, eventKey, { ...SAMPLE_VARIABLES, ...overrides }, options);
}

/* ---------------------------------------------------------------- queue */

export type TriggerInput = {
  eventKey: string;
  to: string;
  variables?: Record<string, unknown>;
  idempotencyKey?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  testMode?: boolean;
};

export type TriggerResult = {
  queued: boolean;
  id?: string;
  reason?: string;
};

function baseUrl(): string {
  return (
    process.env["APP_URL"] ||
    process.env["VITE_APP_URL"] ||
    "https://project--1068fd05-79ee-44fc-9230-0fbdfc76d42c-dev.lovable.app"
  );
}

/** Global defaults merged under every trigger's variables. */
function withGlobals(variables: Record<string, unknown>): Record<string, unknown> {
  const app = baseUrl();
  return {
    "brand.name": "MunchReach",
    dashboard_url: `${app}/dashboard`,
    login_url: `${app}/auth`,
    support_url: `${app}/help`,
    action_url: `${app}/dashboard`,
    ...variables,
  };
}

/**
 * Enqueues one transactional email for an application event. Safe to call from
 * any server path: it never throws and never blocks the caller's own work.
 */
export async function triggerTransactionalEmail(
  admin: Admin,
  input: TriggerInput,
): Promise<TriggerResult> {
  try {
    const settings = await getTransactionalSettings(admin);
    if (!settings.enabled) return { queued: false, reason: "Transactional email is disabled." };

    const to = input.to?.trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { queued: false, reason: "Invalid recipient." };

    const { data: tpl } = await admin
      .from("transactional_templates")
      .select("id, version, enabled")
      .eq("event_key", input.eventKey)
      .maybeSingle();
    if (tpl && tpl.enabled === false) return { queued: false, reason: "Template disabled." };

    const variables = withGlobals(input.variables ?? {});
    const render = await renderTemplate(admin, input.eventKey, variables);
    if (!render) return { queued: false, reason: "No template for this event." };

    const testMode = input.testMode ?? settings.test_mode;
    const recipient = testMode && settings.test_recipient ? settings.test_recipient : to;

    const row = {
      event_key: input.eventKey,
      template_id: tpl?.id ?? null,
      template_version: tpl?.version ?? null,
      to_email: recipient,
      from_email: render.rendered.fromEmail,
      reply_to: render.rendered.replyTo,
      subject: render.rendered.subject,
      html: render.rendered.html,
      text_body: render.rendered.text,
      variables,
      status: "queued",
      max_attempts: Math.max(1, settings.retry_count),
      idempotency_key: input.idempotencyKey ?? null,
      test_mode: testMode,
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
    };

    const { data, error } = await admin
      .from("transactional_emails")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      // Duplicate idempotency key means the event was already queued.
      if (String(error.code) === "23505") return { queued: false, reason: "Already queued." };
      console.error("transactional trigger failed", input.eventKey, error);
      return { queued: false, reason: "Could not queue email." };
    }
    return { queued: true, id: data?.id };
  } catch (error) {
    console.error("transactional trigger error", input.eventKey, error);
    return { queued: false, reason: "Could not queue email." };
  }
}

/* -------------------------------------------------------------- delivery */

export type QueueRunSummary = {
  ok: boolean;
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped?: string;
  errors: string[];
};

/** Single-flight lease held in platform settings. */
async function acquireLease(admin: Admin): Promise<{ acquired: boolean; settings: TransactionalSettings }> {
  const settings = await getTransactionalSettings(admin);
  const now = Date.now();
  if (settings.lease_until && new Date(settings.lease_until).getTime() > now) {
    return { acquired: false, settings };
  }
  await saveTransactionalSettings(admin, { lease_until: new Date(now + LEASE_MS).toISOString() });
  return { acquired: true, settings };
}

async function releaseLease(admin: Admin) {
  await saveTransactionalSettings(admin, { lease_until: null });
}

async function deliver(
  admin: Admin,
  row: {
    id: string;
    to_email: string;
    from_email: string | null;
    reply_to: string | null;
    subject: string;
    html: string | null;
    text_body: string | null;
  },
  settings: TransactionalSettings,
) {
  const { resolveManagedProvider, recordProviderIncident } = await import("@/lib/managed-sending.server");
  const { getAdapter } = await import("@/lib/providers/adapter.server");

  const fromEmail = row.from_email || settings.from_email;
  const managed = await resolveManagedProvider(admin, {
    provider: "resend",
    provider_id: null,
    from_email: fromEmail,
  });
  if (!managed) return { ok: false, error: "Sending infrastructure is not configured.", provider: null };

  const adapter = getAdapter(managed.provider);
  const result = await adapter.sendEmail(managed.credentials, {
    fromName: settings.from_name,
    fromEmail,
    replyTo: row.reply_to || settings.reply_to,
    to: row.to_email,
    subject: row.subject,
    text: row.text_body || "",
    ...(row.html ? { html: row.html } : {}),
    headers: { "X-MunchReach-Type": "transactional" },
  });

  await recordProviderIncident(admin, managed.providerId, result.ok ? null : result.providerResponse ?? result.message);

  return {
    ok: result.ok,
    provider: managed.provider,
    messageId: result.messageId ?? null,
    statusCode: result.statusCode ?? null,
    error: result.ok ? null : result.providerResponse || result.message,
  };
}

/**
 * Processes one bounded batch of queued transactional emails.
 * Bounded, single-flight, idempotent per row, and it stops while paused.
 */
export async function processTransactionalQueue(
  admin: Admin,
  options: { limit?: number } = {},
): Promise<QueueRunSummary> {
  const summary: QueueRunSummary = { ok: true, claimed: 0, sent: 0, failed: 0, retried: 0, errors: [] };

  const { acquired, settings } = await acquireLease(admin);
  if (settings.paused) {
    if (acquired) await releaseLease(admin);
    return { ...summary, ok: false, skipped: `Paused: ${settings.pause_reason ?? "manual"}` };
  }
  if (!settings.enabled) {
    if (acquired) await releaseLease(admin);
    return { ...summary, ok: false, skipped: "Transactional email disabled" };
  }
  if (!acquired) return { ...summary, ok: true, skipped: "Another run is in progress" };

  try {
    const limit = Math.min(Math.max(1, options.limit ?? settings.batch_size), 100);
    const nowIso = new Date().toISOString();
    const { data: pending } = await admin
      .from("transactional_emails")
      .select("id, to_email, from_email, reply_to, subject, html, text_body, attempts, max_attempts")
      .in("status", ["queued", "retrying"])
      .lte("next_attempt_at", nowIso)
      .order("queued_at", { ascending: true })
      .limit(limit);

    for (const row of (pending ?? []) as Array<{
      id: string;
      to_email: string;
      from_email: string | null;
      reply_to: string | null;
      subject: string;
      html: string | null;
      text_body: string | null;
      attempts: number;
      max_attempts: number;
    }>) {
      // Atomic claim: only one runner can move a row out of the queued state.
      const { data: claimed } = await admin
        .from("transactional_emails")
        .update({ status: "sending", attempts: row.attempts + 1 })
        .eq("id", row.id)
        .in("status", ["queued", "retrying"])
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      summary.claimed += 1;

      const attempt = row.attempts + 1;
      let outcome;
      try {
        outcome = await deliver(admin, row, settings);
      } catch (error) {
        outcome = { ok: false, provider: null, error: error instanceof Error ? error.message : "Send failed" };
      }

      if (outcome.ok) {
        summary.sent += 1;
        await admin
          .from("transactional_emails")
          .update({
            status: "sent",
            provider: outcome.provider,
            provider_message_id: "messageId" in outcome ? outcome.messageId : null,
            provider_status_code: "statusCode" in outcome ? outcome.statusCode : null,
            error: null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }

      const message = outcome.error ?? "Send failed";
      summary.errors.push(`${row.id}: ${message}`.slice(0, 300));
      if (attempt < Math.max(1, row.max_attempts)) {
        summary.retried += 1;
        const delay = settings.retry_delay_seconds * Math.pow(2, attempt - 1);
        await admin
          .from("transactional_emails")
          .update({
            status: "retrying",
            provider: outcome.provider,
            error: message.slice(0, 1000),
            next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
          })
          .eq("id", row.id);
      } else {
        summary.failed += 1;
        await admin
          .from("transactional_emails")
          .update({
            status: "failed",
            provider: outcome.provider,
            error: message.slice(0, 1000),
            failed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }
  } catch (error) {
    summary.ok = false;
    summary.errors.push(error instanceof Error ? error.message : "Queue run failed");
  } finally {
    await releaseLease(admin);
  }

  return summary;
}

/** Queues and immediately attempts a single email (used by admin test sends). */
export async function sendTransactionalNow(
  admin: Admin,
  input: TriggerInput,
): Promise<{ ok: boolean; message: string; id?: string }> {
  const queued = await triggerTransactionalEmail(admin, input);
  if (!queued.queued || !queued.id) return { ok: false, message: queued.reason ?? "Could not queue email." };
  const run = await processTransactionalQueue(admin, { limit: 5 });
  const { data } = await admin
    .from("transactional_emails")
    .select("status, error")
    .eq("id", queued.id)
    .maybeSingle();
  if (data?.status === "sent") return { ok: true, message: "Email sent.", id: queued.id };
  return {
    ok: false,
    message: data?.error || run.skipped || "The email is queued and will be retried shortly.",
    id: queued.id,
  };
}

/** Marks provider delivery/bounce feedback against a transactional message. */
export async function recordTransactionalEvent(
  admin: Admin,
  event: { messageId: string | null; type: string; reason?: string | null },
): Promise<boolean> {
  if (!event.messageId) return false;
  const patch: Record<string, unknown> = {};
  if (event.type === "delivered") {
    patch["status"] = "delivered";
    patch["delivered_at"] = new Date().toISOString();
  } else if (event.type === "bounced" || event.type === "complained") {
    patch["status"] = event.type === "bounced" ? "bounced" : "complained";
    patch["bounce_reason"] = event.reason ?? null;
    patch["failed_at"] = new Date().toISOString();
  } else {
    return false;
  }
  const { data } = await admin
    .from("transactional_emails")
    .update(patch)
    .eq("provider_message_id", event.messageId)
    .select("id")
    .maybeSingle();
  return !!data;
}
