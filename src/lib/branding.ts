/**
 * Single source of truth for platform branding.
 *
 * Names and default artwork live here; the live values come from
 * Admin → System settings → Branding (`platform_settings.system.branding`)
 * and are read through the platform-config store. Components must never
 * hard-code a logo or the product name.
 */
import { brandingValue } from "@/lib/platform-config-store";
import logoDefault from "@/assets/munchreach-logo.png";
import iconDefault from "@/assets/munchreach-icon.png";

export const BRAND_NAME = "MunchReach";
export const BRAND_TAGLINE = "Cold outreach that lands in the inbox";

export const DEFAULT_LOGO = logoDefault as string;
export const DEFAULT_ICON = iconDefault as string;
export const DEFAULT_FAVICON = "/favicon.png";

function clean(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  // Blob/object URLs are session-scoped and must never be treated as saved
  // branding — they 404 on the next page load.
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return "";
  return trimmed;
}

/** Light-mode logo (admin upload wins, bundled MunchReach mark otherwise). */
export function brandLogo(): string {
  return clean(brandingValue("logo_url")) || DEFAULT_LOGO;
}

/** Dark-mode logo; falls back to the light logo when no variant is uploaded. */
export function brandLogoDark(): string {
  return clean(brandingValue("logo_dark_url")) || brandLogo();
}

/** Logo used on the auth screens; falls back to the main logo. */
export function brandLoginLogo(): string {
  return clean(brandingValue("login_logo_url")) || brandLogo();
}

export function brandFavicon(): string {
  return clean(brandingValue("favicon_url")) || DEFAULT_FAVICON;
}

/**
 * Favicon shown by browsers in dark mode. Uses a dedicated dark upload when one
 * exists, then the dark logo, and only then the light favicon — so the tab icon
 * follows the same light/dark rules as the in-app logo.
 */
export function brandFaviconDark(): string {
  return (
    clean(brandingValue("favicon_dark_url")) ||
    clean(brandingValue("logo_dark_url")) ||
    brandFavicon()
  );
}
