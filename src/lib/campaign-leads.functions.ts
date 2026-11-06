import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GOOGLE_EMAIL_DOMAINS,
  OUTLOOK_EMAIL_DOMAINS,
  type MailboxType,
} from "@/lib/mailbox-type";

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
  /** Current message outcome (shared rules); engagement is reported separately. */
  outcome: string;
  engagement: { opened: boolean; replied: boolean; unsubscribed: boolean };
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

/**
 * Bounces and unsubscribes are recorded per PERSON, and usually land on the
 * stopped follow-up rather than on the recipient row's own status, so filtering
 * `campaign_recipients.status` alone finds nothing. Resolve the affected
 * recipient ids from the message outcomes (real signal or cancellation reason),
 * exactly like the campaign status tiles and analytics do.
 */
const OUTCOME_STATUSES = ["bounced", "unsubscribed"] as const;
type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

async function outcomeRecipientIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  campaignId: string,
  kind: OutcomeStatus,
): Promise<string[]> {
  const { fetchAllRows, fetchByIds } = await import("@/lib/supabase-batch");
  const filter =
    kind === "bounced"
      ? "bounced_at.not.is.null,cancelled_reason.eq.recipient_bounced"
      : "unsubscribed_at.not.is.null,cancelled_reason.eq.recipient_unsubscribed";
  const messages = await fetchAllRows<{ recipient_id: string | null; lead_id: string | null }>(
    () =>
      supabase
        .from("campaign_messages")
        .select("recipient_id, lead_id")
        .eq("campaign_id", campaignId)
        .or(filter)
        .order("id", { ascending: true }),
  );
  const ids = new Set<string>();
  const leadIds = new Set<string>();
  for (const message of messages) {
    if (message.recipient_id) ids.add(message.recipient_id);
    else if (message.lead_id) leadIds.add(message.lead_id);
  }
  if (leadIds.size) {
    const extra = await fetchByIds<{ id: string }>([...leadIds], (chunk) =>
      supabase
        .from("campaign_recipients")
        .select("id")
        .eq("campaign_id", campaignId)
        .in("lead_id", chunk),
    );
    for (const row of extra) ids.add(row.id);
  }
  return [...ids];
}

/** A filter value that can never match, so an empty outcome returns no rows. */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

const LEAD_EMBED =
  "leads!inner(id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields)";

/**
 * PostgREST filter string restricting the embedded lead to one email provider.
 * "other" is expressed as "none of the known domains" so the three buckets
 * always partition the population exactly like the summary counts do.
 */
function mailboxTypeFilter(type: MailboxType): string {
  const inList = (domains: readonly string[]) =>
    domains.map((domain) => `email.ilike.%@${domain}`).join(",");
  if (type === "google") return inList(GOOGLE_EMAIL_DOMAINS);
  if (type === "outlook") return inList(OUTLOOK_EMAIL_DOMAINS);
  const excluded = [...GOOGLE_EMAIL_DOMAINS, ...OUTLOOK_EMAIL_DOMAINS]
    .map((domain) => `email.not.ilike.%@${domain}`)
    .join(",");
  return `and(${excluded})`;
}

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
        mailboxType: z.enum(["google", "outlook", "other"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const startedAt = Date.now();
    const like = (value: string) => `%${value.replace(/[%,()]/g, " ").trim()}%`;
    const outcome = OUTCOME_STATUSES.includes(data.status as OutcomeStatus)
      ? (data.status as OutcomeStatus)
      : null;
    const outcomeIds = outcome
      ? await outcomeRecipientIds(context.supabase, data.campaignId, outcome)
      : null;
    const applyFilters = <T>(builder: T): T => {
      let query = builder as unknown as {
        eq: (column: string, value: unknown) => typeof query;
        in: (column: string, values: readonly unknown[]) => typeof query;
        ilike: (column: string, value: string) => typeof query;
        or: (filter: string, options?: { referencedTable: string }) => typeof query;
      };
      query = query.eq("campaign_id", data.campaignId);
      if (outcomeIds) {
        query = query.in("id", outcomeIds.length ? outcomeIds : [NO_MATCH_ID]);
      } else if (data.status) {
        query = query.eq("status", data.status);
      }
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
      if (data.mailboxType) {
        query = query.or(mailboxTypeFilter(data.mailboxType), { referencedTable: "leads" });
      }
      return query as unknown as T;
    };

    const from = (data.page - 1) * data.pageSize;
    const { needsLeadJoin, isUnfiltered, leadsForPage } = await import("@/lib/campaign-leads-page");
    const joinLeads = needsLeadJoin(data);
    const unfiltered = isUnfiltered(data, Boolean(outcome));
    const RECIPIENT_COLS =
      "id, status, current_step, next_send_at, last_sent_at, sending_account_id, created_at, lead_id";
    const [pageRes, totalRes] = await Promise.all([
      applyFilters(
        context.supabase
          .from("campaign_recipients")
          .select((joinLeads ? `${RECIPIENT_COLS}, ${LEAD_EMBED}` : RECIPIENT_COLS) as string, {
            count: "exact",
          })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      ).range(from, from + data.pageSize - 1),
      // The unfiltered total equals the page count; only count again when filtered.
      unfiltered
        ? Promise.resolve({ count: null as number | null })
        : context.supabase
            .from("campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", data.campaignId),
    ]);
    if (pageRes.error) throw new Error(pageRes.error.message);

    let recipients = (pageRes.data ?? []) as unknown as Array<
      Omit<CampaignLeadRow, "lead" | "deliveryState" | "lastEventAt"> & {
        leads: CampaignLeadFields | null;
      }
    >;
    if (!joinLeads && recipients.length) {
      const leadMap = await leadsForPage<CampaignLeadFields>(
        context.supabase,
        recipients.map((r) => r.lead_id),
      );
      // Same semantics as the inner join: rows without a lead are dropped.
      recipients = recipients
        .map((r) => ({ ...r, leads: leadMap.get(r.lead_id) ?? null }))
        .filter((r) => r.leads);
    }
    let live = new Map<string, { state: string; at: string | null }>();
    let outcomes = new Map<string, string>();
    const engagement = new Map<string, { opened: boolean; replied: boolean; unsubscribed: boolean }>();
    if (recipients.length) {
      const { fetchByIds } = await import("@/lib/supabase-batch");
      const { aggregateDeliveryStates } = await import("@/lib/campaign-delivery-state");
      const messages = await fetchByIds<Record<string, string | null>>(
        recipients.map((recipient) => recipient.id),
        (ids) =>
          context.supabase
            .from("campaign_messages")
            .select(
              "id, recipient_id, lead_id, status, delivery_status, cancelled_reason, updated_at, scheduled_at, sent_at, delivered_at, delayed_at, opened_at, clicked_at, replied_at, unsubscribed_at, complained_at, bounced_at, failed_at, last_event_at, last_error, attempts",
            )
            .eq("campaign_id", data.campaignId)
            .in("recipient_id", ids),
      );
      live = aggregateDeliveryStates(messages);
      const { leadOutcomeByKey } = await import("@/lib/message-outcomes");
      outcomes = leadOutcomeByKey(messages as never);
      for (const m of messages) {
        const key = String(m["recipient_id"] ?? "");
        if (!key) continue;
        const e = engagement.get(key) ?? { opened: false, replied: false, unsubscribed: false };
        if (m["opened_at"]) e.opened = true;
        if (m["replied_at"]) e.replied = true;
        if (m["unsubscribed_at"] || m["cancelled_reason"] === "recipient_unsubscribed") e.unsubscribed = true;
        engagement.set(key, e);
      }
    }

    const rows: CampaignLeadRow[] = recipients.map(({ leads, ...recipient }) => {
      const hit = live.get(recipient.id) ?? live.get(`lead:${recipient.lead_id}`) ?? null;
      return {
        ...recipient,
        lead: leads,
        deliveryState: hit?.state ?? "not_contacted",
        outcome: outcomes.get(recipient.id) ?? "not_contacted",
        engagement: engagement.get(recipient.id) ?? { opened: false, replied: false, unsubscribed: false },
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
  /** Lead counts by email provider for the currently filtered population. */
  counts: Record<MailboxType, number>;
  /** Total leads matching the current filters (counts always sum to this). */
  total: number;
};

/**
 * Aggregate-only read: counts recipients by the lead's email-address provider
 * with bounded head-count queries, so no campaign rows are loaded.
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
    const like = (value: string) => `%${value.replace(/[%,()]/g, " ").trim()}%`;
    const outcome = OUTCOME_STATUSES.includes(data.status as OutcomeStatus)
      ? (data.status as OutcomeStatus)
      : null;
    const outcomeIds = outcome
      ? await outcomeRecipientIds(context.supabase, data.campaignId, outcome)
      : null;
    // The lead embed is always joined: every count filters on lead email domains.
    const baseQuery = () => {
      let query = context.supabase
        .from("campaign_recipients")
        .select(`id, ${LEAD_EMBED}`, { count: "exact", head: true })
        .eq("campaign_id", data.campaignId) as never as {
        eq: (column: string, value: unknown) => typeof query;
        in: (column: string, values: readonly unknown[]) => typeof query;
        ilike: (column: string, value: string) => typeof query;
        or: (filter: string, options?: { referencedTable: string }) => typeof query;
      };
      if (outcomeIds) {
        query = query.in("id", outcomeIds.length ? outcomeIds : [NO_MATCH_ID]);
      } else if (data.status) {
        query = query.eq("status", data.status);
      }
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

    const runCount = async (query: unknown) => {
      const result = await (query as Promise<{
        count: number | null;
        error: { message: string } | null;
      }>);
      if (result.error) throw new Error(result.error.message);
      return result.count ?? 0;
    };

    // Case-insensitive domain match on the lead's real email address.
    const domainFilter = (domains: readonly string[]) =>
      domains.map((domain) => `email.ilike.%@${domain}`).join(",");

    const [total, google, outlook] = await Promise.all([
      runCount(baseQuery()),
      runCount(
        baseQuery().or(domainFilter(GOOGLE_EMAIL_DOMAINS), { referencedTable: "leads" }),
      ),
      runCount(
        baseQuery().or(domainFilter(OUTLOOK_EMAIL_DOMAINS), { referencedTable: "leads" }),
      ),
    ]);

    // Other is the remainder, so the three counts always sum to the total.
    const other = Math.max(0, total - google - outlook);
    return { counts: { google, outlook, other }, total } satisfies CampaignMailboxSummary;
  });
