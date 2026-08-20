/**
 * Phase 9 — centralized system settings definition.
 *
 * This is the single source of truth for every platform-level setting: its
 * storage location, type, default, description and danger level. Both the
 * admin UI and the server validator are generated from it, so a setting can
 * never exist in the UI without a persisted, validated home.
 *
 * Storage reuses what already exists — no new settings table:
 *  - `public.platform_settings` (key/value JSON) for platform switches
 *  - the existing `site_settings.seo` row for global SEO (owned by the SEO
 *    Manager; surfaced here read/write rather than duplicated)
 *  - the existing `platform_settings.auth_providers` row for the Google switch
 */

export type FieldType = "text" | "textarea" | "number" | "boolean" | "select" | "url";

export type SettingField = {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  default: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Requires an explicit confirmation step before saving. */
  danger?: boolean;
  /** Rendered as read-only status; the real value lives in a secret store. */
  readOnly?: boolean;
  placeholder?: string;
};

export type SettingGroup = {
  id: string;
  label: string;
  description: string;
  /** Where the group's values are persisted. */
  store: { table: "platform_settings" | "site_settings"; key: string };
  fields: SettingField[];
  /** Note rendered above the form (e.g. pointing at the owning module). */
  note?: string;
};

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
].map((v) => ({ value: v, label: v }));

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "AED"].map((v) => ({
  value: v,
  label: v,
}));

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "general",
    label: "General",
    description: "Identity and platform-wide defaults.",
    store: { table: "platform_settings", key: "system.general" },
    fields: [
      {
        key: "site_name",
        label: "Site name",
        description: "Used in emails, page titles and the admin header.",
        type: "text",
        default: "Sendloop",
      },
      {
        key: "site_url",
        label: "Site URL",
        description: "Canonical origin used for links in emails, sitemap and webhooks.",
        type: "url",
        default: "",
        placeholder: "https://app.example.com",
      },
      {
        key: "default_timezone",
        label: "Default timezone",
        description: "Applied to new workspaces and to scheduled sending windows.",
        type: "select",
        default: "UTC",
        options: TIMEZONES,
      },
      {
        key: "default_currency",
        label: "Default currency",
        description: "Currency shown on plans, invoices and revenue reporting.",
        type: "select",
        default: "USD",
        options: CURRENCIES,
      },
      {
        key: "registration_enabled",
        label: "Registration enabled",
        description:
          "When off, new account creation is rejected by the database, not only hidden in the UI.",
        type: "boolean",
        default: true,
        danger: true,
      },
    ],
  },
  {
    id: "branding",
    label: "Branding",
    description: "Logo, favicon and default social image.",
    store: { table: "platform_settings", key: "system.branding" },
    fields: [
      { key: "logo_url", label: "Logo URL", description: "Shown in the app header and emails.", type: "url", default: "" },
      { key: "logo_dark_url", label: "Dark-mode logo URL", description: "Optional variant for dark backgrounds.", type: "url", default: "" },
      { key: "favicon_url", label: "Favicon URL", description: "Browser tab icon. Falls back to /favicon.ico.", type: "url", default: "" },
      { key: "social_image_url", label: "Default social image", description: "Fallback og:image for pages without their own.", type: "url", default: "" },
      { key: "brand_color", label: "Brand colour", description: "Accent colour used in transactional emails.", type: "text", default: "#4f46e5" },
    ],
  },
  {
    id: "dashboard",
    label: "Customer dashboard",
    description: "What customers see when they sign in.",
    store: { table: "platform_settings", key: "system.dashboard" },
    fields: [
      { key: "show_onboarding", label: "Show onboarding checklist", description: "New workspaces start with the guided setup checklist.", type: "boolean", default: true },
      { key: "default_landing", label: "Default landing page", description: "Where customers land after sign-in.", type: "select", default: "/dashboard", options: [
        { value: "/dashboard", label: "Dashboard" },
        { value: "/campaigns", label: "Campaigns" },
        { value: "/inbox", label: "Unified inbox" },
      ] },
      { key: "feature_crm", label: "CRM visible", description: "Hide the CRM module across all customer workspaces.", type: "boolean", default: true },
      { key: "feature_automations", label: "Automations visible", description: "Hide the Automations module across all workspaces.", type: "boolean", default: true },
      { key: "feature_warmup", label: "Warmup visible", description: "Hide the Warmup module across all workspaces.", type: "boolean", default: true },
      { key: "feature_integrations", label: "Integrations visible", description: "Hide the Integrations module across all workspaces.", type: "boolean", default: true },
      { key: "feature_referrals", label: "Referral program visible", description: "Hide the referral dashboard for customers.", type: "boolean", default: true },
    ],
  },
  {
    id: "email",
    label: "Email",
    description: "Platform sender identity and inbound handling.",
    note: "Provider credentials live in the secret store and are never shown here. Manage providers in Admin → Providers.",
    store: { table: "platform_settings", key: "system.email" },
    fields: [
      { key: "from_name", label: "Default sender name", description: "From-name on platform (non-campaign) email.", type: "text", default: "Sendloop" },
      { key: "from_email", label: "Default sender address", description: "From-address on platform email. Must be on a verified domain.", type: "text", default: "" },
      { key: "reply_to", label: "Reply-to address", description: "Where replies to platform email are delivered.", type: "text", default: "" },
      { key: "notify_signup", label: "Notify admins on signup", description: "Send an admin notification for every new account.", type: "boolean", default: false },
      { key: "notify_failed_sends", label: "Notify admins on send failures", description: "Raise an admin notification when a send fails permanently.", type: "boolean", default: true },
      { key: "inbound_enabled", label: "Inbound email enabled", description: "Accept inbound replies on the public inbound webhook.", type: "boolean", default: true, danger: true },
      { key: "inbound_domain", label: "Inbound domain", description: "Domain configured with the inbound provider for reply routing.", type: "text", default: "" },
      { key: "bounce_threshold", label: "Bounce pause threshold (%)", description: "Pause a sending account when its bounce rate exceeds this.", type: "number", default: 5, min: 1, max: 50 },
    ],
  },
  {
    id: "auth",
    label: "Authentication",
    description: "Sign-up, sign-in and session rules.",
    store: { table: "platform_settings", key: "system.auth" },
    fields: [
      { key: "email_password_enabled", label: "Email + password sign-in", description: "Allow customers to sign in with email and password.", type: "boolean", default: true, danger: true },
      { key: "google_enabled", label: "Google sign-in", description: "Stored with the existing auth provider switch and enforced server-side.", type: "boolean", default: true },
      { key: "require_email_verification", label: "Require email verification", description: "Customers must confirm their email before using the app.", type: "boolean", default: true },
      { key: "password_min_length", label: "Minimum password length", description: "Enforced on sign-up and password reset.", type: "number", default: 8, min: 6, max: 64 },
      { key: "password_require_number", label: "Require a number", description: "Passwords must contain at least one digit.", type: "boolean", default: true },
      { key: "password_require_symbol", label: "Require a symbol", description: "Passwords must contain at least one special character.", type: "boolean", default: false },
      { key: "session_timeout_hours", label: "Session timeout (hours)", description: "Idle sessions are signed out after this many hours.", type: "number", default: 720, min: 1, max: 8760 },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    description: "Global metadata, verification and indexing.",
    note: "These values are the same records the SEO Manager writes — editing here updates the live site immediately.",
    store: { table: "site_settings", key: "seo" },
    fields: [
      { key: "site_title", label: "Global site title", description: "Default <title> and og:title for pages without an override.", type: "text", default: "Sendloop — Cold Email Outreach Platform" },
      { key: "meta_description", label: "Meta description", description: "Default description used when a page has none.", type: "textarea", default: "" },
      { key: "og_site_name", label: "OG site name", description: "og:site_name value.", type: "text", default: "Sendloop" },
      { key: "og_image_url", label: "Default OG image", description: "Absolute URL used for social previews.", type: "url", default: "" },
      { key: "google_verification", label: "Google verification", description: "google-site-verification content value.", type: "text", default: "" },
      { key: "bing_verification", label: "Bing verification", description: "msvalidate.01 content value.", type: "text", default: "" },
      { key: "index_site", label: "Allow search indexing", description: "When off, the whole site is served noindex, nofollow.", type: "boolean", default: true, danger: true },
    ],
  },
  {
    id: "security",
    label: "Security",
    description: "Admin access, rate limits and login protection.",
    store: { table: "platform_settings", key: "system.security" },
    fields: [
      { key: "admin_ip_allowlist", label: "Admin IP allowlist", description: "Comma-separated IPs. Empty means no IP restriction.", type: "text", default: "" },
      { key: "admin_require_recent_login", label: "Re-auth for dangerous actions", description: "Admins must have signed in recently for destructive operations.", type: "boolean", default: true },
      { key: "max_login_attempts", label: "Max login attempts", description: "Failed sign-ins before the account is temporarily locked.", type: "number", default: 10, min: 3, max: 50 },
      { key: "lockout_minutes", label: "Lockout duration (minutes)", description: "How long an account stays locked after too many failures.", type: "number", default: 15, min: 1, max: 1440 },
      { key: "api_rate_limit_per_minute", label: "API rate limit (req/min)", description: "Per-workspace ceiling on public API and webhook calls.", type: "number", default: 120, min: 10, max: 10000 },
      { key: "security_alert_email", label: "Security alert recipient", description: "Address notified about security events.", type: "text", default: "" },
      { key: "audit_retention_days", label: "Audit retention (days)", description: "How long admin audit records are kept.", type: "number", default: 365, min: 30, max: 3650 },
    ],
  },
  {
    id: "jobs",
    label: "Jobs & limits",
    description: "Worker throughput, retries and cron behaviour.",
    store: { table: "platform_settings", key: "system.jobs" },
    fields: [
      { key: "campaign_batch_size", label: "Campaign batch size", description: "Messages claimed per campaign worker tick.", type: "number", default: 50, min: 1, max: 500 },
      { key: "warmup_batch_size", label: "Warmup batch size", description: "Warmup jobs claimed per worker tick.", type: "number", default: 25, min: 1, max: 500 },
      { key: "automation_batch_size", label: "Automation batch size", description: "Automation runs claimed per worker tick.", type: "number", default: 25, min: 1, max: 500 },
      { key: "max_retries", label: "Max retries", description: "Attempts before a job is marked permanently failed.", type: "number", default: 3, min: 0, max: 10 },
      { key: "retry_backoff_minutes", label: "Retry backoff (minutes)", description: "Delay before a failed job is retried.", type: "number", default: 10, min: 1, max: 1440 },
      { key: "cron_enabled", label: "Cron enabled", description: "Master switch for all scheduled workers.", type: "boolean", default: true, danger: true },
      { key: "max_daily_sends_per_account", label: "Daily sends per mailbox", description: "Hard platform ceiling regardless of plan.", type: "number", default: 500, min: 1, max: 5000 },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    description: "Upload limits and accepted file types.",
    store: { table: "platform_settings", key: "system.storage" },
    fields: [
      { key: "avatar_max_mb", label: "Avatar max size (MB)", description: "Largest profile picture accepted.", type: "number", default: 2, min: 1, max: 25 },
      { key: "upload_max_mb", label: "Upload max size (MB)", description: "Largest support attachment or media file accepted.", type: "number", default: 10, min: 1, max: 200 },
      { key: "allowed_image_types", label: "Allowed image types", description: "Comma-separated MIME types accepted for images.", type: "text", default: "image/png,image/jpeg,image/webp,image/gif" },
      { key: "allowed_doc_types", label: "Allowed document types", description: "Comma-separated MIME types accepted for attachments.", type: "text", default: "application/pdf,text/csv,text/plain" },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Customer, admin and system alerting.",
    store: { table: "platform_settings", key: "system.notifications" },
    fields: [
      { key: "customer_email_notifications", label: "Customer email notifications", description: "Send customers reply, bounce and campaign notifications.", type: "boolean", default: true },
      { key: "customer_in_app", label: "Customer in-app notifications", description: "Show the in-app notification bell for customers.", type: "boolean", default: true },
      { key: "admin_alerts_email", label: "Admin alert recipient", description: "Address that receives platform alerts.", type: "text", default: "" },
      { key: "alert_on_worker_failure", label: "Alert on worker failure", description: "Raise an admin alert when a worker stalls or fails repeatedly.", type: "boolean", default: true },
      { key: "alert_on_billing_failure", label: "Alert on billing failure", description: "Raise an admin alert on failed webhooks or payments.", type: "boolean", default: true },
      { key: "digest_frequency", label: "Admin digest", description: "How often the platform summary is sent.", type: "select", default: "daily", options: [
        { value: "off", label: "Off" },
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" },
      ] },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    description: "Take the customer-facing app offline safely.",
    store: { table: "platform_settings", key: "system.maintenance" },
    fields: [
      { key: "maintenance_mode", label: "Maintenance mode", description: "Customers see the maintenance notice; workers stop claiming new work.", type: "boolean", default: false, danger: true },
      { key: "maintenance_message", label: "Maintenance message", description: "Shown to customers while maintenance mode is on.", type: "textarea", default: "Sendloop is temporarily unavailable while we perform scheduled maintenance." },
      { key: "allow_admin_access", label: "Allow admin access", description: "Platform admins keep full access during maintenance.", type: "boolean", default: true },
      { key: "maintenance_until", label: "Expected back at", description: "Optional ISO timestamp shown to customers.", type: "text", default: "" },
    ],
  },
];

export function groupById(id: string) {
  return SETTING_GROUPS.find((g) => g.id === id) ?? null;
}

export function groupDefaults(group: SettingGroup): Record<string, string | number | boolean> {
  return Object.fromEntries(group.fields.map((f) => [f.key, f.default]));
}

/** Coerces and range-checks a submitted value against its field definition. */
export function coerceField(field: SettingField, raw: unknown): string | number | boolean {
  if (field.type === "boolean") return Boolean(raw);
  if (field.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${field.label} must be a number`);
    if (field.min !== undefined && n < field.min) throw new Error(`${field.label} must be at least ${field.min}`);
    if (field.max !== undefined && n > field.max) throw new Error(`${field.label} must be at most ${field.max}`);
    return Math.round(n);
  }
  const s = String(raw ?? "").slice(0, 4000);
  if (field.type === "select") {
    const allowed = (field.options ?? []).map((o) => o.value);
    if (!allowed.includes(s)) throw new Error(`${field.label} has an unsupported value`);
    return s;
  }
  if (field.type === "url" && s) {
    if (!/^https?:\/\/\S+$/i.test(s)) throw new Error(`${field.label} must be an http(s) URL`);
  }
  return s;
}

/** Validates a whole group payload, dropping unknown keys. */
export function validateGroup(group: SettingGroup, input: Record<string, unknown>) {
  const out: Record<string, string | number | boolean> = {};
  for (const field of group.fields) {
    if (field.readOnly) continue;
    const raw = Object.prototype.hasOwnProperty.call(input, field.key) ? input[field.key] : field.default;
    out[field.key] = coerceField(field, raw);
  }
  return out;
}

/** Client-side password rule check driven by the stored auth settings. */
export function checkPassword(
  password: string,
  rules: { password_min_length?: number; password_require_number?: boolean; password_require_symbol?: boolean },
): string | null {
  const min = Number(rules.password_min_length ?? 8);
  if (password.length < min) return `Password must be at least ${min} characters`;
  if (rules.password_require_number && !/\d/.test(password)) return "Password must contain a number";
  if (rules.password_require_symbol && !/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain a special character";
  }
  return null;
}
