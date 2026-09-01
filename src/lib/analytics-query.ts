/**
 * ONE DATABASE STATE -> ONE AUTHORITATIVE QUERY -> SAME CURRENT RESULT EVERYWHERE.
 *
 * Every analytics/statistics surface (workspace Analytics, the dashboard
 * command center, campaign analytics, campaign performance, admin users and
 * email accounts) shares:
 *   - the query key factory below, so no two components can cache the same
 *     metric under different keys, and
 *   - `liveQueryOptions()`, which disables stale caching and adds a controlled
 *     polling fallback for whatever realtime does not cover.
 */

export const ANALYTICS_ROOT = "analytics" as const;

/** Canonical query keys. Never build an analytics key inline. */
export const analyticsKeys = {
  root: [ANALYTICS_ROOT] as const,
  overview: (workspaceId: string | null, from: string, to: string) =>
    [ANALYTICS_ROOT, "overview", workspaceId, from, to] as const,
  series: (workspaceId: string | null, from: string, to: string, bucket: string) =>
    [ANALYTICS_ROOT, "series", workspaceId, from, to, bucket] as const,
  campaigns: (workspaceId: string | null, from: string, to: string) =>
    [ANALYTICS_ROOT, "campaigns", workspaceId, from, to] as const,
  accounts: (workspaceId: string | null, from: string, to: string) =>
    [ANALYTICS_ROOT, "accounts", workspaceId, from, to] as const,
  commandCenter: (workspaceId: string | null, days: number) =>
    [ANALYTICS_ROOT, "command-center", workspaceId, days] as const,
  campaignStats: (campaignId: string) => [ANALYTICS_ROOT, "campaign", campaignId] as const,
  admin: (section: string, ...rest: unknown[]) =>
    [ANALYTICS_ROOT, "admin", section, ...rest] as const,
};

/** Fallback poll interval used when realtime cannot cover a table. */
export const ANALYTICS_POLL_MS = 20_000;

/**
 * Live-read options: nothing is ever served as "fresh from cache". Cached data
 * is only a paint-placeholder while the authoritative refetch is in flight.
 */
export function liveQueryOptions(pollMs: number | false = ANALYTICS_POLL_MS) {
  return {
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: "always" as const,
    refetchOnReconnect: "always" as const,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
    placeholderData: <T,>(prev: T) => prev,
  };
}
