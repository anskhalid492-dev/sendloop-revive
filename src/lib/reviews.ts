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
