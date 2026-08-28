/**
 * Client-safe cache of the database SEO overrides.
 *
 * The root route loads the site content bundle once and pushes it here, so
 * every route's `head()` can apply an admin-managed title, description,
 * canonical, OG tag or JSON-LD without an extra request per navigation.
 */
import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { SiteContentBundle, PageSeoEntry } from "@/lib/site-content.server";

type Bundle = Pick<
  SiteContentBundle,
  "seo" | "globalSeo" | "header" | "footer" | "social" | "footerConfig" | "community"
>;

let bundle: Bundle | null = null;
const listeners = new Set<() => void>();

export function setSiteContent(next: Bundle) {
  bundle = next;
  for (const listener of listeners) listener();
}

export function getSiteContent(): Bundle | null {
  return bundle;
}

export function subscribeSiteContent(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPageSeo(path: string): PageSeoEntry | null {
  if (!bundle) return null;
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : "/";
  return bundle.seo[clean] ?? null;
}

/** Admin-managed site title, default OG data, verification codes and scripts. */
export function getGlobalSeo() {
  return bundle?.globalSeo ?? null;
}

type MetaEntry = Record<string, string>;

/**
 * Applies stored overrides on top of the metadata a route declares in code.
 * Code stays the fallback, so a page never loses its metadata if the admin
 * record is empty.
 */
export function applySeoOverrides(
  path: string,
  head: { meta: MetaEntry[]; links?: MetaEntry[]; scripts?: any[] },
): { meta: MetaEntry[]; links?: MetaEntry[]; scripts?: any[] } {
  const override = getPageSeo(path);
  if (!override) return head;

  const meta = head.meta.map((entry) => ({ ...entry }));
  const set = (match: (e: MetaEntry) => boolean, next: MetaEntry) => {
    const index = meta.findIndex(match);
    if (index >= 0) meta[index] = { ...meta[index], ...next };
    else meta.push(next);
  };

  if (override.title) {
    set((e) => "title" in e, { title: override.title });
    set((e) => e["property"] === "og:title", {
      property: "og:title",
      content: override.ogTitle || override.title,
    });
  }
  if (override.ogTitle) set((e) => e["property"] === "og:title", { property: "og:title", content: override.ogTitle });
  if (override.description) {
    set((e) => e["name"] === "description", { name: "description", content: override.description });
    set((e) => e["property"] === "og:description", {
      property: "og:description",
      content: override.ogDescription || override.description,
    });
  }
  if (override.ogDescription) {
    set((e) => e["property"] === "og:description", {
      property: "og:description",
      content: override.ogDescription,
    });
  }
  if (override.ogImage) {
    set((e) => e["property"] === "og:image", { property: "og:image", content: override.ogImage });
    set((e) => e["name"] === "twitter:image", { name: "twitter:image", content: override.ogImage });
  }
  if (override.robots) set((e) => e["name"] === "robots", { name: "robots", content: override.robots });

  const links = override.canonical
    ? [
        ...(head.links ?? []).filter((l) => l["rel"] !== "canonical"),
        { rel: "canonical", href: override.canonical },
      ]
    : head.links;

  const scripts = override.structuredData
    ? [
        ...(head.scripts ?? []),
        { type: "application/ld+json", children: override.structuredData },
      ]
    : head.scripts;

  return { meta, ...(links ? { links } : {}), ...(scripts ? { scripts } : {}) };
}

/** Live navigation / footer content for the public site chrome. */
export function useSiteContent(): Bundle | null {
  const store = useSyncExternalStore(subscribeSiteContent, getSiteContent, getSiteContent);
  // On the client the root `beforeLoad` does not re-run for the hydrating
  // match, so the module store is empty while the server rendered with data.
  // Reading the dehydrated query cache keeps both renders identical.
  const cached = useQueryClient().getQueryData<Bundle>(["site-content"]) ?? null;
  return store ?? cached;
}
