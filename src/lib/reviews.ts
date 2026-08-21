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

/**
 * Guards the public site against unfinished seed rows: anything that still
 * reads like a placeholder ("replace in admin", "Example Co", "Jane Doe") is
 * never rendered as customer proof.
 */
const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /replace in admin/i,
  /\bexample (co|labs|agency|inc|company)\b/i,
  /\bdummy\b/i,
  /\blorem ipsum\b/i,
  /\b(john|jane) doe\b/i,
  /\bacme (inc|co|corp)\b/i,
  /\byour name here\b/i,
  /\btest (user|customer)\b/i,
];

export function isRealTestimonial(t: {
  name: string;
  role?: string | null;
  company?: string | null;
  testimonial: string;
  result?: string | null;
}): boolean {
  const haystack = [t.name, t.role ?? "", t.company ?? "", t.testimonial, t.result ?? ""].join(" ");
  return !PLACEHOLDER_PATTERNS.some((re) => re.test(haystack));
}
