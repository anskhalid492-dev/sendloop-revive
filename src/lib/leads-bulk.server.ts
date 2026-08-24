/**
 * Server-only lead id resolution for paginated reads and bulk operations.
 *
 * PostgREST caps unbounded selects, so every "all matching" resolution pages
 * explicitly instead of trusting a single request to return the full set.
 */
import { applyLeadFilters, type LeadFilterInput, type LeadSelection } from "@/lib/leads-query";

const PAGE = 1000;

/** Hard ceiling for a single bulk operation, keeps one request bounded. */
export const MAX_BULK_LEADS = 50_000;

type AnyClient = {
  from: (table: string) => any;
};

/** All lead ids that are recipients of a campaign (paged, never truncated). */
export async function resolveCampaignLeadIds(
  supabase: AnyClient,
  campaignId: string,
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("lead_id")
      .eq("campaign_id", campaignId)
      .order("lead_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ lead_id: string }>;
    for (const row of rows) ids.push(row.lead_id);
    if (rows.length < PAGE) break;
    if (ids.length >= MAX_BULK_LEADS) break;
  }
  return Array.from(new Set(ids));
}

/**
 * Turns a client selection into a concrete, RLS-verified id list.
 *
 * Ids sent by the browser are never trusted: they are re-read through the
 * caller's own client with the current filters applied, so anything outside the
 * caller's workspaces simply drops out.
 */
export async function resolveSelectionIds(
  supabase: AnyClient,
  filters: LeadFilterInput,
  selection: LeadSelection,
): Promise<string[]> {
  let restrictIds: string[] | null = null;
  if (filters.campaignId) {
    restrictIds = await resolveCampaignLeadIds(supabase, filters.campaignId);
    if (restrictIds.length === 0) return [];
  }

  if (selection.mode === "ids") {
    if (selection.ids.length === 0) return [];
    const verified: string[] = [];
    for (let i = 0; i < selection.ids.length; i += 300) {
      const chunk = selection.ids.slice(i, i + 300);
      let query = supabase.from("leads").select("id").in("id", chunk);
      query = applyLeadFilters(query, { ...filters, campaignId: undefined }, restrictIds);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as Array<{ id: string }>) verified.push(row.id);
    }
    return Array.from(new Set(verified));
  }

  const excluded = new Set(selection.excluded);
  const ids: string[] = [];
  for (let from = 0; from < MAX_BULK_LEADS; from += PAGE) {
    let query = supabase
      .from("leads")
      .select("id")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    query = applyLeadFilters(query, { ...filters, campaignId: undefined }, restrictIds);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string }>;
    for (const row of rows) if (!excluded.has(row.id)) ids.push(row.id);
    if (rows.length < PAGE) break;
  }
  return Array.from(new Set(ids));
}
