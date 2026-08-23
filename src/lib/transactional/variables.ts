/**
 * Transactional template variables.
 *
 * Templates are data, never code: only the whitelisted keys below can be
 * interpolated, and rendering is a plain string substitution. There is no
 * expression evaluation, no helper calls and no server-side code execution.
 */

export const TEMPLATE_VARIABLES = [
  "user.first_name",
  "user.last_name",
  "user.email",
  "workspace.name",
  "workspace.logo",
  "plan.name",
  "plan.price",
  "billing.next_payment_date",
  "invoice.number",
  "invoice.total",
  "subscription.status",
  "credits.balance",
  "credits.amount",
  "campaign.name",
  "domain.name",
  "mailbox.email",
  "ticket.subject",
  "ticket.reference",
  "ticket.message",
  "announcement.title",
  "announcement.message",
  "security.event",
  "security.ip",
  "security.time",
  "reset_password_url",
  "login_url",
  "dashboard_url",
  "support_url",
  "action_url",
  "brand.name",
  "current_year",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

const ALLOWED = new Set<string>(TEMPLATE_VARIABLES);

/** Sample values used for previews and admin test sends. */
export const SAMPLE_VARIABLES: Record<string, string> = {
  "user.first_name": "John",
  "user.last_name": "Carter",
  "user.email": "john@example.com",
  "workspace.name": "MunchReach Demo Workspace",
  "workspace.logo": "",
  "plan.name": "Growth",
  "plan.price": "$79 / month",
  "billing.next_payment_date": "September 21, 2026",
  "invoice.number": "INV-2026-0042",
  "invoice.total": "$79.00",
  "subscription.status": "Active",
  "credits.balance": "1,250",
  "credits.amount": "500",
  "campaign.name": "Q3 Agency Outbound",
  "domain.name": "demo-workspace.com",
  "mailbox.email": "john@demo-workspace.com",
  "ticket.subject": "Domain verification stuck",
  "ticket.reference": "TICKET-1042",
  "ticket.message": "Thanks for reaching out — our team is reviewing your domain now.",
  "announcement.title": "Scheduled maintenance",
  "announcement.message": "We will perform maintenance on Sunday between 02:00 and 03:00 UTC.",
  "security.event": "New sign-in from Chrome on macOS",
  "security.ip": "203.0.113.24",
  "security.time": "August 21, 2026 at 12:04 UTC",
  "reset_password_url": "https://app.munchreach.com/reset-password?token=sample",
  "login_url": "https://app.munchreach.com/auth",
  "dashboard_url": "https://app.munchreach.com/dashboard",
  "support_url": "https://app.munchreach.com/help",
  "action_url": "https://app.munchreach.com/dashboard",
  "brand.name": "MunchReach",
  // Resolved at render time; the value here is only a preview placeholder.
  "current_year": String(new Date().getFullYear()),
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Every `{{token}}` found in the given strings. */
export function extractVariables(...parts: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const match of part.matchAll(TOKEN_RE)) {
      const key = match[1];
      if (key) found.add(key);
    }
  }
  return [...found];
}

/** Tokens that are not on the whitelist. Publishing is blocked when non-empty. */
export function invalidVariables(...parts: (string | null | undefined)[]): string[] {
  return extractVariables(...parts).filter((key) => !ALLOWED.has(key));
}

export function isAllowedVariable(key: string): boolean {
  return ALLOWED.has(key);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Substitutes whitelisted tokens. Unknown tokens are dropped (never echoed
 * back), and every value is HTML-escaped for html mode.
 */
export function renderTemplateString(
  template: string,
  values: Record<string, unknown>,
  mode: "html" | "text" = "html",
): string {
  return template.replace(TOKEN_RE, (_full, rawKey: string) => {
    if (!ALLOWED.has(rawKey)) return "";
    const value = values[rawKey];
    const str = value === null || value === undefined ? "" : String(value);
    return mode === "html" ? escapeHtml(str) : str;
  });
}
