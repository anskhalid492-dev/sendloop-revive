/**
 * Marketing send engine (server-only).
 *
 * Responsibilities, in order, for every single marketing email:
 *   1. validate configuration once (provider + verified sending domain),
 *   2. gate each recipient (status, suppression, frequency, duplicates),
 *   3. render through `renderMarketingEmail`, which always appends the
 *      unsubscribe footer and one-click headers,
 *   4. send through the marketing provider,
 *   5. record a marketing-only delivery event.
 *
 * This engine is completely separate from the customer cold-email dispatcher:
 * different tables, different providers, different domains, different
 * analytics. Marketing traffic can never touch a customer's sending
 * reputation or appear in their campaign stats.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { evaluateSendGate, validateSendConfiguration, type SendSkipReason } from "./frequency";
import { marketingHeaders, renderMarketingEmail } from "./render";
import { builtInSegment, matchesSegment } from "./segments";
import { sendThroughMarketingProvider } from "./providers.server";
import {
  loadFrequencyState,
  loadSubscriberProfiles,
  toSubscriber,
  suppressedSet,
} from "./subscribers.server";
import { builtInTemplate } from "./template-library";
import { marketingPreferencesUrl, marketingUnsubscribeUrl } from "./unsubscribe.server";
import { marketingOpenPixelUrl } from "./engagement-tracking";
import type {
  MarketingSettings,
  MarketingSubscriber,
  MarketingTemplate,
  SegmentDefinition,
} from "./types";

export type ResolvedTemplate = Pick<
  MarketingTemplate,
  "subject" | "previewText" | "body" | "fromName" | "replyTo"
> & { label: string };

export async function loadSettings(): Promise<MarketingSettings> {
  const { data } = await supabaseAdmin.from("marketing_settings").select("*").eq("id", true).maybeSingle();
  return {
    defaultProviderId: data?.default_provider_id ?? null,
    defaultSendingDomainId: data?.default_sending_domain_id ?? null,
    maxEmailsPerDay: data?.max_emails_per_day ?? 1,
    maxEmailsPerWeek: data?.max_emails_per_week ?? 3,
  };
}

export async function resolveTemplate(args: {
  templateId?: string | null;
  builtinKey?: string | null;
}): Promise<ResolvedTemplate | null> {
  if (args.builtinKey) {
    const built = builtInTemplate(args.builtinKey);
    if (!built) return null;
    return {
      subject: built.subject,
      previewText: built.previewText,
      body: built.body,
      fromName: built.fromName,
      replyTo: built.replyTo,
      label: built.name,
    };
  }
  if (!args.templateId) return null;
  const { data } = await supabaseAdmin
    .from("marketing_templates")
    .select("*")
    .eq("id", args.templateId)
    .maybeSingle();
  if (!data) return null;
  return {
    subject: data.subject,
    previewText: data.preview_text ?? "",
    body: data.body,
    fromName: data.from_name,
    replyTo: data.reply_to,
    label: data.name,
  };
}

export async function resolveSegmentDefinition(args: {
  segmentId?: string | null;
  segmentKey?: string | null;
}): Promise<{ definition: SegmentDefinition; manualIds: string[] | null } | null> {
  if (args.segmentKey) {
    const built = builtInSegment(args.segmentKey);
    return built ? { definition: built.conditions, manualIds: null } : null;
  }
  if (!args.segmentId) return null;
  const { data } = await supabaseAdmin
    .from("marketing_segments")
    .select("*")
    .eq("id", args.segmentId)
    .maybeSingle();
  if (!data) return null;
  if (data.kind === "manual") {
    const { data: members } = await supabaseAdmin
      .from("marketing_segment_members")
      .select("subscriber_id")
      .eq("segment_id", data.id);
    return {
      definition: { match: "all", rules: [] },
      manualIds: (members ?? []).map((m: { subscriber_id: string }) => m.subscriber_id),
    };
  }
  return {
    definition: (data.conditions ?? { match: "all", rules: [] }) as SegmentDefinition,
    manualIds: null,
  };
}

/** Resolves the audience for a segment: active subscribers matching the rules. */
export async function resolveAudienceSubscribers(args: {
  segmentId?: string | null;
  segmentKey?: string | null;
  limit?: number;
}): Promise<MarketingSubscriber[]> {
  const segment = await resolveSegmentDefinition(args);
  const { data } = await supabaseAdmin
    .from("marketing_subscribers")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(args.limit ?? 5000);
  const subscribers = (data ?? []).map(toSubscriber);
  if (!segment) return subscribers.filter((s) => s.status === "active");
  if (segment.manualIds) {
    const ids = new Set(segment.manualIds);
    return subscribers.filter((s) => ids.has(s.id));
  }
  const profiles = await loadSubscriberProfiles(subscribers);
  const now = new Date();
  const matching = new Set(
    profiles.filter((p) => matchesSegment(p, segment.definition, now)).map((p) => p.id),
  );
  return subscribers.filter((s) => matching.has(s.id));
}

export type SendOneInput = {
  subscriber: MarketingSubscriber;
  template: ResolvedTemplate;
  subjectOverride?: string | null;
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  providerId: string;
  sendingDomainId: string | null;
  campaignId?: string | null;
  automationId?: string | null;
  listId: string;
};

export type SendOneResult =
  | { status: "sent"; providerMessageId?: string | undefined }
  | { status: "skipped"; reason: SendSkipReason; detail: string }
  | { status: "failed"; detail: string };

/** Sends one already-gated marketing email and records the delivery event. */
export async function deliverMarketingEmail(input: SendOneInput): Promise<SendOneResult> {
  const target = {
    subscriberId: input.subscriber.id,
    email: input.subscriber.email,
    campaignId: input.campaignId ?? null,
    automationId: input.automationId ?? null,
  };
  const unsubscribeUrl = marketingUnsubscribeUrl(target);
  const names = await resolveSubscriberName(input.subscriber);
  const sendEventId = crypto.randomUUID();
  const replyTo = input.replyTo ?? input.template.replyTo ?? null;
  const rendered = renderMarketingEmail({
    openPixelUrl: marketingOpenPixelUrl({
      sendEventId,
      subscriberId: input.subscriber.id,
      email: input.subscriber.email,
      campaignId: input.campaignId ?? null,
      automationId: input.automationId ?? null,
    }),
    subject: input.subjectOverride?.trim() || input.template.subject,
    previewText: input.template.previewText,
    body: input.template.body,
    unsubscribeUrl,
    preferencesUrl: marketingPreferencesUrl(target),
    variables: {
      first_name: names.firstName || "there",
      last_name: names.lastName,
      email: input.subscriber.email,
      full_name: [names.firstName, names.lastName].filter(Boolean).join(" ") || "there",
    },
  });

  const result = await sendThroughMarketingProvider(input.providerId, {
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo,
    to: input.subscriber.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: marketingHeaders(unsubscribeUrl, input.listId),
  });

  await recordMarketingEvent({
    id: result.ok ? sendEventId : undefined,
    metadata: {
      template: input.template.label,
      subject: rendered.subject,
      reply_to: replyTo ? replyTo.trim().toLowerCase() : null,
    },
    eventType: result.ok ? "marketing_email_sent" : "marketing_email_failed",
    subscriberId: input.subscriber.id,
    email: input.subscriber.email,
    campaignId: input.campaignId ?? null,
    automationId: input.automationId ?? null,
    providerId: input.providerId,
    sendingDomainId: input.sendingDomainId,
    providerMessageId: result.messageId ?? null,
    detail: result.message,
  });

  if (!result.ok) return { status: "failed", detail: result.message };

  await supabaseAdmin
    .from("marketing_subscribers")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", input.subscriber.id);

  return { status: "sent", providerMessageId: result.messageId };
}

export async function recordMarketingEvent(args: {
  id?: string | undefined;
  eventType: string;
  subscriberId?: string | null;
  email: string;
  campaignId?: string | null;
  automationId?: string | null;
  providerId?: string | null;
  sendingDomainId?: string | null;
  providerMessageId?: string | null;
  detail?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await supabaseAdmin.from("marketing_email_events").insert({
    ...(args.id ? { id: args.id } : {}),
    event_type: args.eventType,
    subscriber_id: args.subscriberId ?? null,
    email: args.email,
    campaign_id: args.campaignId ?? null,
    automation_id: args.automationId ?? null,
    provider_id: args.providerId ?? null,
    sending_domain_id: args.sendingDomainId ?? null,
    provider_message_id: args.providerMessageId ?? null,
    detail: args.detail?.slice(0, 500) ?? null,
    metadata: args.metadata ?? {},
  });
}

export type CampaignSendSummary = {
  campaignId: string;
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  configurationIssues: { code: string; message: string }[];
};

/**
 * Processes a batch of a marketing campaign. Safe to call repeatedly: the
 * recipient table records who has already been handled, so retries and
 * overlapping cron ticks never double-send.
 */
export async function processMarketingCampaign(
  campaignId: string,
  options: { batchSize?: number } = {},
): Promise<CampaignSendSummary> {
  const batchSize = options.batchSize ?? 100;
  const summary: CampaignSendSummary = {
    campaignId,
    attempted: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    skipReasons: {},
    configurationIssues: [],
  };

  const { data: campaign } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) throw new Error("Campaign not found");
  if (!["scheduled", "sending"].includes(campaign.status)) return summary;

  const settings = await loadSettings();
  const providerId = campaign.provider_id ?? settings.defaultProviderId;
  const domainId = campaign.sending_domain_id ?? settings.defaultSendingDomainId;

  const [{ data: providerRow }, { data: domainRow }] = await Promise.all([
    providerId
      ? supabaseAdmin.from("marketing_email_providers").select("*").eq("id", providerId).maybeSingle()
      : Promise.resolve({ data: null } as never),
    domainId
      ? supabaseAdmin.from("marketing_sending_domains").select("*").eq("id", domainId).maybeSingle()
      : Promise.resolve({ data: null } as never),
  ]);

  const issues = validateSendConfiguration({
    provider: providerRow
      ? {
          id: providerRow.id,
          status: providerRow.status,
          connectionStatus: providerRow.connection_status,
        }
      : null,
    domain: domainRow
      ? {
          id: domainRow.id,
          domain: domainRow.domain,
          enabled: domainRow.enabled,
          verificationStatus: domainRow.verification_status,
          spfStatus: domainRow.spf_status,
          dkimStatus: domainRow.dkim_status,
          dmarcStatus: domainRow.dmarc_status,
          allowedProviderIds: domainRow.allowed_provider_ids ?? [],
        }
      : null,
    fromEmail: campaign.from_email ?? "",
  });

  if (issues.length > 0) {
    summary.configurationIssues = issues;
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({ status: "failed", failure_reason: issues.map((i) => i.message).join(" ") })
      .eq("id", campaignId);
    return summary;
  }

  const template = await resolveTemplate({
    templateId: campaign.template_id,
    builtinKey: campaign.builtin_template_key,
  });
  if (!template) {
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({ status: "failed", failure_reason: "Template not found." })
      .eq("id", campaignId);
    summary.configurationIssues.push({ code: "template_missing", message: "Template not found." });
    return summary;
  }

  if (campaign.status !== "sending") {
    await supabaseAdmin
      .from("marketing_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", campaignId);
  }

  const audience = await resolveAudienceSubscribers({
    segmentId: campaign.segment_id,
    segmentKey: campaign.segment_key,
  });

  const { data: handledRows } = await supabaseAdmin
    .from("marketing_campaign_recipients")
    .select("subscriber_id")
    .eq("campaign_id", campaignId);
  const handled = new Set((handledRows ?? []).map((r: { subscriber_id: string }) => r.subscriber_id));

  const pending = audience.filter((s) => !handled.has(s.id)).slice(0, batchSize);
  if (pending.length === 0) {
    await finalizeCampaign(campaignId);
    return summary;
  }

  const emails = pending.map((s) => s.email);
  const [suppressed, frequency] = await Promise.all([
    suppressedSet(emails),
    loadFrequencyState(emails),
  ]);

  for (const subscriber of pending) {
    summary.attempted += 1;
    const gate = evaluateSendGate({
      email: subscriber.email,
      status: subscriber.status,
      suppressed: suppressed.has(subscriber.email),
      alreadySent: false,
      frequency: frequency.get(subscriber.email) ?? { sentLast24h: 0, sentLast7d: 0 },
      limits: { maxPerDay: settings.maxEmailsPerDay, maxPerWeek: settings.maxEmailsPerWeek },
    });

    if (!gate.allowed) {
      summary.skipped += 1;
      summary.skipReasons[gate.reason] = (summary.skipReasons[gate.reason] ?? 0) + 1;
      await supabaseAdmin.from("marketing_campaign_recipients").insert({
        campaign_id: campaignId,
        subscriber_id: subscriber.id,
        email: subscriber.email,
        status: "skipped",
        skip_reason: gate.reason,
        error_message: gate.detail,
      });
      await recordMarketingEvent({
        eventType: "marketing_email_suppressed",
        subscriberId: subscriber.id,
        email: subscriber.email,
        campaignId,
        detail: gate.detail,
      });
      continue;
    }

    const result = await deliverMarketingEmail({
      subscriber,
      template,
      subjectOverride: campaign.subject_override,
      fromName: campaign.from_name,
      fromEmail: campaign.from_email,
      replyTo: campaign.reply_to,
      providerId: providerRow!.id,
      sendingDomainId: domainRow?.id ?? null,
      campaignId,
      listId: `marketing.${domainRow?.domain ?? "munchreach.com"}`,
    });

    if (result.status === "sent") {
      summary.sent += 1;
      await supabaseAdmin.from("marketing_campaign_recipients").insert({
        campaign_id: campaignId,
        subscriber_id: subscriber.id,
        email: subscriber.email,
        status: "sent",
        provider_message_id: result.providerMessageId ?? null,
        sent_at: new Date().toISOString(),
      });
    } else if (result.status === "failed") {
      summary.failed += 1;
      await supabaseAdmin.from("marketing_campaign_recipients").insert({
        campaign_id: campaignId,
        subscriber_id: subscriber.id,
        email: subscriber.email,
        status: "failed",
        error_message: result.detail,
      });
    }
  }

  await refreshCampaignStats(campaignId);
  const remaining = audience.length - handled.size - pending.length;
  if (remaining <= 0) await finalizeCampaign(campaignId);
  return summary;
}

async function finalizeCampaign(campaignId: string) {
  await refreshCampaignStats(campaignId);
  await supabaseAdmin
    .from("marketing_campaigns")
    .update({ status: "sent", completed_at: new Date().toISOString() })
    .eq("id", campaignId);
}

export async function refreshCampaignStats(campaignId: string) {
  const { data } = await supabaseAdmin
    .from("marketing_campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);
  const rows = (data ?? []) as { status: string }[];
  const stats = {
    recipients: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
  const { data: events } = await supabaseAdmin
    .from("marketing_email_events")
    .select("event_type")
    .eq("campaign_id", campaignId);
  const counts = (events ?? []).reduce<Record<string, number>>((acc, row: { event_type: string }) => {
    acc[row.event_type] = (acc[row.event_type] ?? 0) + 1;
    return acc;
  }, {});
  await supabaseAdmin
    .from("marketing_campaigns")
    .update({
      stats: {
        ...stats,
        opened: counts["marketing_email_opened"] ?? 0,
        replied: counts["marketing_email_replied"] ?? 0,
        clicked: counts["marketing_email_clicked"] ?? 0,
        bounced: counts["marketing_email_bounced"] ?? 0,
        unsubscribed: counts["marketing_email_unsubscribed"] ?? 0,
      },
    })
    .eq("id", campaignId);
}

/** Sends a one-off preview/test email to a chosen address. */
export async function sendMarketingTestEmail(args: {
  to: string;
  template: ResolvedTemplate;
  subjectOverride?: string | null;
  fromName: string;
  fromEmail: string;
  providerId: string;
}): Promise<{ ok: boolean; message: string }> {
  // Test sends behave exactly like real ones: the recipient's real name and a
  // working, signed unsubscribe link for that address.
  const email = args.to.trim().toLowerCase();
  const { data: row } = await supabaseAdmin
    .from("marketing_subscribers")
    .select("id, first_name, last_name, user_id")
    .eq("email", email)
    .maybeSingle();
  const sub = row as { id: string; first_name: string | null; last_name: string | null; user_id: string | null } | null;
  const names = await resolveSubscriberName({
    email,
    firstName: sub?.first_name ?? null,
    lastName: sub?.last_name ?? null,
    userId: sub?.user_id ?? null,
  });
  const target = { subscriberId: sub?.id ?? `test:${email}`, email };
  const unsubscribeUrl = marketingUnsubscribeUrl(target);
  const rendered = renderMarketingEmail({
    subject: `[TEST] ${args.subjectOverride?.trim() || args.template.subject}`,
    previewText: args.template.previewText,
    body: args.template.body,
    unsubscribeUrl,
    preferencesUrl: marketingPreferencesUrl(target),
    variables: {
      first_name: names.firstName || "there",
      last_name: names.lastName,
      email: args.to,
      full_name: [names.firstName, names.lastName].filter(Boolean).join(" ") || "there",
    },
  });
  const result = await sendThroughMarketingProvider(args.providerId, {
    fromName: args.fromName,
    fromEmail: args.fromEmail,
    to: args.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    headers: marketingHeaders(unsubscribeUrl, "test.marketing.munchreach.com"),
  });
  return { ok: result.ok, message: result.message };
}


/**
 * The subscriber's real name for greetings. Uses the subscriber record first,
 * then the linked (or same-email) MunchReach account's profile name. Returns
 * empty strings only when no name exists anywhere — never an invented one.
 */
export async function resolveSubscriberName(sub: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  userId?: string | null;
}): Promise<{ firstName: string; lastName: string }> {
  const first = (sub.firstName ?? "").trim();
  if (first) return { firstName: first, lastName: (sub.lastName ?? "").trim() };
  try {
    const query = supabaseAdmin.from("profiles").select("full_name");
    const { data } = sub.userId
      ? await query.eq("id", sub.userId).maybeSingle()
      : await query.eq("email", sub.email.trim().toLowerCase()).limit(1).maybeSingle();
    const full = ((data as { full_name?: string | null } | null)?.full_name ?? "").trim();
    if (full && !full.includes("@")) {
      const [f, ...rest] = full.split(/\s+/);
      return { firstName: f ?? "", lastName: rest.join(" ") };
    }
  } catch {
    // Name lookup is best-effort; the greeting falls back safely.
  }
  return { firstName: "", lastName: (sub.lastName ?? "").trim() };
}
