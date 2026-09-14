import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mailboxTypeOf, type MailboxType } from "@/lib/mailbox-type";

export type CampaignLeadFields = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  job_title: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
  linkedin_url: string | null;
  custom_fields: Record<string, string> | null;
};

export type CampaignLeadRow = {
  id: string;
  status: string;
  current_step: number | null;
  next_send_at: string | null;
  last_sent_at: string | null;
  sending_account_id: string | null;
  created_at: string;
  lead_id: string;
  lead: CampaignLeadFields | null;
  deliveryState: string;
  lastEventAt: string | null;
};

const RECIPIENT_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
  "failed",
  "stopped",
] as const;

const LEAD_EMBED =
  "leads!inner(id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields)";

/** A bounded lead-page read kept separate from campaign mutations and launch code. */
export const getCampaignLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        search: z.string().trim().max(120).optional(),
        company: z.string().trim().max(120).optional(),
        jobTitle: z.string().trim().max(120).optional(),
        location: z.string().trim().max(120).optional(),
        status: z.enum(RECIPIENT_STATUSES).optional(),
        step: z.number().int().min(0).max(20).optional(),
        accountId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const like = (value: string) => `%${value.replace(/[%,()]/g, " ").trim()}%`;
    const applyFilters = <T>(builder: T): T => {
      let query = builder as unknown as {
        eq: (column: string, value: unknown) => typeof query;
        ilike: (column: string, value: string) => typeof query;
        or: (filter: string, options?: { referencedTable: string }) => typeof query;
      };
      query = query.eq("campaign_id", data.campaignId);
      if (data.status) query = query.eq("status", data.status);
      if (data.step !== undefined) query = query.eq("current_step", data.step);
      if (data.accountId) query = query.eq("sending_account_id", data.accountId);
      if (data.company) query = query.ilike("leads.company", like(data.company));
      if (data.jobTitle) query = query.ilike("leads.job_title", like(data.jobTitle));
      if (data.location) {
        const term = like(data.location);
        query = query.or(`country.ilike.${term},city.ilike.${term},state.ilike.${term}`, {
          referencedTable: "leads",
        });
      }
      if (data.search) {
        const term = like(data.search);
        query = query.or(
          `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`,
          { referencedTable: "leads" },
        );
      }
      return query as unknown as T;
    };

    const from = (data.page - 1) * data.pageSize;
    const [pageRes, totalRes] = await Promise.all([
      applyFilters(
        context.supabase
          .from("campaign_recipients")
          .select(
            `id, status, current_step, next_send_at, last_sent_at, sending_account_id, created_at, lead_id, ${LEAD_EMBED}` as string,
            { count: "exact" },
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      ).range(from, from + data.pageSize - 1),
      context.supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId),
    ]);
    if (pageRes.error) throw new Error(pageRes.error.message);

    const recipients = (pageRes.data ?? []) as unknown as Array<
      Omit<CampaignLeadRow, "lead" | "deliveryState" | "lastEventAt"> & {
        leads: CampaignLeadFields | null;
      }
    >;
    let live = new Map<string, { state: string; at: string | null }>();
    if (recipients.length) {
      const { fetchByIds } = await import("@/lib/supabase-batch");
      const { aggregateDeliveryStates } = await import("@/lib/campaign-delivery-state");
      const messages = await fetchByIds<Record<string, string | null>>(
        recipients.map((recipient) => recipient.id),
        (ids) =>
          context.supabase
            .from("campaign_messages")
            .select(
              "recipient_id, lead_id, status, delivery_status, scheduled_at, sent_at, delivered_at, delayed_at, opened_at, clicked_at, replied_at, unsubscribed_at, complained_at, bounced_at, failed_at, last_event_at",
            )
            .eq("campaign_id", data.campaignId)
            .in("recipient_id", ids),
      );
      live = aggregateDeliveryStates(messages);
    }

    const rows: CampaignLeadRow[] = recipients.map(({ leads, ...recipient }) => {
      const hit = live.get(recipient.id) ?? live.get(`lead:${recipient.lead_id}`) ?? null;
      return {
        ...recipient,
        lead: leads,
        deliveryState: hit?.state ?? "not_contacted",
        lastEventAt: hit?.at ?? recipient.last_sent_at ?? null,
      };
    });
    console.info("[campaign.getCampaignLeads] complete", {
      campaignId: data.campaignId,
      page: data.page,
      rows: rows.length,
      totalMs: Date.now() - startedAt,
    });
    const matching = pageRes.count ?? rows.length;
    return {
      rows,
      matching,
      total: totalRes.count ?? matching,
      page: data.page,
      pageSize: data.pageSize,
    };
  });
export type CampaignMailboxSummary = {
  /** Mailbox type per sending account id, from the stored mailbox record. */
  accountTypes: Record<string, MailboxType>;
  /** Lead counts by mailbox type for the currently filtered population. */
  counts: Record<MailboxType, number>;
};

/**
 * Aggregate-only read: counts recipients per mailbox type with bounded
 * head-count queries (one per mailbox type), so no campaign rows are loaded.
 */
export const getCampaignMailboxSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        campaignId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        company: z.string().trim().max(120).optional(),
        jobTitle: z.string().trim().max(120).optional(),
        location: z.string().trim().max(120).optional(),
        status: z.enum(RECIPIENT_STATUSES).optional(),
        step: z.number().int().min(0).max(20).optional(),
        accountId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: campaign, error: campaignError } = await context.supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campaign not found");

    const { data: accountRows, error: accountsError } = await context.supabase
      .from("sending_accounts")
      .select("id, provider, connection_method")
      .eq("workspace_id", campaign.workspace_id);
    if (accountsError) throw new Error(accountsError.message);

    const accountTypes: Record<string, MailboxType> = {};
    const idsByType: Record<MailboxType, string[]> = { google: [], outlook: [], other: [] };
    for (const account of accountRows ?? []) {
      const type = mailboxTypeOf(account);
      accountTypes[account.id] = type;
      idsByType[type].push(account.id);
    }

    const textFilter = Boolean(data.search || data.company || data.jobTitle || data.location);
    const like = (value: string) => `%${value.replace(/[%,()]/g, " ").trim()}%`;
    const baseQuery = () => {
      let query = context.supabase
        .from("campaign_recipients")
        .select(textFilter ? `id, ${LEAD_EMBED}` : "id", { count: "exact", head: true })
        .eq("campaign_id", data.campaignId) as never as {
        eq: (column: string, value: unknown) => typeof query;
        ilike: (column: string, value: string) => typeof query;
        in: (column: string, values: string[]) => typeof query;
        is: (column: string, value: null) => typeof query;
        or: (filter: string, options?: { referencedTable: string }) => typeof query;
      };
      if (data.status) query = query.eq("status", data.status);
      if (data.step !== undefined) query = query.eq("current_step", data.step);
      if (data.accountId) query = query.eq("sending_account_id", data.accountId);
      if (data.company) query = query.ilike("leads.company", like(data.company));
      if (data.jobTitle) query = query.ilike("leads.job_title", like(data.jobTitle));
      if (data.location) {
        const term = like(data.location);
        query = query.or(`country.ilike.${term},city.ilike.${term},state.ilike.${term}`, {
          referencedTable: "leads",
        });
      }
      if (data.search) {
        const term = like(data.search);
        query = query.or(
          `email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term},company.ilike.${term}`,
          { referencedTable: "leads" },
        );
      }
      return query;
    };

    const countFor = async (type: MailboxType) => {
      const ids = idsByType[type];
      if (data.accountId && accountTypes[data.accountId] !== type) return 0;
      let query = baseQuery();
      if (type === "other") {
        // Unassigned mailboxes send through whatever is available: counted as Other.
        query = ids.length
          ? query.or(`sending_account_id.in.(${ids.join(",")}),sending_account_id.is.null`)
          : query.is("sending_account_id", null);
      } else {
        if (!ids.length) return 0;
        query = query.in("sending_account_id", ids);
      }
      const result = (await (query as unknown as Promise<{ count: number | null; error: { message: string } | null }>));
      if (result.error) throw new Error(result.error.message);
      return result.count ?? 0;
    };

    const [google, outlook, other] = await Promise.all([
      countFor("google"),
      countFor("outlook"),
      countFor("other"),
    ]);

    return { accountTypes, counts: { google, outlook, other } } satisfies CampaignMailboxSummary;
  });
