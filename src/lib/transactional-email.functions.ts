/**
 * Admin API for the transactional email system.
 *
 * Every function re-checks the platform `admin` role. Templates, logs and
 * settings are never exposed to customers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

const draftSchema = z.object({
  subject: z.string().min(1).max(300),
  preheader: z.string().max(300).nullable().optional(),
  from_name: z.string().max(120).nullable().optional(),
  from_email: z.string().email().nullable().optional(),
  reply_to: z.string().email().nullable().optional(),
  html: z.string().min(1).max(200_000),
  text_body: z.string().max(100_000).nullable().optional(),
});

export const listTransactionalTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureDefaultTemplates, getTransactionalSettings } = await import(
      "@/lib/transactional-email.server"
    );
    await ensureDefaultTemplates(supabaseAdmin);

    const [{ data: templates }, settings] = await Promise.all([
      supabaseAdmin
        .from("transactional_templates")
        .select(
          "id, event_key, name, category, enabled, status, version, subject, preheader, from_name, from_email, reply_to, is_default, variables, draft, updated_at",
        )
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      getTransactionalSettings(supabaseAdmin),
    ]);

    const { data: counts } = await supabaseAdmin
      .from("transactional_emails")
      .select("event_key, status")
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .limit(5000);

    const usage: Record<string, { sent: number; failed: number }> = {};
    for (const row of (counts ?? []) as { event_key: string; status: string }[]) {
      const bucket = (usage[row.event_key] ??= { sent: 0, failed: 0 });
      if (["sent", "delivered"].includes(row.status)) bucket.sent += 1;
      if (["failed", "bounced", "complained"].includes(row.status)) bucket.failed += 1;
    }

    return { templates: templates ?? [], settings, usage };
  });

export const getTransactionalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string }) => z.object({ eventKey: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { previewTemplate } = await import("@/lib/transactional-email.server");

    const { data: template } = await supabaseAdmin
      .from("transactional_templates")
      .select("*")
      .eq("event_key", data.eventKey)
      .maybeSingle();
    if (!template) throw new Error("Template not found");

    const { data: versions } = await supabaseAdmin
      .from("transactional_template_versions")
      .select("id, version, subject, published_at, published_by")
      .eq("template_id", template.id)
      .order("version", { ascending: false })
      .limit(25);

    const preview = await previewTemplate(supabaseAdmin, data.eventKey, {}, { useDraft: !!template.draft });

    return { template, versions: versions ?? [], preview: preview?.rendered ?? null };
  });

export const previewTransactionalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; draft?: z.infer<typeof draftSchema> }) =>
    z.object({ eventKey: z.string().min(1), draft: draftSchema.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTransactionalSettings, validateTemplateInput } = await import(
      "@/lib/transactional-email.server"
    );
    const { renderTemplateString, SAMPLE_VARIABLES, extractVariables } = await import(
      "@/lib/transactional/variables"
    );
    const { htmlToText } = await import("@/lib/transactional/layout");

    if (data.draft) {
      const errors = validateTemplateInput(data.draft);
      const settings = await getTransactionalSettings(supabaseAdmin);
      const text = data.draft.text_body?.trim() ? data.draft.text_body : htmlToText(data.draft.html);
      return {
        errors,
        rendered: {
          subject: renderTemplateString(data.draft.subject, SAMPLE_VARIABLES, "text"),
          html: renderTemplateString(data.draft.html, SAMPLE_VARIABLES, "html"),
          text: renderTemplateString(text, SAMPLE_VARIABLES, "text"),
          fromName: data.draft.from_name ?? settings.from_name,
          fromEmail: data.draft.from_email ?? settings.from_email,
          replyTo: data.draft.reply_to ?? settings.reply_to,
          missingVariables: [] as string[],
        },
        variables: extractVariables(data.draft.subject, data.draft.html, text),
      };
    }

    const { previewTemplate } = await import("@/lib/transactional-email.server");
    const preview = await previewTemplate(supabaseAdmin, data.eventKey);
    return { errors: [] as string[], rendered: preview?.rendered ?? null, variables: [] as string[] };
  });

export const saveTransactionalDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; draft: z.infer<typeof draftSchema> }) =>
    z.object({ eventKey: z.string().min(1), draft: draftSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validateTemplateInput } = await import("@/lib/transactional-email.server");
    const errors = validateTemplateInput(data.draft);
    if (errors.length > 0) throw new Error(errors.join(" "));
    const { error } = await supabaseAdmin
      .from("transactional_templates")
      .update({ draft: data.draft, status: "draft", updated_by: context.userId })
      .eq("event_key", data.eventKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishTransactionalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; draft: z.infer<typeof draftSchema> }) =>
    z.object({ eventKey: z.string().min(1), draft: draftSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishTemplate } = await import("@/lib/transactional-email.server");
    const result = await publishTemplate(
      supabaseAdmin,
      data.eventKey,
      {
        subject: data.draft.subject,
        preheader: data.draft.preheader ?? null,
        from_name: data.draft.from_name ?? null,
        from_email: data.draft.from_email ?? null,
        reply_to: data.draft.reply_to ?? null,
        html: data.draft.html,
        text_body: data.draft.text_body ?? null,
      },
      context.userId,
    );
    return { ok: true, version: result.version };
  });

export const rollbackTransactionalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; version: number }) =>
    z.object({ eventKey: z.string().min(1), version: z.number().int().positive() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { rollbackTemplate } = await import("@/lib/transactional-email.server");
    await rollbackTemplate(supabaseAdmin, data.eventKey, data.version, context.userId);
    return { ok: true };
  });

export const restoreTransactionalDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string }) => z.object({ eventKey: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { restoreDefaultTemplate } = await import("@/lib/transactional-email.server");
    await restoreDefaultTemplate(supabaseAdmin, data.eventKey, context.userId);
    return { ok: true };
  });

export const restoreAllTransactionalDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { includeCustomised?: boolean } | undefined) =>
    z.object({ includeCustomised: z.boolean().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { restoreAllDefaultTemplates } = await import("@/lib/transactional-email.server");
    return restoreAllDefaultTemplates(supabaseAdmin, context.userId, data.includeCustomised ?? false);
  });

export const setTransactionalTemplateEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; enabled: boolean }) =>
    z.object({ eventKey: z.string().min(1), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("transactional_templates")
      .update({ enabled: data.enabled, updated_by: context.userId })
      .eq("event_key", data.eventKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTransactionalTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { eventKey: string; to: string }) =>
    z.object({ eventKey: z.string().min(1), to: z.string().email() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTransactionalNow } = await import("@/lib/transactional-email.server");
    const { SAMPLE_VARIABLES } = await import("@/lib/transactional/variables");
    return sendTransactionalNow(supabaseAdmin, {
      eventKey: data.eventKey,
      to: data.to,
      variables: { ...SAMPLE_VARIABLES, "user.email": data.to },
      testMode: true,
      idempotencyKey: `test-${data.eventKey}-${Date.now()}`,
      userId: context.userId,
    });
  });

export const updateTransactionalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      enabled?: boolean;
      paused?: boolean;
      test_mode?: boolean;
      test_recipient?: string | null;
      from_name?: string;
      from_email?: string;
      reply_to?: string;
      retry_count?: number;
      retry_delay_seconds?: number;
      batch_size?: number;
      ses_enabled?: boolean;
    }) =>
      z
        .object({
          enabled: z.boolean().optional(),
          paused: z.boolean().optional(),
          test_mode: z.boolean().optional(),
          test_recipient: z.string().email().nullable().optional(),
          from_name: z.string().min(1).max(120).optional(),
          from_email: z.string().email().optional(),
          reply_to: z.string().email().optional(),
          retry_count: z.number().int().min(1).max(10).optional(),
          retry_delay_seconds: z.number().int().min(30).max(86_400).optional(),
          batch_size: z.number().int().min(1).max(100).optional(),
          ses_enabled: z.boolean().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveTransactionalSettings } = await import("@/lib/transactional-email.server");
    return saveTransactionalSettings(supabaseAdmin, data);
  });

export const listTransactionalEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { search?: string; status?: string; eventKey?: string; limit?: number }) =>
      z
        .object({
          search: z.string().max(200).optional(),
          status: z.string().max(40).optional(),
          eventKey: z.string().max(120).optional(),
          limit: z.number().int().min(10).max(500).optional(),
        })
        .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("transactional_emails")
      .select(
        "id, event_key, to_email, subject, status, attempts, max_attempts, provider, provider_message_id, error, bounce_reason, test_mode, queued_at, sent_at, delivered_at, failed_at, next_attempt_at",
      )
      .order("queued_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.eventKey && data.eventKey !== "all") query = query.eq("event_key", data.eventKey);
    if (data.search) query = query.ilike("to_email", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: statusRows } = await supabaseAdmin
      .from("transactional_emails")
      .select("status")
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
      .limit(5000);

    const stats: Record<string, number> = {};
    for (const row of (statusRows ?? []) as { status: string }[]) {
      stats[row.status] = (stats[row.status] ?? 0) + 1;
    }

    return { emails: rows ?? [], stats };
  });

export const getTransactionalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("transactional_emails")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const resendTransactionalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processTransactionalQueue } = await import("@/lib/transactional-email.server");
    const { error } = await supabaseAdmin
      .from("transactional_emails")
      .update({ status: "queued", attempts: 0, error: null, next_attempt_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const run = await processTransactionalQueue(supabaseAdmin, { limit: 5 });
    return { ok: run.sent > 0, run };
  });

export const runTransactionalQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processTransactionalQueue } = await import("@/lib/transactional-email.server");
    return processTransactionalQueue(supabaseAdmin, {});
  });

/* ------------------------------------------------------------ Amazon SES */

/**
 * Read-only SES posture for the admin console: connection, region, sender
 * identity, verification, sandbox/production, sending + rate limits.
 * Reading this never changes which provider production sending uses.
 */
export const getSesSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getTransactionalSettings } = await import("@/lib/transactional-email.server");
    const { resolveSesCredentials, sesRegion, getSesIdentity } = await import(
      "@/lib/email-providers/ses-api.server"
    );
    const { getSesSendingQuota, mapSesIdentityState } = await import(
      "@/lib/email-providers/ses.server"
    );
    const { SYSTEM_SENDERS } = await import("@/lib/system-email-senders");

    const settings = await getTransactionalSettings(supabaseAdmin);
    const credentials = resolveSesCredentials(null);
    const senders = Array.from(new Set(Object.values(SYSTEM_SENDERS).map((s) => s.email)));

    if (!credentials) {
      return {
        connected: false,
        enabled: settings.ses_enabled === true,
        region: sesRegion(null),
        senders,
        identities: [] as { domain: string; state: string; detail: string }[],
        quota: null,
        detail: "Amazon SES credentials are not configured on the server.",
      };
    }

    const domains = Array.from(
      new Set(senders.map((email) => (email.split("@")[1] ?? "").toLowerCase()).filter(Boolean)),
    );
    const [quota, ...identityResults] = await Promise.all([
      getSesSendingQuota(null),
      ...domains.map((domain) => getSesIdentity(domain, null)),
    ]);

    const identities = domains.map((domain, i) => {
      const res = identityResults[i];
      const mapped = mapSesIdentityState(res?.json ?? null);
      return { domain, state: mapped.state, detail: mapped.detail };
    });

    return {
      connected: true,
      enabled: settings.ses_enabled === true,
      region: credentials.region,
      senders,
      identities,
      quota,
      detail: quota.detail,
    };
  });

/** One-off SES test send from a verified MunchReach system sender. */
export const sendSesTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string }) =>
    z.object({ from: z.string().email(), to: z.string().email() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { resolveSesCredentials } = await import("@/lib/email-providers/ses-api.server");
    const { getAdapter } = await import("@/lib/providers/adapter.server");
    const { SYSTEM_SENDERS } = await import("@/lib/system-email-senders");

    const credentials = resolveSesCredentials(null);
    if (!credentials) return { ok: false, messageId: null, detail: "Amazon SES is not connected." };

    const sender = Object.values(SYSTEM_SENDERS).find((s) => s.email === data.from);
    if (!sender) return { ok: false, messageId: null, detail: "Unknown MunchReach sender identity." };

    const result = await getAdapter("ses").sendEmail(
      {
        access_key_id: credentials.accessKeyId,
        secret_access_key: credentials.secretAccessKey,
        region: credentials.region,
      },
      {
        fromName: sender.name,
        fromEmail: sender.email,
        replyTo: sender.replyTo,
        to: data.to,
        subject: "MunchReach — Amazon SES test email",
        text: "This is a MunchReach test email delivered through Amazon SES.",
        html: "<p>This is a MunchReach test email delivered through Amazon SES.</p>",
        headers: { "X-MunchReach-Type": "transactional-test" },
      },
    );

    return {
      ok: result.ok,
      messageId: result.messageId ?? null,
      detail: result.providerResponse || result.message,
    };
  });
