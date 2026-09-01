/**
 * Community configuration.
 *
 * One source of truth for the external community destination (Facebook group,
 * Slack, Circle — whatever MunchReach runs at the time). Nothing in the app may
 * hardcode that URL: every CTA reads it from here, so switching platforms is an
 * admin edit rather than a deploy.
 *
 * The Resources navigation entry deliberately points at the internal landing
 * page instead, so MunchReach keeps control of where visitors land.
 */

export type CommunityConfig = {
  /** Master switch for the nav + footer entries. */
  enabled: boolean;
  /** Label used in the Resources menu and the footer Resources column. */
  nav_label: string;
  /** Internal landing page the nav/footer link to. */
  landing_path: string;
  /** External community destination used by the page CTAs only. */
  external_url: string;
  /** Wording of the primary join button. */
  cta_label: string;
  /** Footer entry label (falls back to the nav label when blank). */
  footer_label: string;
  /** Open the external community in a new tab. */
  open_in_new_tab: boolean;
  /** Show the entry in the Resources menu. */
  show_in_nav: boolean;
  /** Show the entry in the footer Resources column. */
  show_in_footer: boolean;
  /** Open the internal nav entry in a new tab (off by default). */
  nav_new_tab: boolean;
  /** Position within the Resources group (lower sorts first). */
  nav_position: number;
};

export const DEFAULT_COMMUNITY: CommunityConfig = {
  enabled: true,
  nav_label: "Community",
  landing_path: "/community",
  external_url: "https://www.facebook.com/groups/1584625706483374",
  cta_label: "Join the MunchReach Community",
  footer_label: "Community",
  open_in_new_tab: true,
  show_in_nav: true,
  show_in_footer: true,
  nav_new_tab: false,
  nav_position: 100,
};

/**
 * Returns the URL only when it is a real http(s) destination.
 *
 * Anything else — `javascript:`, `data:`, a bare word, an empty field — yields
 * `null` so callers render the "coming soon" state instead of a live link that
 * could execute script.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

/** Normalizes an internal landing path, defaulting back to `/community`. */
export function communityPath(config: Pick<CommunityConfig, "landing_path">): string {
  const value = (config.landing_path || "").trim();
  if (!value.startsWith("/")) return DEFAULT_COMMUNITY.landing_path;
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

export function mergeCommunityConfig(raw: unknown): CommunityConfig {
  const value = (raw ?? {}) as Partial<CommunityConfig>;
  return { ...DEFAULT_COMMUNITY, ...value };
}
