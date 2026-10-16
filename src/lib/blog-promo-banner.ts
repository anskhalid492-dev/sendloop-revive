/**
 * Centrally managed promotional banner shown in the single-blog-post sidebar.
 * Client-safe: defaults, normalization and validation only. The configuration
 * lives in `site_settings` under the key `blog_promo_banner` so admins can edit
 * it without code changes and every published post renders the same banner.
 */

export const BLOG_PROMO_BANNER_KEY = "blog_promo_banner";

export type BlogPromoBannerConfig = {
  enabled: boolean;
  heading: string;
  description: string;
  ctaLabel: string;
  /** Internal path ("/pricing") or full http(s) URL. */
  ctaUrl: string;
  /** Optional brand icon / image URL. Empty = MunchReach favicon. */
  iconUrl: string;
  backgroundColor: string;
  textColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  borderColor: string;
  /** Corner radius in px. */
  borderRadius: number;
  /** Position within the sidebar stack; lower = higher. */
  position: number;
  showOnDesktop: boolean;
  showOnMobile: boolean;
};

export const DEFAULT_BLOG_PROMO_BANNER: BlogPromoBannerConfig = {
  enabled: true,
  heading: "Never Let a Promising Lead Slip Through the Cracks",
  description: "Automate personalized follow-ups, reach prospects with the right offering.",
  ctaLabel: "Try MunchReach for 7 Days →",
  ctaUrl: "/pricing",
  iconUrl: "",
  backgroundColor: "#0F172A",
  textColor: "#F8FAFC",
  buttonBackgroundColor: "#3B82F6",
  buttonTextColor: "#FFFFFF",
  borderColor: "#1E293B",
  borderRadius: 16,
  position: 0,
  showOnDesktop: true,
  showOnMobile: true,
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanColor(value: unknown, fallback: string): string {
  const v = cleanText(value, 20);
  return HEX_COLOR.test(v) ? v : fallback;
}

function cleanUrl(value: unknown, fallback: string): string {
  const v = cleanText(value, 600);
  if (!v) return fallback;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  if (/^https:\/\/[^\s]+$/i.test(v)) return v;
  return fallback;
}

/** Merges a stored partial config over the brand defaults and validates it. */
export function normalizeBlogPromoBanner(raw: unknown): BlogPromoBannerConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_BLOG_PROMO_BANNER;
  const radius = Number(r["borderRadius"]);
  const position = Number(r["position"]);
  return {
    enabled: typeof r["enabled"] === "boolean" ? r["enabled"] : d.enabled,
    heading: cleanText(r["heading"], 120) || d.heading,
    description: cleanText(r["description"], 240) || d.description,
    ctaLabel: cleanText(r["ctaLabel"], 80) || d.ctaLabel,
    ctaUrl: cleanUrl(r["ctaUrl"], d.ctaUrl),
    iconUrl: cleanText(r["iconUrl"], 600),
    backgroundColor: cleanColor(r["backgroundColor"], d.backgroundColor),
    textColor: cleanColor(r["textColor"], d.textColor),
    buttonBackgroundColor: cleanColor(r["buttonBackgroundColor"], d.buttonBackgroundColor),
    buttonTextColor: cleanColor(r["buttonTextColor"], d.buttonTextColor),
    borderColor: cleanColor(r["borderColor"], d.borderColor),
    borderRadius: Number.isFinite(radius) ? Math.min(32, Math.max(0, Math.round(radius))) : d.borderRadius,
    position: Number.isFinite(position) ? Math.min(99, Math.max(0, Math.round(position))) : d.position,
    showOnDesktop: typeof r["showOnDesktop"] === "boolean" ? r["showOnDesktop"] : d.showOnDesktop,
    showOnMobile: typeof r["showOnMobile"] === "boolean" ? r["showOnMobile"] : d.showOnMobile,
  };
}

/** A banner only renders when it is enabled and has the minimum content. */
export function blogPromoBannerRenderable(config: BlogPromoBannerConfig): boolean {
  return Boolean(config.enabled && config.heading && config.ctaLabel && config.ctaUrl);
}
