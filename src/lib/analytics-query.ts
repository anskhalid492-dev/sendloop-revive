import { keepPreviousData } from "@tanstack/react-query";

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
  overview: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "overview", workspaceId, from, to, ...filters] as const,
  series: (
    workspaceId: string | null,
    from: string,
    to: string,
    bucket: string,
    ...filters: unknown[]
  ) => [ANALYTICS_ROOT, "series", workspaceId, from, to, bucket, ...filters] as const,
  campaigns: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "campaigns", workspaceId, from, to, ...filters] as const,
  accounts: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "accounts", workspaceId, from, to, ...filters] as const,
  sequence: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "sequence", workspaceId, from, to, ...filters] as const,
  subjectLines: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "subject-lines", workspaceId, from, to, ...filters] as const,
  replies: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "replies", workspaceId, from, to, ...filters] as const,
  deliverability: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "deliverability", workspaceId, from, to, ...filters] as const,
  activity: (workspaceId: string | null, from: string, to: string, ...filters: unknown[]) =>
    [ANALYTICS_ROOT, "activity", workspaceId, from, to, ...filters] as const,
  filterOptions: (workspaceId: string | null) =>
    [ANALYTICS_ROOT, "filter-options", workspaceId] as const,
  commandCenter: (workspaceId: string | null, days: number) =>
    [ANALYTICS_ROOT, "command-center", workspaceId, days] as const,
  campaignStats: (campaignId: string) => [ANALYTICS_ROOT, "campaign", campaignId] as const,
  admin: (section: string, ...rest: unknown[]) =>
    [ANALYTICS_ROOT, "admin", section, ...rest] as const,
};

/** Fallback poll interval used when realtime cannot cover a table. */
export const ANALYTICS_POLL_MS = 60_000;

/**
 * Live-read options: nothing is ever served as "fresh from cache". Cached data
 * is only a paint-placeholder while the authoritative refetch is in flight.
 */
export function liveQueryOptions(pollMs: number | false = ANALYTICS_POLL_MS) {
  return {
    // Short freshness window instead of 0: realtime already pushes the fast
    // path, so a burst of remounts must not trigger a burst of full reads.
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnMount: true as const,
    refetchOnWindowFocus: true as const,
    refetchOnReconnect: "always" as const,
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  };
}
