/**
 * Canonical site URL helpers.
 *
 * Crawlers need absolute URLs in `canonical` and `og:url`; relative values
 * make it impossible to attribute a page correctly when the HTML is fetched
 * from a preview host. Everything the site emits is normalised through here.
 */
export const SITE_URL = "https://munchreach.com";

/** Turns "/pricing" (or an already-absolute URL) into an absolute site URL. */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  const trimmed = clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
  return `${SITE_URL}${trimmed === "/" ? "/" : trimmed}`;
}

/** BreadcrumbList JSON-LD with absolute item URLs. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: absoluteUrl(item.path),
      })),
    }),
  };
}

/** Applied to utility pages that must never be indexed but may pass link equity. */
export const NOINDEX_META = { name: "robots", content: "noindex, follow" };
