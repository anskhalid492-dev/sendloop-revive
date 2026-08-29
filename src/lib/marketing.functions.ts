/**
 * MunchReach Marketing Engine — admin server functions.
 *
 * INTERNAL PLATFORM SURFACE. Every function re-checks the platform super
 * admin role through the shared admin guard before touching marketing data;
 * none of this is reachable from a customer workspace, and no customer route
 * imports this module.
 *
 * Server-only modules are imported inside handlers so the service-role client
 * never enters a client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

import { AUTOMATION_BLUEPRINTS, blueprintSteps } from "./marketing/blueprints";
import { PRODUCT_EVENTS } from "./marketing/events";
import { renderMarketingEmail } from "./marketing/render";
import { builtInSegments } from "./marketing/segments";
import {
  BUILT_IN_TEMPLATES,
  builtInTemplate,
  duplicateTemplateDraft,
} from "./marketing/template-library";
import type {
  AutomationStep,
  MarketingTemplate,
  SegmentDefinition,
} from "./marketing/types";

type Ctx = { supabase: unknown; userId: string; claims?: Record<string, unknown> };

async function guard(context: Ctx, action: string, sensitive = false) {
  const { assertSuperAdmin } = await import("@/lib/admin-access.server");
  await assertSuperAdmin(context as never, { action, sensitive });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------- dashboard */

export const marketingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "marketing overview");
    const db = await admin();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [subs, events, campaigns, automations, suppression] = await Promise.all([
      db.from("marketing_subscribers").select("status"),
      db.from("marketing_email_events").select("event_type, created_at").gte("created_at", since),
      db.from("marketing_campaigns").select("id, name, status, stats, scheduled_at, created_at").order("created_at", { ascending: false }).limit(8),
      db.from("marketing_automations").select("id, name, status, trigger_event"),
      db.from("marketing_suppression").select("reason"),
    ]);

    const statuses = (subs.data ?? []) as { status: string }[];
    const eventRows = (events.data ?? []) as { event_type: string }[];
    const count = (type: string) => eventRows.filter((e) => e.event_type === type).length;
    const sent = count("marketing_email_sent");

    return {
      subscribers: {
        total: statuses.length,
        active: statuses.filter((s) => s.status === "active").length,
        unsubscribed: statuses.filter((s) => s.status === "unsubscribed").length,
        bounced: statuses.filter((s) => s.status === "bounced").length,
      },
      last30: {
        sent,
        opened: count("marketing_email_opened"),
        clicked: count("marketing_email_clicked"),
        bounced: count("marketing_email_bounced"),
        unsubscribed: count("marketing_email_unsubscribed"),
        suppressed: count("marketing_email_suppressed"),
        openRate: sent ? Math.round((count("marketing_email_opened") / sent) * 1000) / 10 : 0,
        clickRate: sent ? Math.round((count("marketing_email_clicked") / sent) * 1000) / 10 : 0,
      },
      campaigns: campaigns.data ?? [],
      automations: automations.data ?? [],
      suppressionCount: (suppression.data ?? []).length,
    };
  });

/* ----------------------------------------------------------- subscribers */

export const listMarketingSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; status?: string; limit?: number }) => input ?? {})
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "list marketing subscribers");
    const db = await admin();
    let query = db
      .from("marketing_subscribers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 200, 500));
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.search) query = query.ilike("email", `%${data.search.trim()}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addMarketingSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    email: string;
    firstName?: string;
    lastName?: string;
    tags?: string[];
    source?: string;
  }) => z
    .object({
      email: z.string().email(),
      firstName: z.string().max(120).optional(),
      lastName: z.string().max(120).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      source: z.string().max(40).optional(),
    })
    .parse(input))
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "add marketing subscriber");
    const { upsertSubscriber } = await import("./marketing/subscribers.server");
    return upsertSubscriber({
      email: data.email,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      tags: data.tags ?? [],
      source: data.source ?? "manual",
    });
  });

export const importMarketingSubscribers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { csv: string; tags?: string[]; source?: string }) =>
    z.object({ csv: z.string().min(1).max(500_000), tags: z.array(z.string()).optional(), source: z.string().optional() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "import marketing subscribers");
    const { upsertSubscriber } = await import("./marketing/subscribers.server");
    const lines = data.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let imported = 0;
    let skipped = 0;
    for (const line of lines.slice(0, 5000)) {
      const [email, firstName, lastName] = line.split(",").map((v) => v?.trim() ?? "");
      if (!email || !email.includes("@") || email.toLowerCase() === "email") {
        skipped += 1;
        continue;
      }
      try {
        await upsertSubscriber({
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          tags: data.tags ?? ["import"],
          source: data.source ?? "import",
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
    return { imported, skipped };
  });

export const updateMarketingSubscriber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; tags?: string[]; action?: "unsubscribe" | "resubscribe" | "delete" }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "update marketing subscriber");
    const db = await admin();
    const { suppressEmail, resubscribeEmail } = await import("./marketing/subscribers.server");
    const { data: row } = await db
      .from("marketing_subscribers")
      .select("email")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Subscriber not found");
    if (data.action === "unsubscribe") {
      await suppressEmail({ email: row.email, reason: "unsubscribe", source: "admin" });
    } else if (data.action === "resubscribe") {
      await resubscribeEmail(row.email);
    } else if (data.action === "delete") {
      await db.from("marketing_subscribers").delete().eq("id", data.id);
    } else if (data.tags) {
      await db.from("marketing_subscribers").update({ tags: data.tags }).eq("id", data.id);
    }
    return { ok: true };
  });

/* -------------------------------------------------------------- segments */

export const listMarketingSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing segments");
    const db = await admin();
    const { data } = await db.from("marketing_segments").select("*").order("created_at");
    const custom = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row["id"] as string,
      key: (row["key"] as string) ?? null,
      name: row["name"] as string,
      description: (row["description"] as string) ?? "",
      builtIn: false,
      kind: (row["kind"] as "rule" | "manual") ?? "rule",
      conditions: (row["conditions"] ?? { match: "all", rules: [] }) as SegmentDefinition,
    }));
    return { builtIn: builtInSegments(), custom };
  });

export const saveMarketingSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    description?: string;
    kind?: "rule" | "manual";
    conditions: SegmentDefinition;
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing segment");
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      description: data.description?.trim() ?? "",
      kind: data.kind ?? "rule",
      conditions: data.conditions as never,
      created_by: (context as Ctx).userId,
    };
    if (data.id) {
      const { error } = await db.from("marketing_segments").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("marketing_segments")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteMarketingSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "delete marketing segment");
    const db = await admin();
    await db.from("marketing_segments").delete().eq("id", data.id);
    return { ok: true };
  });

export const previewMarketingSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { segmentId?: string | null; segmentKey?: string | null }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "preview marketing segment");
    const { resolveAudienceSubscribers } = await import("./marketing/send-engine.server");
    const audience = await resolveAudienceSubscribers({
      segmentId: data.segmentId ?? null,
      segmentKey: data.segmentKey ?? null,
      limit: 2000,
    });
    return {
      count: audience.length,
      sample: audience.slice(0, 25).map((s) => ({ email: s.email, status: s.status })),
    };
  });

/* -------------------------------------------------------------- templates */

export const listMarketingTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing templates");
    const db = await admin();
    const { data } = await db
      .from("marketing_templates")
      .select("*")
      .order("updated_at", { ascending: false });
    const custom: MarketingTemplate[] = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row["id"] as string,
      key: null,
      name: row["name"] as string,
      category: row["category"] as MarketingTemplate["category"],
      subject: row["subject"] as string,
      previewText: (row["preview_text"] as string) ?? "",
      fromName: (row["from_name"] as string) ?? null,
      replyTo: (row["reply_to"] as string) ?? null,
      body: row["body"] as string,
      builtIn: false,
      duplicatedFrom: (row["duplicated_from"] as string) ?? null,
      updatedAt: row["updated_at"] as string,
    }));
    return { builtIn: BUILT_IN_TEMPLATES, custom };
  });

export const duplicateMarketingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key?: string | null; id?: string | null; name?: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "duplicate marketing template");
    const db = await admin();
    let source: MarketingTemplate | null = data.key ? builtInTemplate(data.key) : null;
    if (!source && data.id) {
      const { data: row } = await db.from("marketing_templates").select("*").eq("id", data.id).maybeSingle();
      if (row) {
        source = {
          id: row.id,
          key: null,
          name: row.name,
          category: row.category as MarketingTemplate["category"],
          subject: row.subject,
          previewText: row.preview_text ?? "",
          fromName: row.from_name,
          replyTo: row.reply_to,
          body: row.body,
          builtIn: false,
        };
      }
    }
    if (!source) throw new Error("Template not found");
    const draft = duplicateTemplateDraft(source, data.name);
    const { data: created, error } = await db
      .from("marketing_templates")
      .insert({
        name: draft.name,
        category: draft.category,
        subject: draft.subject,
        preview_text: draft.previewText,
        from_name: draft.fromName,
        reply_to: draft.replyTo,
        body: draft.body,
        duplicated_from: draft.duplicatedFrom ?? null,
        type: "custom",
        status: "active",
        created_by: (context as Ctx).userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });


export const saveMarketingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    category: string;
    subject: string;
    previewText?: string;
    fromName?: string | null;
    replyTo?: string | null;
    body: string;
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing template");
    // Built-ins have no row to update — duplication is the only way to edit one.
    if (data.id?.startsWith("builtin:")) {
      throw new Error("Built-in templates are read-only. Duplicate it to make changes.");
    }
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      category: data.category,
      subject: data.subject.trim(),
      preview_text: data.previewText ?? "",
      from_name: data.fromName ?? null,
      reply_to: data.replyTo ?? null,
      body: data.body,
      created_by: (context as Ctx).userId,
    };
    if (data.id) {
      const { error } = await db.from("marketing_templates").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("marketing_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteMarketingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "delete marketing template");
    if (data.id.startsWith("builtin:")) throw new Error("Built-in templates cannot be deleted.");
    const db = await admin();
    await db.from("marketing_templates").delete().eq("id", data.id);
    return { ok: true };
  });

export const previewMarketingTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subject: string; previewText?: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "preview marketing template");
    const rendered = renderMarketingEmail({
      subject: data.subject,
      previewText: data.previewText ?? "",
      body: data.body,
      unsubscribeUrl: "https://munchreach.com/unsubscribe-preview",
      variables: { first_name: "Alex", last_name: "Doe", full_name: "Alex Doe", email: "alex@example.com" },
    });
    return rendered;
  });

/* -------------------------------------------------------------- campaigns */

export const listMarketingCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing campaigns");
    const db = await admin();
    const { data } = await db
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const saveMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    campaignType: string;
    segmentId?: string | null;
    segmentKey?: string | null;
    templateId?: string | null;
    builtinTemplateKey?: string | null;
    sendingDomainId?: string | null;
    providerId?: string | null;
    fromName: string;
    fromEmail: string;
    replyTo?: string | null;
    subjectOverride?: string | null;
    scheduledAt?: string | null;
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing campaign");
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      campaign_type: data.campaignType,
      segment_id: data.segmentId ?? null,
      segment_key: data.segmentKey ?? null,
      template_id: data.templateId ?? null,
      builtin_template_key: data.builtinTemplateKey ?? null,
      sending_domain_id: data.sendingDomainId ?? null,
      provider_id: data.providerId ?? null,
      from_name: data.fromName.trim(),
      from_email: data.fromEmail.trim().toLowerCase(),
      reply_to: data.replyTo ?? null,
      subject_override: data.subjectOverride ?? null,
      scheduled_at: data.scheduledAt ?? null,
      created_by: (context as Ctx).userId,
    };
    if (data.id) {
      const { error } = await db.from("marketing_campaigns").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("marketing_campaigns")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const setMarketingCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "draft" | "scheduled" | "paused" | "cancelled" }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "change marketing campaign status");
    const db = await admin();
    const { error } = await db
      .from("marketing_campaigns")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runMarketingCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; batchSize?: number }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "send marketing campaign", true);
    const db = await admin();
    await db
      .from("marketing_campaigns")
      .update({ status: "scheduled", scheduled_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["draft", "paused", "scheduled"]);
    const { processMarketingCampaign } = await import("./marketing/send-engine.server");
    return processMarketingCampaign(data.id, { batchSize: data.batchSize ?? 100 });
  });

export const marketingCampaignDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "view marketing campaign");
    const db = await admin();
    const [{ data: campaign }, { data: recipients }, { data: events }] = await Promise.all([
      db.from("marketing_campaigns").select("*").eq("id", data.id).maybeSingle(),
      db
        .from("marketing_campaign_recipients")
        .select("*")
        .eq("campaign_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("marketing_email_events")
        .select("event_type, email, detail, created_at")
        .eq("campaign_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (!campaign) throw new Error("Campaign not found");
    return { campaign, recipients: recipients ?? [], events: events ?? [] };
  });

export const sendMarketingTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    to: string;
    templateId?: string | null;
    builtinTemplateKey?: string | null;
    subjectOverride?: string | null;
    fromName: string;
    fromEmail: string;
    providerId: string;
  }) => z
    .object({
      to: z.string().email(),
      templateId: z.string().uuid().nullish(),
      builtinTemplateKey: z.string().nullish(),
      subjectOverride: z.string().nullish(),
      fromName: z.string().min(1),
      fromEmail: z.string().email(),
      providerId: z.string().uuid(),
    })
    .parse(input))
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "send marketing test email");
    const { resolveTemplate, sendMarketingTestEmail } = await import("./marketing/send-engine.server");
    const template = await resolveTemplate({
      templateId: data.templateId ?? null,
      builtinKey: data.builtinTemplateKey ?? null,
    });
    if (!template) throw new Error("Template not found");
    return sendMarketingTestEmail({
      to: data.to,
      template,
      subjectOverride: data.subjectOverride ?? null,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      providerId: data.providerId,
    });
  });

/* -------------------------------------------------------------- providers */

export const listMarketingProvidersFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing providers");
    const { listMarketingProviders } = await import("./marketing/providers.server");
    return listMarketingProviders();
  });

export const saveMarketingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    providerType: string;
    status?: "active" | "inactive";
    dailySendLimit?: number | null;
    ratePerSecond?: number | null;
    credentials?: Record<string, string>;
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing provider", true);
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      provider_type: data.providerType,
      status: data.status ?? "inactive",
      daily_send_limit: data.dailySendLimit ?? null,
      rate_per_second: data.ratePerSecond ?? null,
    };
    let id = data.id;
    if (id) {
      const { error } = await db.from("marketing_email_providers").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await db
        .from("marketing_email_providers")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = row.id as string;
    }
    if (data.credentials && Object.keys(data.credentials).length > 0) {
      const { saveProviderCredentials } = await import("./marketing/providers.server");
      await saveProviderCredentials(id!, data.credentials);
    }
    return { id: id! };
  });

export const testMarketingProviderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "test marketing provider");
    const { testMarketingProvider } = await import("./marketing/providers.server");
    return testMarketingProvider(data.id);
  });

export const deleteMarketingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "delete marketing provider", true);
    const db = await admin();
    const { deleteProviderCredentials } = await import("./marketing/providers.server");
    await deleteProviderCredentials(data.id);
    await db.from("marketing_email_providers").delete().eq("id", data.id);
    return { ok: true };
  });

/* ---------------------------------------------------------------- domains */

export const listMarketingDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing domains");
    const db = await admin();
    const { data } = await db
      .from("marketing_sending_domains")
      .select("*")
      .order("created_at", { ascending: true });
    return data ?? [];
  });

export const saveMarketingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    domain: string;
    providerId?: string | null;
    enabled?: boolean;
    allowedProviderIds?: string[];
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing sending domain");
    const db = await admin();
    const domain = data.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const payload = {
      domain,
      provider_id: data.providerId ?? null,
      enabled: data.enabled ?? true,
      allowed_provider_ids: data.allowedProviderIds ?? [],
    };
    if (data.id) {
      const { error } = await db.from("marketing_sending_domains").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db
      .from("marketing_sending_domains")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const verifyMarketingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "verify marketing sending domain");
    const { verifyMarketingSendingDomain } = await import("./marketing/domains.server");
    return verifyMarketingSendingDomain(data.id);
  });

export const deleteMarketingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "delete marketing sending domain", true);
    const db = await admin();
    await db.from("marketing_sending_domains").delete().eq("id", data.id);
    return { ok: true };
  });

/* ------------------------------------------------------------ automations */

export const listMarketingAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing automations");
    const db = await admin();
    const [{ data: automations }, { data: steps }, { data: enrollments }] = await Promise.all([
      db.from("marketing_automations").select("*").order("created_at", { ascending: false }),
      db.from("marketing_automation_steps").select("*").order("position"),
      db.from("marketing_automation_enrollments").select("automation_id, status"),
    ]);
    return {
      automations: automations ?? [],
      steps: steps ?? [],
      enrollments: enrollments ?? [],
      blueprints: AUTOMATION_BLUEPRINTS,
      triggerEvents: PRODUCT_EVENTS,
    };
  });

export const createAutomationFromBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { blueprintKey: string; fromName: string; fromEmail: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "create marketing automation");
    const db = await admin();
    const bp = AUTOMATION_BLUEPRINTS.find((b) => b.key === data.blueprintKey);
    if (!bp) throw new Error("Blueprint not found");
    const { data: row, error } = await db
      .from("marketing_automations")
      .insert({
        name: bp.name,
        description: bp.description,
        trigger_event: bp.triggerEvent,
        status: "draft",
        blueprint_key: bp.key,
        segment_key: bp.segmentKey,
        from_name: data.fromName,
        from_email: data.fromEmail.toLowerCase(),
        created_by: (context as Ctx).userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const steps = blueprintSteps(bp.key).map((step) => ({
      automation_id: row.id as string,
      position: step.position,
      step_type: step.stepType,
      config: step.config as never,
    }));
    if (steps.length > 0) await db.from("marketing_automation_steps").insert(steps);
    return { id: row.id as string };
  });

export const saveMarketingAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    name?: string;
    description?: string;
    triggerEvent?: string;
    segmentId?: string | null;
    segmentKey?: string | null;
    providerId?: string | null;
    sendingDomainId?: string | null;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string | null;
    steps?: AutomationStep[];
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing automation");
    const db = await admin();
    const update: Database["public"]["Tables"]["marketing_automations"]["Update"] = {};
    if (data.name !== undefined) update["name"] = data.name.trim();
    if (data.description !== undefined) update["description"] = data.description;
    if (data.triggerEvent !== undefined) {
      const { assertTriggerEvent } = await import("./marketing/events");
      update["trigger_event"] = assertTriggerEvent(data.triggerEvent);
    }
    if (data.segmentId !== undefined) update["segment_id"] = data.segmentId;
    if (data.segmentKey !== undefined) update["segment_key"] = data.segmentKey;
    if (data.providerId !== undefined) update["provider_id"] = data.providerId;
    if (data.sendingDomainId !== undefined) update["sending_domain_id"] = data.sendingDomainId;
    if (data.fromName !== undefined) update["from_name"] = data.fromName;
    if (data.fromEmail !== undefined) update["from_email"] = data.fromEmail.toLowerCase();
    if (data.replyTo !== undefined) update["reply_to"] = data.replyTo;
    if (Object.keys(update).length > 0) {
      const { error } = await db.from("marketing_automations").update(update).eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.steps) {
      await db.from("marketing_automation_steps").delete().eq("automation_id", data.id);
      if (data.steps.length > 0) {
        const { error } = await db.from("marketing_automation_steps").insert(
          data.steps.map((step, index) => ({
            automation_id: data.id,
            position: index,
            step_type: step.stepType,
            config: step.config as never,
          })),
        );
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "draft" | "active" | "paused" }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "change marketing automation status");
    const db = await admin();
    if (data.status === "active") {
      const { data: steps } = await db
        .from("marketing_automation_steps")
        .select("step_type, config")
        .eq("automation_id", data.id);
      const { validateAutomationSteps } = await import("./marketing/automation");
      const errors = validateAutomationSteps(
        (steps ?? []).map((row: Record<string, unknown>, index: number) => ({
          id: String(index),
          position: index,
          stepType: row["step_type"] as AutomationStep["stepType"],
          config: (row["config"] ?? {}) as AutomationStep["config"],
        })),
      );
      if (errors.length > 0) throw new Error(errors.join(" "));
    }
    const { error } = await db
      .from("marketing_automations")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runMarketingAutomations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "run marketing automations");
    const { runDueEnrollments } = await import("./marketing/automations.server");
    return runDueEnrollments({ limit: 100 });
  });

/* ------------------------------------------------------------------ forms */

export const listMarketingForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing forms");
    const db = await admin();
    const [{ data: forms }, { data: submissions }] = await Promise.all([
      db.from("marketing_forms").select("*").order("created_at", { ascending: false }),
      db
        .from("marketing_form_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return { forms: forms ?? [], submissions: submissions ?? [] };
  });

export const saveMarketingForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id?: string;
    name: string;
    slug: string;
    formType: string;
    enabled?: boolean;
    collectFirstName?: boolean;
    consentText?: string;
    successMessage?: string;
    source?: string;
    tags?: string[];
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing form");
    const db = await admin();
    const payload = {
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      form_type: data.formType,
      enabled: data.enabled ?? true,
      collect_first_name: data.collectFirstName ?? true,
      consent_text: data.consentText ?? "",
      success_message: data.successMessage ?? "Thanks — you're subscribed.",
      source: data.source ?? "form",
      tags: data.tags ?? ["newsletter"],
    };
    if (data.id) {
      const { error } = await db.from("marketing_forms").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await db.from("marketing_forms").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/* -------------------------------------------------- analytics + settings */

export const marketingAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => input ?? {})
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "marketing analytics");
    const db = await admin();
    const days = Math.min(Math.max(data.days ?? 30, 7), 90);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const [{ data: events }, { data: campaigns }, { data: subscribers }] = await Promise.all([
      db
        .from("marketing_email_events")
        .select("event_type, created_at, campaign_id, automation_id")
        .gte("created_at", since),
      db.from("marketing_campaigns").select("id, name, stats, status"),
      db.from("marketing_subscribers").select("status, created_at").gte("created_at", since),
    ]);
    const rows = (events ?? []) as { event_type: string; created_at: string }[];
    const byDay = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const bucket = byDay.get(day) ?? {};
      bucket[row.event_type] = (bucket[row.event_type] ?? 0) + 1;
      byDay.set(day, bucket);
    }
    return {
      days,
      timeline: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, counts]) => ({ day, counts })),
      totals: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.event_type] = (acc[row.event_type] ?? 0) + 1;
        return acc;
      }, {}),
      campaigns: campaigns ?? [],
      growth: (subscribers ?? []).length,
    };
  });

export const listMarketingSuppression = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "list marketing suppression");
    const db = await admin();
    const { data } = await db
      .from("marketing_suppression")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    return data ?? [];
  });

export const updateMarketingSuppression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; action: "add" | "remove"; reason?: string }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "update marketing suppression");
    const { suppressEmail, resubscribeEmail } = await import("./marketing/subscribers.server");
    if (data.action === "add") {
      await suppressEmail({
        email: data.email,
        reason: (data.reason as "manual") ?? "manual",
        source: "admin",
      });
    } else {
      await resubscribeEmail(data.email);
    }
    return { ok: true };
  });

export const getMarketingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await guard(context as Ctx, "read marketing settings");
    const { loadSettings } = await import("./marketing/send-engine.server");
    return loadSettings();
  });

export const saveMarketingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    defaultProviderId?: string | null;
    defaultSendingDomainId?: string | null;
    maxEmailsPerDay?: number;
    maxEmailsPerWeek?: number;
  }) => input)
  .handler(async ({ context, data }) => {
    await guard(context as Ctx, "save marketing settings");
    const db = await admin();
    const { error } = await db.from("marketing_settings").upsert(
      {
        id: true,
        default_provider_id: data.defaultProviderId ?? null,
        default_sending_domain_id: data.defaultSendingDomainId ?? null,
        max_emails_per_day: Math.max(1, Math.min(data.maxEmailsPerDay ?? 1, 10)),
        max_emails_per_week: Math.max(1, Math.min(data.maxEmailsPerWeek ?? 3, 30)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
