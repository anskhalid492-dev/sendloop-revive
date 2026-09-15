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
