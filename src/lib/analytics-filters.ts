/** Shared filter shape for every Analytics page section. */
export type AnalyticsFilters = {
  workspaceId: string | null;
  from: string;
  to: string;
  campaignId: string | null;
  accountId: string | null;
};

/** Server-function payload for a filtered range read. */
export function filterPayload(filters: AnalyticsFilters) {
  return {
    workspaceId: filters.workspaceId ?? "",
    from: filters.from,
    to: filters.to,
    campaignId: filters.campaignId,
    accountId: filters.accountId,
  };
}

/** Keep the same half-open reporting scope on every funnel source query. */
export function scopeAnalyticsQuery<T extends {
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lt: (column: string, value: string) => T;
}>(query: T, filters: { workspaceId: string; campaignId?: string | null | undefined; accountId?: string | null | undefined; from: string; to: string }, dateColumn: string): T {
  let scoped = query.eq("workspace_id", filters.workspaceId).gte(dateColumn, filters.from).lt(dateColumn, filters.to);
  if (filters.campaignId) scoped = scoped.eq("campaign_id", filters.campaignId);
  if (filters.accountId) scoped = scoped.eq("sending_account_id", filters.accountId);
  return scoped;
}
