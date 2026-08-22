/** Client-safe labels shared by the public trust pages and their admin managers. */

export const ALERT_TYPES = ["information", "maintenance", "warning", "incident"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TYPE_LABEL: Record<string, string> = {
  information: "Information",
  maintenance: "Maintenance",
  warning: "Warning",
  incident: "Incident",
};

export const ALERT_TYPE_STYLE: Record<string, string> = {
  information: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  maintenance: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  incident: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const SUBPROCESSOR_STATUSES = ["active", "planned", "retired"] as const;

export const SUBPROCESSOR_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  planned: "Planned",
  retired: "Retired",
};

export const GUIDE_CATEGORIES = [
  "Getting Started",
  "Sending & Deliverability",
  "Account & Billing",
] as const;

export const PRIVACY_REQUEST_TYPES = [
  { value: "delete_personal_data", label: "Delete my personal data" },
  { value: "delete_account", label: "Delete my account" },
  { value: "remove_contact_data", label: "Remove contact data from a customer's list" },
  { value: "marketing_suppression", label: "Marketing suppression (stop emails)" },
  { value: "data_access", label: "Access a copy of my data" },
  { value: "data_correction", label: "Correct my data" },
] as const;

export const PRIVACY_REQUEST_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PRIVACY_REQUEST_TYPES.map((t) => [t.value, t.label]),
);

export const PRIVACY_REQUEST_STATUSES = ["new", "in_review", "completed", "rejected"] as const;

export const PRIVACY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_review: "In review",
  completed: "Completed",
  rejected: "Rejected",
};
