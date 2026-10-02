/**
 * Shared helpers that keep the campaign Leads page cheap.
 *
 * The page used to join every recipient to its lead (`leads!inner`) and sort
 * the joined set on every 30s refresh, even with no lead-level filter, plus a
 * second exact count of the same audience. When no lead column is filtered we
 * page `campaign_recipients` alone (index-only) and load just that page's leads
 * by id; the unfiltered total reuses the page count instead of a second query.
 */
export type LeadPageFilters = {
  search?: string | undefined;
  company?: string | undefined;
  jobTitle?: string | undefined;
  location?: string | undefined;
  mailboxType?: string | undefined;
  status?: string | undefined;
  step?: number | undefined;
  accountId?: string | undefined;
};

export const LEAD_FIELDS =
  "id, email, first_name, last_name, company, job_title, country, city, state, website, phone, linkedin_url, custom_fields";

/** True when the query must filter on embedded lead columns. */
export function needsLeadJoin(f: LeadPageFilters): boolean {
  return Boolean(f.search || f.company || f.jobTitle || f.location || f.mailboxType);
}

/** True when the filtered population equals the whole audience. */
export function isUnfiltered(f: LeadPageFilters, outcome: boolean): boolean {
  return !needsLeadJoin(f) && !f.status && f.step === undefined && !f.accountId && !outcome;
}

/** Loads the leads for one page of recipients, keyed by lead id. */
export async function leadsForPage<T extends { id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadIds: string[],
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  const unique = [...new Set(leadIds.filter(Boolean))];
  if (!unique.length) return map;
  const { data, error } = await supabase.from("leads").select(LEAD_FIELDS).in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as T[]) map.set(row.id, row);
  return map;
}
