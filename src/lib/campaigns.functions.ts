import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nextSendSlot } from "@/lib/campaign-schedule";
import {
  CAMPAIGN_COLUMNS,
  STEP_COLUMNS,
  renderTemplate,
  resolveSpintax,
  type Campaign,
  type CampaignStep,
  type CustomVariable,
  type CampaignStepVariant,
  type StepConfig,
} from "@/lib/campaign-model";

export type { Campaign, CampaignStep, CampaignStepVariant, CampaignStatus } from "@/lib/campaign-model";

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const campaigns = (data ?? []) as unknown as Campaign[];
    if (campaigns.length === 0) return [] as Array<Campaign & { recipients: number; sent: number }>;

    const { data: recipients, error: rErr } = await context.supabase
      .from("campaign_recipients")
      .select("campaign_id, status");
    if (rErr) throw new Error(rErr.message);

    return campaigns.map((c) => {
      const rows = (recipients ?? []).filter((r) => r.campaign_id === c.id);
      return {
        ...c,
        recipients: rows.length,
        sent: rows.filter((r) => r.status !== "pending").length,
      };
    });
  });

export const listCampaignsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { buildCampaignOverview } = await import("@/lib/campaign-overview");

    const [campaignsRes, recipientsRes, messagesRes, repliesRes, conversationsRes, accountsRes] =
      await Promise.all([
        context.supabase
          .from("campaigns")
          .select("id, name, description, status, tags, created_at, launched_at, sending_account_ids")
          .order("created_at", { ascending: false }),
        context.supabase.from("campaign_recipients").select("campaign_id, lead_id"),
        context.supabase.from("campaign_messages").select("campaign_id, status, to_email"),
        context.supabase.from("campaign_replies").select("campaign_id, lead_id, from_email, sentiment"),
        context.supabase.from("conversations").select("campaign_id, lead_id, prospect_email, status"),
        context.supabase
          .from("sending_accounts")
          .select("id, from_email, from_name, paused, customer_enabled, status, warmup_status"),
      ]);

    const failure = [campaignsRes, recipientsRes, messagesRes, repliesRes, conversationsRes, accountsRes].find(
      (r) => r.error,
    );
    if (failure?.error) throw new Error(failure.error.message);

    return buildCampaignOverview({
      campaigns: (campaignsRes.data ?? []) as never,
      recipients: (recipientsRes.data ?? []) as never,
      messages: (messagesRes.data ?? []) as never,
      replies: (repliesRes.data ?? []) as never,
      meetings: (conversationsRes.data ?? []) as never,
      accounts: (accountsRes.data ?? []) as never,
    });
  });


export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");

    const [stepsRes, variantsRes, recipientsRes] = await Promise.all([
      context.supabase
        .from("campaign_steps")
        .select(STEP_COLUMNS)
        .eq("campaign_id", data.id)
        .order("step_order", { ascending: true }),
      context.supabase
        .from("campaign_step_variants")
        .select("id, step_id, label, subject, body, weight")
        .eq("campaign_id", data.id)
        .order("label", { ascending: true }),
      context.supabase
        .from("campaign_recipients")
        .select("id, status, current_step, next_send_at, last_sent_at, lead_id")
        .eq("campaign_id", data.id),
    ]);
    if (stepsRes.error) throw new Error(stepsRes.error.message);
    if (variantsRes.error) throw new Error(variantsRes.error.message);
    if (recipientsRes.error) throw new Error(recipientsRes.error.message);

    const variants = (variantsRes.data ?? []) as unknown as CampaignStepVariant[];
    const steps = ((stepsRes.data ?? []) as unknown as CampaignStep[]).map((s) => ({
      ...s,
      variants: variants.filter((v) => v.step_id === s.id),
    }));
    const recipients = recipientsRes.data ?? [];
    const countBy = (status: string) => recipients.filter((r) => r.status === status).length;

    return {
      campaign: campaign as unknown as Campaign,
      steps,
      queue: {
        total: recipients.length,
        pending: countBy("pending"),
        inProgress: countBy("in_progress"),
        completed: countBy("completed"),
        replied: countBy("replied"),
        bounced: countBy("bounced"),
        unsubscribed: countBy("unsubscribed"),
        failed: countBy("failed"),
        stopped: countBy("stopped"),
        sent: recipients.filter((r) => r.last_sent_at).length,
        byStep: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((step) => ({
          step,
          reached: recipients.filter((r) => r.current_step >= step).length,
        })),
        nextSendAt:
          recipients
            .map((r) => r.next_send_at)
            .filter((v): v is string => Boolean(v))
            .sort()[0] ?? null,
      },
    };
  });

export const getCampaignLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: recipients, error } = await context.supabase
      .from("campaign_recipients")
      .select(
        "id, status, current_step, next_send_at, last_sent_at, sending_account_id, created_at, lead_id",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    if (!recipients?.length) return [];

    const { data: leads, error: lErr } = await context.supabase
      .from("leads")
      .select(
        "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
      )
      .in("id", recipients.map((r) => r.lead_id));
    if (lErr) throw new Error(lErr.message);

    const byId = new Map((leads ?? []).map((l) => [l.id, l]));
    return recipients.map((r) => ({
      ...r,
      lead: byId.get(r.lead_id) ?? null,
    }));
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .insert({
        workspace_id: data.workspaceId,
        name: data.name,
        description: data.description ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: stepErr } = await context.supabase.from("campaign_steps").insert({
      campaign_id: campaign.id,
      workspace_id: data.workspaceId,
      step_order: 1,
      name: "Initial email",
      step_type: "email",
      subject: "Quick question about {{company}}",
      body: "Hi {{first_name | there}},\n\n",
      wait_days: 0,
      wait_hours: 0,
      same_thread: false,
    });
    if (stepErr) throw new Error(stepErr.message);

    return { id: campaign.id as string };
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        listId: z.string().uuid().nullable().optional(),
        sendingAccountIds: z.array(z.string().uuid()).max(50).optional(),
        timezone: z.string().max(64).optional(),
        sendDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
        sendStartHour: z.number().int().min(0).max(23).optional(),
        sendEndHour: z.number().int().min(1).max(24).optional(),
        dailyCap: z.number().int().min(1).max(10000).optional(),
        stopOnReply: z.boolean().optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        startAt: z.string().nullable().optional(),
        endAt: z.string().nullable().optional(),
        minDelayMinutes: z.number().int().min(0).max(240).optional(),
        randomDelayMinutes: z.number().int().min(0).max(240).optional(),
        maxPerHour: z.number().int().min(1).max(5000).optional(),
        businessDaysOnly: z.boolean().optional(),
        openTracking: z.boolean().optional(),
        clickTracking: z.boolean().optional(),
        textOnly: z.boolean().optional(),
        stopOnCompanyReply: z.boolean().optional(),
        maxContactsPerCompany: z.number().int().min(0).max(50).optional(),
        unsubscribeEnabled: z.boolean().optional(),
        inboxRotationEnabled: z.boolean().optional(),
        inboxRotationStrategy: z.enum(["round_robin", "random", "least_used"]).optional(),
        rotationDailyCapPerInbox: z.number().int().min(0).max(10000).optional(),
        customVariables: z
          .array(
            z.object({
              token: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
              label: z.string().trim().min(1).max(60),
              defaultValue: z.string().max(200),
            }),
          )
          .max(50)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const map: Record<string, string> = {
      name: "name",
      description: "description",
      listId: "list_id",
      sendingAccountIds: "sending_account_ids",
      timezone: "timezone",
      sendDays: "send_days",
      sendStartHour: "send_start_hour",
      sendEndHour: "send_end_hour",
      dailyCap: "daily_cap",
      stopOnReply: "stop_on_reply",
      tags: "tags",
      startAt: "start_at",
      endAt: "end_at",
      minDelayMinutes: "min_delay_minutes",
      randomDelayMinutes: "random_delay_minutes",
      maxPerHour: "max_per_hour",
      businessDaysOnly: "business_days_only",
      openTracking: "open_tracking",
      clickTracking: "click_tracking",
      textOnly: "text_only",
      stopOnCompanyReply: "stop_on_company_reply",
      maxContactsPerCompany: "max_contacts_per_company",
      unsubscribeEnabled: "unsubscribe_enabled",
      inboxRotationEnabled: "inbox_rotation_enabled",
      inboxRotationStrategy: "inbox_rotation_strategy",
      rotationDailyCapPerInbox: "rotation_daily_cap_per_inbox",
      customVariables: "custom_variables",
    };
    const patch: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(map)) {
      const value = (data as Record<string, unknown>)[key];
      if (key !== "id" && value !== undefined) patch[column] = value;
    }
    if (Object.keys(patch).length === 0) return { ok: true, readiness: null };

    const { error } = await context.supabase
      .from("campaigns")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Any edit that can change the audience recomputes and persists the real
    // eligible recipient count so the readiness bar survives a refresh.
    const { refreshReadiness } = await import("@/lib/campaign-launch.server");
    let readiness = null;
    try {
      readiness = await refreshReadiness(context.supabase, data.id);
    } catch {
      readiness = null;
    }
    return { ok: true, readiness };
  });


export const saveCampaignSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        steps: z
          .array(
            z.object({
              name: z.string().max(120).optional(),
              stepType: z
                .enum(["email", "wait", "condition", "task", "crm", "webhook", "stop"])
                .default("email"),
              subject: z.string().max(300),
              body: z.string().max(20000),
              waitDays: z.number().int().min(0).max(90),
              waitHours: z.number().int().min(0).max(23),
              delayMinutes: z.number().int().min(0).max(59).default(0),
              sameThread: z.boolean().default(true),
              config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
              variants: z
                .array(
                  z.object({
                    label: z.string().max(4),
                    subject: z.string().max(300),
                    body: z.string().max(20000),
                    weight: z.number().int().min(0).max(100),
                  }),
                )
                .max(26)
                .default([]),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error: delErr } = await context.supabase
      .from("campaign_steps")
      .delete()
      .eq("campaign_id", data.campaignId);
    if (delErr) throw new Error(delErr.message);

    const { data: inserted, error } = await context.supabase
      .from("campaign_steps")
      .insert(
        data.steps.map((s, i) => ({
          campaign_id: data.campaignId,
          workspace_id: data.workspaceId,
          step_order: i + 1,
          name: s.name ?? "",
          step_type: s.stepType,
          subject: s.subject,
          body: s.body,
          wait_days: i === 0 ? 0 : s.waitDays,
          wait_hours: i === 0 ? 0 : s.waitHours,
          delay_minutes: i === 0 ? 0 : s.delayMinutes,
          same_thread: i === 0 ? false : s.sameThread,
          config: s.config as StepConfig,
        })) as never,
      )
      .select("id, step_order");
    if (error) throw new Error(error.message);

    const variantRows = (inserted ?? []).flatMap((row) => {
      const draft = data.steps[row.step_order - 1];
      return (draft?.variants ?? []).map((v) => ({
        step_id: row.id,
        campaign_id: data.campaignId,
        workspace_id: data.workspaceId,
        label: v.label,
        subject: v.subject,
        body: v.body,
        weight: v.weight,
      }));
    });
    if (variantRows.length) {
      const { error: vErr } = await context.supabase
        .from("campaign_step_variants")
        .insert(variantRows);
      if (vErr) throw new Error(vErr.message);
    }

    return { ok: true };
  });

export const addLeadsToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: z.string().uuid(), listId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = campaign as unknown as Campaign;

    const [leadsRes, existingRes] = await Promise.all([
      context.supabase.from("leads").select("id").eq("list_id", data.listId),
      context.supabase
        .from("campaign_recipients")
        .select("lead_id")
        .eq("campaign_id", data.campaignId),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (existingRes.error) throw new Error(existingRes.error.message);

    const already = new Set((existingRes.data ?? []).map((r) => r.lead_id));
    const fresh = (leadsRes.data ?? []).filter((l) => !already.has(l.id));
    const accounts = c.sending_account_ids;

    const slot = nextSendSlot(new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }).toISOString();

    if (fresh.length) {
      const rows = fresh.map((lead, index) => ({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        lead_id: lead.id,
        sending_account_id: accounts.length ? accounts[index % accounts.length]! : null,
        status: "pending" as const,
        current_step: 0,
        next_send_at: c.status === "active" ? slot : null,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error: insErr } = await context.supabase
          .from("campaign_recipients")
          .insert(rows.slice(i, i + 500));
        if (insErr) throw new Error(insErr.message);
      }
    }

    if (!c.list_id) {
      await context.supabase
        .from("campaigns")
        .update({ list_id: data.listId })
        .eq("id", data.campaignId);
    }

    return { added: fresh.length, skipped: (leadsRes.data ?? []).length - fresh.length };
  });

export const updateCampaignRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        recipientIds: z.array(z.string().uuid()).min(1).max(1000),
        action: z.enum(["pause", "resume", "remove"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "remove") {
      const { error } = await context.supabase
        .from("campaign_recipients")
        .delete()
        .eq("campaign_id", data.campaignId)
        .in("id", data.recipientIds);
      if (error) throw new Error(error.message);
      return { ok: true, affected: data.recipientIds.length };
    }

    const { error } = await context.supabase
      .from("campaign_recipients")
      .update({ status: data.action === "pause" ? "stopped" : "pending" })
      .eq("campaign_id", data.campaignId)
      .in("id", data.recipientIds);
    if (error) throw new Error(error.message);
    return { ok: true, affected: data.recipientIds.length };
  });

export const sendCampaignTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        sendingAccountId: z.string().uuid(),
        to: z.array(z.string().trim().email()).min(1).max(5),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
        leadId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getAdapter, readCredentials } = await import("./providers/adapter.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: account, error } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, provider_id, from_name, from_email, reply_to, workspace_id")
      .eq("id", data.sendingAccountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Sending account not found");
    if (!account.provider_id && account.provider !== "resend")
      throw new Error("This mailbox is not linked to a provider yet");

    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id, custom_variables")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign || campaign.workspace_id !== account.workspace_id) {
      throw new Error("Campaign and sending account must belong to the same workspace");
    }

    let subject = data.subject;
    let body = data.body;
    if (data.leadId) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select(
          "email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
        )
        .eq("id", data.leadId)
        .maybeSingle();
      if (lead) {
        const l = lead as never;
        const variables = (campaign.custom_variables ?? []) as CustomVariable[];
        subject = renderTemplate(resolveSpintax(subject), l, variables);
        body = renderTemplate(resolveSpintax(body), l, variables);
      }
    } else {
      subject = resolveSpintax(subject);
      body = resolveSpintax(body);
    }

    const { data: accountSecret } = await supabaseAdmin
      .from("sending_account_secrets")
      .select("credentials_ciphertext")
      .eq("sending_account_id", account.id)
      .maybeSingle();
    const { data: providerSecret } = await supabaseAdmin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", account.provider_id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    const secret = accountSecret ?? providerSecret;
    if (!secret && !(account.provider === "resend" && process.env["RESEND_API_KEY"])) {
      throw new Error("No credentials stored for this provider yet");
    }

    const adapter = getAdapter(account.provider);
    const credentials = secret ? readCredentials(secret.credentials_ciphertext) : {};
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;

    const results = [] as Array<{
      to: string;
      ok: boolean;
      status: "accepted" | "rejected";
      message: string;
      requestId: string;
      providerRequestId?: string;
      providerMessageId?: string;
      statusCode?: number;
      providerResponse?: string;
      webhookStatus: string;
    }>;
    for (const to of data.to) {
      const requestId = crypto.randomUUID();
      const result = await adapter.sendEmail(credentials, {
        fromName: account.from_name,
        fromEmail: account.from_email,
        replyTo: account.reply_to,
        to,
        subject: `[Test] ${subject}`,
        text: body,
        html,
        headers: { "X-Sendloop-Test-Request-ID": requestId },
      });
      const diagnostic = {
        request_id: requestId,
        workspace_id: account.workspace_id,
        campaign_id: campaign.id,
        sending_account_id: account.id,
        requested_by: context.userId,
        recipient_email: to,
        provider: account.provider,
        provider_message_id: result.messageId ?? null,
        provider_response: result.providerResponse ?? result.message,
        status: result.ok ? "accepted" : "rejected",
        error: result.ok ? null : result.message,
      };
      const { error: diagnosticError } = await supabaseAdmin.from("campaign_test_sends").insert(diagnostic);
      results.push({
        to,
        ok: result.ok,
        status: result.ok ? "accepted" : "rejected",
        message: diagnosticError
          ? `${result.message} Diagnostic logging failed: ${diagnosticError.message}`
          : result.message,
        requestId,
        ...(result.requestId ? { providerRequestId: result.requestId } : {}),
        ...(result.messageId ? { providerMessageId: result.messageId } : {}),
        ...(result.statusCode ? { statusCode: result.statusCode } : {}),
        ...(result.providerResponse ? { providerResponse: result.providerResponse } : {}),
        webhookStatus: "Waiting for provider webhook",
      });
    }

    // The UI used to report success even when the provider rejected every
    // recipient, which is why "sent" test emails never arrived. Surface the
    // provider's own error instead.
    const failed = results.filter((r) => !r.ok);
    if (failed.length === results.length) {
      throw new Error(failed[0]?.message ?? "The email provider rejected this test send");
    }
    return { results, accepted: results.length - failed.length, failed };
  });

export const listCampaignTestDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ campaignId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign) throw new Error("Campaign not found");

    const { data: rows, error } = await context.supabase
      .from("campaign_test_sends")
      .select("id, request_id, recipient_email, provider, provider_message_id, provider_response, status, error, webhook_event_id, webhook_status, webhook_event_type, webhook_received_at, created_at")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const messageIds = (rows ?? []).map((row) => row.provider_message_id).filter(Boolean) as string[];
    const { data: events } = messageIds.length
      ? await supabaseAdmin
          .from("email_events")
          .select("id, message_id, event_type, status, error, created_at")
          .in("message_id", messageIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const { correlateTestSend } = await import("@/lib/test-send-status");
    return (rows ?? []).map((row) => correlateTestSend(row, (events ?? []) as never));
  });


export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign) throw new Error("Campaign not found");
    const c = campaign as unknown as Campaign;

    // Validate against the persisted audience relationship, never frontend state.
    const { evaluateLaunchReadiness, persistReadiness, recordLaunchEvent, refreshReadiness } =
      await import("@/lib/campaign-launch.server");

    const readiness = await evaluateLaunchReadiness(context.supabase, c.id);
    await persistReadiness(context.supabase, readiness);
    if (!readiness.ready) {
      // Audit the blocked attempt with the exact reasons before failing.
      await recordLaunchEvent(context.supabase, {
        readiness,
        actorId: context.userId,
        outcome: "blocked",
        errorMessage: readiness.issues[0]!.message,
      });
      throw new Error(readiness.issues[0]!.message);
    }


    const { data: steps, error: sErr } = await context.supabase
      .from("campaign_steps")
      .select("id, subject, body, step_type")
      .eq("campaign_id", c.id)
      .order("step_order", { ascending: true });
    if (sErr) throw new Error(sErr.message);
    const firstStep = steps?.find((s) => s.step_type === "email");
    if (!firstStep || !firstStep.subject.trim() || !firstStep.body.trim()) {
      throw new Error("The first email step needs a subject and a body before launching.");
    }

    const { data: accounts, error: aErr } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, status, customer_enabled, paused, daily_limit, sent_today")
      .in("id", c.sending_account_ids);
    if (aErr) throw new Error(aErr.message);
    const active = (accounts ?? []).filter(
      (a) => a.status !== "disabled" && a.customer_enabled && !a.paused,
    );
    if (!active.length) throw new Error("No active sending accounts are available.");

    // Inbox rotation. When rotation is off every send goes through the first
    // active mailbox; otherwise leads are spread across mailboxes using the
    // strategy chosen in the campaign settings, honouring the per-inbox cap.
    const campaignVariables = (c.custom_variables ?? []) as CustomVariable[];
    const rotationOn = c.inbox_rotation_enabled !== false;
    const perInboxCap = c.rotation_daily_cap_per_inbox || 0;
    let pool = active.map((a) => ({
      id: a.id,
      headroom: Math.max(
        0,
        Math.min(
          perInboxCap || Number.MAX_SAFE_INTEGER,
          (a.daily_limit ?? 0) - (a.sent_today ?? 0),
        ),
      ),
      sentToday: a.sent_today ?? 0,
    }));

    if (!rotationOn) pool = pool.slice(0, 1);
    else if (c.inbox_rotation_strategy === "random")
      pool = pool
        .map((a) => ({ a, r: Math.random() }))
        .sort((x, y) => x.r - y.r)
        .map(({ a }) => a);
    else if (c.inbox_rotation_strategy === "least_used")
      pool = [...pool].sort((a, b) => a.sentToday - b.sentToday || b.headroom - a.headroom);

    const usable = pool.map((a) => a.id);

    /** Pick the mailbox for the nth lead, skipping inboxes that are out of headroom. */
    const remaining = new Map(pool.map((a) => [a.id, a.headroom] as const));
    let cursor = 0;
    const pickAccount = (): string => {
      for (let attempt = 0; attempt < usable.length; attempt += 1) {
        const id = usable[(cursor + attempt) % usable.length]!;
        const left = remaining.get(id) ?? 0;
        if (left > 0) {
          remaining.set(id, left - 1);
          cursor = (cursor + attempt + 1) % usable.length;
          return id;
        }
      }
      // Everything is at capacity for today — fall back to plain rotation so the
      // queue still gets built; pacing is enforced again when messages are sent.
      const id = usable[cursor % usable.length]!;
      cursor += 1;
      return id;
    };

    // Only the lead ids the readiness check proved eligible get queued.
    let leads: Array<Record<string, unknown>> = [];
    if (readiness.eligibleLeadIds.length) {
      const { data: leadRows, error: lErr } = await context.supabase
        .from("leads")
        .select(
          "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
        )
        .in("id", readiness.eligibleLeadIds);
      if (lErr) throw new Error(lErr.message);
      leads = (leadRows ?? []) as unknown as Array<Record<string, unknown>>;
    }

    const { data: existing, error: eErr } = await context.supabase
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", c.id);
    if (eErr) throw new Error(eErr.message);
    const already = new Set((existing ?? []).map((r) => r.lead_id));

    const firstSlot = nextSendSlot(c.start_at ? new Date(c.start_at) : new Date(), {
      timezone: c.timezone,
      sendDays: c.send_days,
      startHour: c.send_start_hour,
      endHour: c.send_end_hour,
    }).toISOString();

    const fresh = leads.filter((l) => !already.has(String(l["id"]))) as Array<
      Record<string, unknown> & { id: string; email: string }
    >;
    if (fresh.length) {
      const accountById = new Map(
        (accounts ?? []).map((a) => [a.id, a as { id: string }] as const),
      );
      const rows = fresh.map((lead) => ({
        campaign_id: c.id,
        workspace_id: c.workspace_id,
        lead_id: lead.id,
        sending_account_id: pickAccount(),
        status: "pending" as const,
        current_step: 0,
        next_send_at: firstSlot,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const slice = rows.slice(i, i + 500);
        const { data: inserted, error: insErr } = await context.supabase
          .from("campaign_recipients")
          .insert(slice)
          .select("id, lead_id, sending_account_id");
        if (insErr) throw new Error(insErr.message);

        // Materialise the first email of the sequence into the sending queue.
        const leadById = new Map(
          (fresh as unknown as Array<{ id: string }>).map((l) => [l.id, l] as const),
        );
        const messages = (inserted ?? [])
          .map((recipient) => {
            const lead = leadById.get(recipient.lead_id) as never;
            if (!lead) return null;
            return {
              workspace_id: c.workspace_id,
              campaign_id: c.id,
              recipient_id: recipient.id,
              lead_id: recipient.lead_id,
              step_id: firstStep.id,
              sending_account_id: recipient.sending_account_id,
              step_order: 1,
              status: "scheduled" as const,
              to_email: (lead as { email: string }).email,
              subject: renderTemplate(resolveSpintax(firstStep.subject), lead, campaignVariables),
              body: renderTemplate(resolveSpintax(firstStep.body), lead, campaignVariables),
              scheduled_at: firstSlot,
              provider: recipient.sending_account_id
                ? (accountById.get(recipient.sending_account_id) as never as {
                    provider?: string;
                  } | undefined)?.provider ?? null
                : null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
        if (messages.length) {
          const { error: mErr } = await context.supabase
            .from("campaign_messages")
            .insert(messages as never);
          if (mErr) throw new Error(mErr.message);
        }
      }
    }


    // Recipients attached before launch (e.g. from the Leads tab) may not have a
    // first message yet — materialise those too so the campaign actually sends.
    const { data: pendingRows, error: pErr } = await context.supabase
      .from("campaign_recipients")
      .select("id, lead_id, sending_account_id")
      .eq("campaign_id", c.id)
      .eq("status", "pending")
      .eq("current_step", 0);
    if (pErr) throw new Error(pErr.message);
    const pendingRecipients = (pendingRows ?? []) as Array<{
      id: string;
      lead_id: string;
      sending_account_id: string | null;
    }>;

    if (pendingRecipients.length) {
      const { data: existingMsgs, error: mListErr } = await context.supabase
        .from("campaign_messages")
        .select("recipient_id")
        .eq("campaign_id", c.id)
        .eq("step_order", 1);
      if (mListErr) throw new Error(mListErr.message);
      const hasMessage = new Set(
        ((existingMsgs ?? []) as Array<{ recipient_id: string | null }>).map((m) => m.recipient_id),
      );
      const missing = pendingRecipients.filter((r) => !hasMessage.has(r.id));

      if (missing.length) {
        const { data: leadRows, error: lErr2 } = await context.supabase
          .from("leads")
          .select(
            "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields",
          )
          .in("id", missing.map((r) => r.lead_id));
        if (lErr2) throw new Error(lErr2.message);
        const leadById = new Map(
          ((leadRows ?? []) as unknown as Array<{ id: string; email: string }>).map((l) => [
            l.id,
            l,
          ] as const),
        );
        const backfill = missing
          .map((recipient) => {
            const lead = leadById.get(recipient.lead_id);
            if (!lead) return null;
            const accountId = recipient.sending_account_id ?? pickAccount();
            return {
              workspace_id: c.workspace_id,
              campaign_id: c.id,
              recipient_id: recipient.id,
              lead_id: recipient.lead_id,
              step_id: firstStep.id,
              sending_account_id: accountId,
              step_order: 1,
              status: "scheduled" as const,
              to_email: lead.email,
              subject: renderTemplate(
                resolveSpintax(firstStep.subject),
                lead as never,
                campaignVariables,
              ),
              body: renderTemplate(
                resolveSpintax(firstStep.body),
                lead as never,
                campaignVariables,
              ),
              scheduled_at: firstSlot,
              provider:
                (accounts ?? []).find((a) => a.id === accountId)?.provider ?? null,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        for (let i = 0; i < backfill.length; i += 500) {
          const { error: bErr } = await context.supabase
            .from("campaign_messages")
            .insert(backfill.slice(i, i + 500) as never);
          if (bErr) throw new Error(bErr.message);
        }
        // Recipients without a mailbox get one assigned on launch.
        for (const recipient of missing.filter((r) => !r.sending_account_id)) {
          await context.supabase
            .from("campaign_recipients")
            .update({ next_send_at: firstSlot })
            .eq("id", recipient.id);
        }
      }
    }

    const { error: uErr } = await context.supabase
      .from("campaigns")
      .update({ status: "active", launched_at: new Date().toISOString() })
      .eq("id", c.id);
    if (uErr) throw new Error(uErr.message);

    // Real queued message count straight from the queue, for the audit trail.
    const { count: scheduledCount } = await context.supabase
      .from("campaign_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "scheduled");

    const postReadiness = await refreshReadiness(context.supabase, c.id);
    await recordLaunchEvent(context.supabase, {
      readiness: { ...readiness, ...postReadiness, issues: readiness.issues },
      actorId: context.userId,
      outcome: "launched",
      queuedMessages: scheduledCount ?? 0,
      totalRecipients: already.size + fresh.length,
      firstSendAt: firstSlot,
    });

    return { queued: fresh.length, total: already.size + fresh.length, firstSendAt: firstSlot };
  });


export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "active", "paused", "completed", "archived"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("campaigns")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        includeLeads: z.boolean().default(false),
        includeSchedule: z.boolean().default(true),
        includeAccounts: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: source, error } = await context.supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Campaign not found");
    const c = source as unknown as Campaign;

    const { data: created, error: cErr } = await context.supabase
      .from("campaigns")
      .insert({
        workspace_id: c.workspace_id,
        name: `${c.name} (copy)`,
        description: c.description,
        created_by: context.userId,
        list_id: data.includeLeads ? c.list_id : null,
        sending_account_ids: data.includeAccounts ? c.sending_account_ids : [],
        timezone: c.timezone,
        send_days: data.includeSchedule ? c.send_days : [1, 2, 3, 4, 5],
        send_start_hour: data.includeSchedule ? c.send_start_hour : 9,
        send_end_hour: data.includeSchedule ? c.send_end_hour : 17,
        daily_cap: c.daily_cap,
        stop_on_reply: c.stop_on_reply,
        tags: c.tags,
        min_delay_minutes: c.min_delay_minutes,
        random_delay_minutes: c.random_delay_minutes,
        max_per_hour: c.max_per_hour,
        business_days_only: c.business_days_only,
        open_tracking: c.open_tracking,
        click_tracking: c.click_tracking,
        text_only: c.text_only,
        stop_on_company_reply: c.stop_on_company_reply,
        max_contacts_per_company: c.max_contacts_per_company,
        unsubscribe_enabled: c.unsubscribe_enabled,
        inbox_rotation_enabled: c.inbox_rotation_enabled,
        inbox_rotation_strategy: c.inbox_rotation_strategy,
        rotation_daily_cap_per_inbox: c.rotation_daily_cap_per_inbox,
        custom_variables: c.custom_variables ?? [],
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    const { data: steps, error: sErr } = await context.supabase
      .from("campaign_steps")
      .select(STEP_COLUMNS)
      .eq("campaign_id", c.id)
      .order("step_order", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    if (steps?.length) {
      const { error: insErr } = await context.supabase.from("campaign_steps").insert(
        steps.map((s) => ({
          campaign_id: created.id,
          workspace_id: c.workspace_id,
          step_order: s.step_order,
          name: s.name,
          step_type: s.step_type,
          subject: s.subject,
          body: s.body,
          wait_days: s.wait_days,
          wait_hours: s.wait_hours,
          delay_minutes: s.delay_minutes,
          same_thread: s.same_thread,
          config: s.config,
        })) as never,
      );
      if (insErr) throw new Error(insErr.message);
    }

    return { id: created.id as string };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** Database-backed launch validation used by the campaign builder. */
export const getCampaignLaunchReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { refreshReadiness } = await import("@/lib/campaign-launch.server");
    return await refreshReadiness(context.supabase, data.id);
  });

export type CampaignLaunchEvent = {
  id: string;
  created_at: string;
  outcome: string;
  ready: boolean;
  issues: { code: string; message: string }[];
  list_name: string | null;
  eligible: number;
  already_queued: number;
  audience: number;
  active_mailboxes: number;
  queued_messages: number;
  total_recipients: number;
  first_send_at: string | null;
  error_message: string | null;
  actor_email: string | null;
};

/** Launch audit trail: readiness checks, blocking reasons and queued counts. */
export const getCampaignLaunchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ campaignId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("campaign_launch_events")
      .select(
        "id, created_at, outcome, ready, issues, list_name, eligible, already_queued, audience, active_mailboxes, queued_messages, total_recipients, first_send_at, error_message, actor_id",
      )
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as unknown as Array<
      Omit<CampaignLaunchEvent, "actor_email"> & { actor_id: string | null }
    >;
    const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
    const emailById = new Map<string, string>();
    if (actorIds.length) {
      const { data: people } = await context.supabase
        .from("profiles")
        .select("id, email")
        .in("id", actorIds);
      for (const p of (people ?? []) as Array<{ id: string; email: string | null }>) {
        if (p.email) emailById.set(p.id, p.email);
      }
    }

    return events.map(({ actor_id, ...rest }) => ({
      ...rest,
      issues: Array.isArray(rest.issues) ? rest.issues : [],
      actor_email: actor_id ? emailById.get(actor_id) ?? null : null,
    })) as CampaignLaunchEvent[];
  });

