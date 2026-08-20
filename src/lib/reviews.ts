/**
 * Shared, browser-safe review vocabulary.
 *
 * Kept out of the server-function module so the constant survives the
 * server-function build transform and can be imported by page components.
 */
export type ReviewCategory = "agency" | "saas" | "sales" | "recruiting" | "consulting" | "other";

export const REVIEW_CATEGORIES: { id: ReviewCategory; label: string }[] = [
  { id: "agency", label: "Agencies" },
  { id: "saas", label: "SaaS" },
  { id: "sales", label: "Sales Teams" },
  { id: "recruiting", label: "Recruiting" },
  { id: "consulting", label: "Consulting" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id: string): string {
  return REVIEW_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

/** Compact, locale-aware count for social-proof figures. */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * Deterministic illustrative avatar for a reviewer without an uploaded photo.
 *
 * Seeded by the review id + name so every person gets a distinct portrait and
 * the same person always keeps theirs. These are generated illustrations, not
 * photos of real customers.
 */
export function placeholderAvatar(seed: string): string {
  const palette = ["c0e8ff", "dbeafe", "e0f2fe", "ede9fe", "fce7f3", "dcfce7", "fef3c7"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const bg = palette[hash % palette.length];
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}&radius=50`;
}
