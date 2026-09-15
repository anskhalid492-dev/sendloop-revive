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

/**
 * Sender/provider context shared by the editor guards and the senders list.
 * SES identity lookups are best-effort: a lookup failure never blocks admins,
 * it simply means no domain is treated as SES-verified.
 */
async function senderContext(admin: unknown) {
  const { getTransactionalSettings, getSenderIdentityOverrides } = await import(
    "@/lib/transactional-email.server"
  );
  const { resolveSenderIdentities } = await import("@/lib/system-sender-identities");
  const { resolveManagedProvider } = await import("@/lib/managed-sending.server");
  const { resolveSesCredentials, sesRegion, getSesIdentity } = await import(
    "@/lib/email-providers/ses-api.server"
  );
  const { mapSesIdentityState } = await import("@/lib/email-providers/ses.server");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = await getTransactionalSettings(admin as any);
  const overrides = await getSenderIdentityOverrides(admin as any);
  const senders = resolveSenderIdentities(overrides);

  // The managed provider is whatever the provider pool actually resolves for
  // SYSTEM email right now — never pinned to one vendor. Pinning "resend" here
  // made the whole card read "Provider unavailable" the moment Resend was
  // disabled, even with another provider enabled for system email.
  let managedProvider: string | null = null;
  try {
    const managed = await resolveManagedProvider(
      admin as any,
      { provider: "", provider_id: null, from_email: senders[0]?.email ?? "" },
      { scope: "system" },
    );
    managedProvider = managed?.provider ?? null;
  } catch {
    managedProvider = null;
  }
  const knownSenders = senders.map((s) => s.email);
  const credentials = resolveSesCredentials(null);
  const region = credentials?.region ?? sesRegion(null);

  const domains = Array.from(
    new Set(knownSenders.map((email) => (email.split("@")[1] ?? "").toLowerCase()).filter(Boolean)),
  );

  const states: Record<string, string> = {};
  if (credentials) {
    const results = await Promise.all(
      domains.map(async (domain) => {
        try {
          const res = await getSesIdentity(domain, null);
          return mapSesIdentityState(res?.json ?? null).state;
        } catch {
          return "unknown";
        }
      }),
    );
    domains.forEach((domain, i) => (states[domain] = results[i] ?? "unknown"));
  }

  const verifiedDomains = domains.filter((d) => states[d] === "verified");

  // Maileroo verifies at the DOMAIN level: every MunchReach identity on a
  // verified domain is usable as a From address with no per-address setup.
  const { resolveSystemMaileroo, mailerooVerifiedDomains } = await import(
    "@/lib/system-email-maileroo.server"
  );
  const maileroo = await resolveSystemMaileroo(admin, senders[0]?.email ?? "");
  const mailerooStates = maileroo
    ? await mailerooVerifiedDomains(maileroo.credentials, domains)
    : {};
  const mailerooVerified = domains.filter((d) => mailerooStates[d] === "verified");

  // When nothing can deliver, say exactly why instead of "Provider unavailable".
  let unavailableReason: string | null = null;
  if (managedProvider === null && maileroo === null) {
    const { diagnoseSystemProvider } = await import("@/lib/transactional/provider-diagnosis.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unavailableReason = await diagnoseSystemProvider(admin as any);
    console.error("[system-email] no provider available:", unavailableReason);
  }

  return {
    settings,
    overrides,
    senders,
    managedProvider,
    managedAvailable: managedProvider !== null,
    knownSenders,
    verifiedDomains,
    domainStates: states,
    sesEnabled: settings.ses_enabled === true,
    sesConnected: Boolean(credentials),
    mailerooAvailable: maileroo !== null,
    mailerooDomainStates: mailerooStates,
    mailerooVerifiedDomains: mailerooVerified,
    activeProvider: settings.system_provider ?? "auto",
    unavailableReason,
    region,
  };
}

/** Every MunchReach system sender identity with its provider verification state. */
export const listSystemSenderIdentities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { providerDisplay, managedProviderLabel } = await import("@/lib/transactional/policy");
    const { providerOptionAvailable } = await import("@/lib/system-sender-identities");
    const ctx = await senderContext(supabaseAdmin);

    const provider = providerDisplay({
      sesEnabled: ctx.sesEnabled,
      sesConnected: ctx.sesConnected,
      managedAvailable: ctx.managedAvailable,
      managedProvider: ctx.managedProvider,
      activeProvider: ctx.activeProvider,
      mailerooAvailable: ctx.mailerooAvailable,
    });

    const mailerooActive = provider.provider === "maileroo";

    return {
      provider,
      region: ctx.region,
      sesEnabled: ctx.sesEnabled,
      sesConnected: ctx.sesConnected,
      managedAvailable: ctx.managedAvailable,
      managedProvider: ctx.managedProvider,
      mailerooAvailable: ctx.mailerooAvailable,
      /** Stored Active provider pin for the whole system-email pipeline. */
      activeProvider: ctx.activeProvider,
      /** Selectable values for the Active provider control. */
      activeProviderOptions: (["auto", "resend", "ses", "maileroo"] as const).map((option) => ({
        value: option,
        label:
          option === "auto"
            ? "Automatic"
            : option === "resend"
              ? managedProviderLabel(ctx.managedProvider || "resend")
              : option === "ses"
                ? "Amazon SES"
                : "Maileroo",
        available:
          option === "auto"
            ? true
            : option === "resend"
              ? ctx.managedAvailable
              : option === "ses"
                ? ctx.sesConnected
                : ctx.mailerooAvailable,
      })),
      providerOptions: (["auto", "managed", "ses", "maileroo"] as const).map((option) => ({
        value: option,
        label:
          option === "auto"
            ? `Automatic (${provider.label})`
            : option === "managed"
              ? managedProviderLabel(ctx.managedProvider)
              : option === "ses"
                ? "Amazon SES"
                : "Maileroo",
        available: providerOptionAvailable(option, {
          managedAvailable: ctx.managedAvailable,
          sesEnabled: ctx.sesEnabled,
          sesConnected: ctx.sesConnected,
          mailerooAvailable: ctx.mailerooAvailable,
        }),
      })),
      identities: ctx.senders.map((s) => {
        const domain = (s.email.split("@")[1] ?? "").toLowerCase();
        const usesMaileroo = s.provider === "maileroo" || (s.provider === "auto" && mailerooActive);
        const mailerooState = ctx.mailerooDomainStates[domain] ?? "unknown";
        const sesState = ctx.sesConnected ? ctx.domainStates[domain] ?? "unknown" : "not_connected";
        // Maileroo verifies whole domains, so a verified domain makes every
        // MunchReach identity on it usable without per-address verification.
        const verified = usesMaileroo ? mailerooState === "verified" : sesState === "verified";
        const effectiveProvider =
          s.provider === "ses"
            ? "Amazon SES"
            : s.provider === "maileroo"
              ? "Maileroo"
              : s.provider === "managed"
                ? managedProviderLabel(ctx.managedProvider)
                : provider.label;
        return {
          email: s.email,
          name: s.name,
          replyTo: s.replyTo,
          purpose: s.purpose,
          description: s.description,
          domain,
          /** Provider preference stored for this identity. */
          providerPreference: s.provider,
          provider: effectiveProvider,
          customized: s.customized,
          region: usesMaileroo ? "Domain-level (Maileroo)" : ctx.region,
          verification: usesMaileroo
            ? verified
              ? "Verified (domain)"
              : ctx.mailerooAvailable
                ? mailerooState
                : "Not connected"
            : verified
              ? "Verified"
              : ctx.sesConnected
                ? sesState
                : "Not connected",
          /** Selectable as a From address for a transactional email. */
          selectable: s.active && (usesMaileroo ? verified : ctx.sesEnabled ? verified : true),
          active: s.active,
        };
      }),
    };
  });

/** Pins the Active provider for every system email category. */
export const setSystemEmailActiveProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ provider: z.enum(["auto", "resend", "ses", "maileroo"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { saveTransactionalSettings } = await import("@/lib/transactional-email.server");

    if (data.provider === "maileroo") {
      const { resolveSystemMaileroo } = await import("@/lib/system-email-maileroo.server");
      const { SYSTEM_SENDERS } = await import("@/lib/system-email-senders");
      const maileroo = await resolveSystemMaileroo(
        supabaseAdmin,
        SYSTEM_SENDERS["notifications"].email,
      );
      if (!maileroo) {
        throw new Error(
          "Maileroo is not configured for system email. Add the account API key under Admin → Email providers first.",
        );
      }
    }

    // SES keeps its own explicit enable switch in sync with the pin so the
    // Amazon SES tab and the Active provider control can never disagree.
    const patch: { system_provider: "auto" | "resend" | "ses" | "maileroo"; ses_enabled?: boolean } =
      { system_provider: data.provider };
    if (data.provider === "ses") patch.ses_enabled = true;
    if (data.provider === "maileroo" || data.provider === "resend") patch.ses_enabled = false;

    const settings = await saveTransactionalSettings(supabaseAdmin, patch);
    return { ok: true, provider: settings.system_provider ?? "auto" };
  });

/** Updates one system sender identity after validating it against the backend. */
export const updateSystemSenderIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        purpose: z.enum([
          "accounts",
          "billing",
          "support",
          "notifications",
          "security",
          "onboarding",
          "system",
          "marketing",
        ]),
        email: z.string().trim().toLowerCase().email(),
        name: z.string().trim().min(1).max(120),
        replyTo: z.string().trim().toLowerCase().email(),
        provider: z.enum(["auto", "managed", "ses", "maileroo"]),
        active: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSenderIdentityOverrides, saveSenderIdentityOverrides } = await import(
      "@/lib/transactional-email.server"
    );
    const { applySenderIdentityEdit, validateSenderIdentityEdit } = await import(
      "@/lib/system-sender-identities"
    );

    const ctx = await senderContext(supabaseAdmin);
    const reason = validateSenderIdentityEdit(
      data,
      {
        managedAvailable: ctx.managedAvailable,
        sesEnabled: ctx.sesEnabled,
        sesConnected: ctx.sesConnected,
        mailerooAvailable: ctx.mailerooAvailable,
      },
      {
        allowedDomains: Array.from(
          new Set(
            ctx.senders.map((s) => (s.email.split("@")[1] ?? "").toLowerCase()).filter(Boolean),
          ),
        ),
        activeProvider: ctx.activeProvider,
        mailerooVerifiedDomains: ctx.mailerooVerifiedDomains,
        verifiedDomains: ctx.verifiedDomains,
      },
    );
    if (reason) throw new Error(reason);

    const overrides = await getSenderIdentityOverrides(supabaseAdmin);
    await saveSenderIdentityOverrides(supabaseAdmin, applySenderIdentityEdit(overrides, data));
    return { ok: true };
  });

/** Throws when the chosen From address is not a usable system sender. */
async function assertSenderAllowed(admin: unknown, fromEmail: string | null | undefined) {
  if (!fromEmail) return;
  const { senderRejectionReason } = await import("@/lib/transactional/policy");
  const ctx = await senderContext(admin);
  const reason = senderRejectionReason({
    fromEmail,
    sesEnabled: ctx.sesEnabled,
    verifiedDomains: ctx.verifiedDomains,
    knownSenders: ctx.knownSenders,
  });
  if (reason) throw new Error(reason);
}

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
    await assertSenderAllowed(supabaseAdmin, data.draft.from_email ?? null);

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
    await assertSenderAllowed(supabaseAdmin, data.draft.from_email ?? null);
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
    const { isRequiredSystemEmail } = await import("@/lib/transactional/policy");
    if (!data.enabled && isRequiredSystemEmail(data.eventKey)) {
      throw new Error("Required system email — this email cannot be disabled.");
    }
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
      system_provider?: "auto" | "resend" | "ses" | "maileroo";
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
          system_provider: z.enum(["auto", "resend", "ses", "maileroo"]).optional(),
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
