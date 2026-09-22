/**
 * Shared vocabulary for customer bug reports.
 *
 * Kept client-safe so the customer form, the admin queue and the server
 * functions all validate against exactly the same list of statuses.
 */

export const BUG_STATUSES = ["new", "in_progress", "resolved", "closed"] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const BUG_STATUS_STYLE: Record<BugStatus, string> = {
  new: "border-primary/30 bg-primary/10 text-primary",
  in_progress: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  closed: "border-border bg-muted text-muted-foreground",
};

export function bugStatusOf(value: string | null | undefined): BugStatus {
  return (BUG_STATUSES as readonly string[]).includes(value ?? "") ? (value as BugStatus) : "new";
}

/** Screenshots are small by design — a full-page capture fits well under this. */
export const MAX_BUG_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export const BUG_SCREENSHOT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export const BUG_SCREENSHOT_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";

export const BUG_DETAILS_MAX = 8000;

/** Human-readable reason, or null when the file is acceptable. */
export function bugScreenshotError(file: { size: number; type: string; name: string }): string | null {
  if (file.size > MAX_BUG_SCREENSHOT_BYTES) return "Screenshots must be 5 MB or smaller.";
  const type = (file.type || "").toLowerCase();
  if (type && (BUG_SCREENSHOT_MIME_TYPES as readonly string[]).includes(type)) return null;
  // Some browsers report an empty type; fall back to the file extension.
  if (!type && /\.(png|jpe?g|webp)$/i.test(file.name)) return null;
  return "Please upload a PNG, JPG or WEBP image.";
}
