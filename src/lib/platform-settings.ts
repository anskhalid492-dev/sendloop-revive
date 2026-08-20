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

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "url"
  | "image";

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
  /** Extra managed surface rendered under the form (records, not key/values). */
  panel?: "announcements" | "flags" | "history" | "auth" | "referral-templates";
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

const LANGUAGES = [
  { value: "en", label: "English (en)" },
  { value: "es", label: "Spanish (es)" },
  { value: "fr", label: "French (fr)" },
  { value: "de", label: "German (de)" },
  { value: "pt", label: "Portuguese (pt)" },
  { value: "nl", label: "Dutch (nl)" },
  { value: "it", label: "Italian (it)" },
  { value: "hi", label: "Hindi (hi)" },
];

const DATE_FORMATS = [
  { value: "YYYY-MM-DD", label: "2026-08-20 (ISO)" },
  { value: "DD/MM/YYYY", label: "20/08/2026" },
  { value: "MM/DD/YYYY", label: "08/20/2026" },
  { value: "D MMM YYYY", label: "20 Aug 2026" },
];


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
        default: "MunchReach",
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
        key: "default_language",
        label: "Default language",
        description: "Locale applied to new accounts and to platform email.",
        type: "select",
        default: "en",
        options: LANGUAGES,
      },
      {
        key: "default_date_format",
        label: "Default date format",
        description: "How dates render across customer dashboards.",
        type: "select",
        default: "YYYY-MM-DD",
        options: DATE_FORMATS,
      },
      {
        key: "default_time_format",
        label: "Default time format",
        description: "Clock format used with dates.",
        type: "select",
        default: "24h",
        options: [
          { value: "24h", label: "24-hour (14:30)" },
          { value: "12h", label: "12-hour (2:30 PM)" },
        ],
      },
      {
        key: "default_pagination",
        label: "Default page size",
        description: "Rows per page in customer tables that do not override it.",
        type: "number",
        default: 25,
        min: 5,
        max: 200,
      },
      {
        key: "onboarding_enabled",
        label: "Customer onboarding enabled",
        description:
          "When off, new customers skip the guided setup wizard and land straight on the dashboard.",
        type: "boolean",
        default: true,
      },
      {
        key: "suspension_behavior",
        label: "Account suspension behaviour",
        description: "What a suspended workspace or user can still do.",
        type: "select",
        default: "block_signin",
        danger: true,
        options: [
          { value: "block_signin", label: "Block sign-in entirely" },
          { value: "read_only", label: "Read-only access (no writes or sending)" },
          { value: "pause_sending", label: "Full access but sending paused" },
        ],
      },
      {
        key: "suspension_message",
        label: "Suspension notice",
        description: "Message shown to suspended customers.",
        type: "textarea",
        default:
          "This account is suspended. Contact support to restore access.",
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
    note: "Uploads are stored in the platform media bucket and served through the signed media proxy — nothing is written to the public internet directly.",
    store: { table: "platform_settings", key: "system.branding" },
    fields: [
      { key: "logo_url", label: "Logo", description: "Shown in the app header and emails. Upload a PNG or SVG.", type: "image", default: "" },
      { key: "logo_dark_url", label: "Dark-mode logo", description: "Optional variant for dark backgrounds.", type: "image", default: "" },
      { key: "login_logo_url", label: "Login logo", description: "Shown on sign-in, sign-up and password screens. Falls back to the main logo.", type: "image", default: "" },
      { key: "favicon_url", label: "Favicon", description: "Browser tab icon. Falls back to /favicon.ico.", type: "image", default: "" },
      { key: "social_image_url", label: "Default social image", description: "Fallback og:image for pages without their own.", type: "image", default: "" },
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
      { key: "from_name", label: "Default sender name", description: "From-name on platform (non-campaign) email.", type: "text", default: "MunchReach" },
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
      { key: "site_title", label: "Global site title", description: "Default <title> and og:title for pages without an override.", type: "text", default: "MunchReach — Cold Email Outreach Platform" },
      { key: "meta_description", label: "Meta description", description: "Default description used when a page has none.", type: "textarea", default: "" },
      { key: "og_site_name", label: "OG site name", description: "og:site_name value.", type: "text", default: "MunchReach" },
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
      { key: "maintenance_message", label: "Maintenance message", description: "Shown to customers while maintenance mode is on.", type: "textarea", default: "MunchReach is temporarily unavailable while we perform scheduled maintenance." },
      { key: "allow_admin_access", label: "Allow admin access", description: "Platform admins keep full access during maintenance.", type: "boolean", default: true },
      { key: "maintenance_until", label: "Expected back at", description: "Optional ISO timestamp shown to customers.", type: "text", default: "" },
    ],
  },
  {
    id: "localization",
    label: "Localization",
    description: "Languages, locale formats and currency display.",
    store: { table: "platform_settings", key: "system.localization" },
    fields: [
      { key: "supported_languages", label: "Supported languages", description: "Comma-separated locale codes offered to customers.", type: "text", default: "en" },
      { key: "fallback_language", label: "Fallback language", description: "Used when a customer's locale has no translation.", type: "select", default: "en", options: LANGUAGES },
      { key: "number_format", label: "Number format", description: "Thousands and decimal separators used in reporting.", type: "select", default: "1,234.56", options: [
        { value: "1,234.56", label: "1,234.56" },
        { value: "1.234,56", label: "1.234,56" },
        { value: "1 234,56", label: "1 234,56" },
      ] },
      { key: "first_day_of_week", label: "First day of week", description: "Applied to calendars and weekly reporting.", type: "select", default: "monday", options: [
        { value: "monday", label: "Monday" },
        { value: "sunday", label: "Sunday" },
      ] },
      { key: "timezone_options", label: "Offered timezones", description: "Comma-separated IANA zones customers can pick from. Empty means the full list.", type: "textarea", default: "" },
      { key: "currency_display", label: "Currency display", description: "How amounts are labelled in the UI.", type: "select", default: "symbol", options: [
        { value: "symbol", label: "Symbol ($1,200)" },
        { value: "code", label: "Code (1,200 USD)" },
        { value: "both", label: "Both ($1,200 USD)" },
      ] },
      { key: "currency_position", label: "Currency position", description: "Where the symbol sits relative to the amount.", type: "select", default: "before", options: [
        { value: "before", label: "Before the amount" },
        { value: "after", label: "After the amount" },
      ] },
    ],
  },
  {
    id: "legal",
    label: "Legal & compliance",
    description: "Company identity, policy versions and required acceptance.",
    store: { table: "platform_settings", key: "system.legal" },
    fields: [
      { key: "company_legal_name", label: "Legal entity name", description: "Registered company name shown on invoices and policies.", type: "text", default: "" },
      { key: "company_registration_number", label: "Registration number", description: "Company or business registration identifier.", type: "text", default: "" },
      { key: "vat_number", label: "VAT / tax number", description: "Shown on invoices where required.", type: "text", default: "" },
      { key: "legal_address", label: "Registered address", description: "Full legal address used in policies and email footers.", type: "textarea", default: "" },
      { key: "privacy_contact_email", label: "Privacy contact", description: "Address published for privacy and data requests.", type: "text", default: "" },
      { key: "dpo_email", label: "DPO contact", description: "Data protection officer address, where one is appointed.", type: "text", default: "" },
      { key: "terms_url", label: "Terms URL", description: "Link used wherever terms are referenced.", type: "text", default: "/terms" },
      { key: "privacy_url", label: "Privacy policy URL", description: "Link used wherever the privacy policy is referenced.", type: "text", default: "/privacy" },
      { key: "terms_version", label: "Terms version", description: "Bumping this re-prompts every customer for acceptance.", type: "text", default: "1.0" },
      { key: "privacy_version", label: "Privacy version", description: "Version stamp recorded with each acceptance.", type: "text", default: "1.0" },
      { key: "require_terms_acceptance", label: "Require terms acceptance", description: "Customers must accept the current version before using the app.", type: "boolean", default: false, danger: true },
    ],
  },
  {
    id: "consent",
    label: "Cookie & consent",
    description: "Consent banner, categories and stored preferences.",
    store: { table: "platform_settings", key: "system.consent" },
    fields: [
      { key: "cookie_banner_enabled", label: "Cookie consent banner", description: "Show the consent banner to visitors who have not chosen yet.", type: "boolean", default: false },
      { key: "banner_title", label: "Banner title", description: "Heading shown in the consent banner.", type: "text", default: "We use cookies" },
      { key: "banner_text", label: "Banner text", description: "Explanation shown to visitors.", type: "textarea", default: "We use essential cookies to run MunchReach, plus optional analytics and marketing cookies. You choose what we may use." },
      { key: "accept_label", label: "Accept button label", description: "Label for the accept-all action.", type: "text", default: "Accept all" },
      { key: "reject_label", label: "Reject button label", description: "Label for the essential-only action.", type: "text", default: "Essential only" },
      { key: "analytics_consent", label: "Analytics category", description: "Offer an analytics cookie category in the banner.", type: "boolean", default: true },
      { key: "marketing_consent", label: "Marketing category", description: "Offer a marketing cookie category in the banner.", type: "boolean", default: false },
      { key: "consent_version", label: "Consent version", description: "Bumping this asks every visitor to choose again.", type: "text", default: "1" },
      { key: "policy_url", label: "Cookie policy URL", description: "Linked from the banner.", type: "text", default: "/privacy" },
    ],
  },
  {
    id: "announcements",
    label: "Announcements",
    description: "Global banners shown across the customer dashboard and admin area.",
    store: { table: "platform_settings", key: "system.announcements" },
    panel: "announcements",
    fields: [],
  },
  {
    id: "flags",
    label: "Feature flags",
    description: "Platform-wide release switches, separate from plan features.",
    note: "Plan entitlements live in Admin → Features. These flags control platform rollouts for everyone.",
    store: { table: "platform_settings", key: "system.flags" },
    panel: "flags",
    fields: [],
  },
  {
    id: "api",
    label: "API & versioning",
    description: "Public API version, deprecations and availability.",
    store: { table: "platform_settings", key: "system.api" },
    fields: [
      { key: "public_api_enabled", label: "Public API enabled", description: "When off, public API routes reject requests with 503.", type: "boolean", default: true, danger: true },
      { key: "current_version", label: "Current API version", description: "Newest version served.", type: "text", default: "2026-01" },
      { key: "default_version", label: "Default API version", description: "Used when a request sends no version header.", type: "text", default: "2026-01" },
      { key: "deprecated_versions", label: "Deprecated versions", description: "Comma-separated versions still served but deprecated.", type: "text", default: "" },
      { key: "deprecation_date", label: "Deprecation date", description: "ISO date when deprecated versions stop being served.", type: "text", default: "" },
      { key: "api_status", label: "API status", description: "Reported on the status endpoint and admin dashboard.", type: "select", default: "operational", options: [
        { value: "operational", label: "Operational" },
        { value: "degraded", label: "Degraded" },
        { value: "maintenance", label: "Maintenance" },
        { value: "offline", label: "Offline" },
      ] },
      { key: "api_maintenance_message", label: "API maintenance message", description: "Returned to API callers while the API is not operational.", type: "textarea", default: "" },
    ],
  },
  {
    id: "data",
    label: "Data & account policies",
    description: "Export availability, deletion requests and grace periods.",
    store: { table: "platform_settings", key: "system.data" },
    fields: [
      { key: "export_enabled", label: "Customer data export", description: "Customers can export their workspace data from Settings.", type: "boolean", default: true },
      { key: "export_retention_days", label: "Export retention (days)", description: "How long a generated export stays downloadable.", type: "number", default: 7, min: 1, max: 90 },
      { key: "deletion_requests_enabled", label: "Account deletion requests", description: "Customers can request account deletion in-app.", type: "boolean", default: true },
      { key: "deletion_grace_days", label: "Deletion grace period (days)", description: "Days before a requested deletion is executed.", type: "number", default: 14, min: 0, max: 180 },
      { key: "workspace_deletion", label: "Workspace deletion behaviour", description: "What happens when a workspace is deleted.", type: "select", default: "soft", danger: true, options: [
        { value: "soft", label: "Soft delete (recoverable during grace period)" },
        { value: "hard", label: "Immediate permanent delete" },
      ] },
      { key: "require_typed_confirmation", label: "Require typed confirmation", description: "Customers must type the workspace name to confirm deletion.", type: "boolean", default: true },
      { key: "deletion_notice", label: "Deletion notice", description: "Shown in the deletion confirmation dialog.", type: "textarea", default: "Deleting a workspace removes its campaigns, leads and inbox history." },
    ],
  },
  {
    id: "limits",
    label: "Platform limits",
    description: "Global validation ceilings that apply regardless of plan.",
    note: "Plan-based quotas (sends, seats, contacts) live in Admin → Plans. These are hard platform validation limits.",
    store: { table: "platform_settings", key: "system.limits" },
    fields: [
      { key: "max_workspace_name_length", label: "Max workspace name length", description: "Characters allowed in a workspace name.", type: "number", default: 60, min: 8, max: 200 },
      { key: "max_custom_fields", label: "Max custom fields", description: "Custom lead fields allowed per workspace.", type: "number", default: 30, min: 1, max: 200 },
      { key: "max_import_file_mb", label: "Max import file size (MB)", description: "Largest CSV accepted by the lead importer.", type: "number", default: 20, min: 1, max: 200 },
      { key: "max_csv_rows", label: "Max rows per import", description: "Largest number of rows accepted in one import.", type: "number", default: 50000, min: 100, max: 1000000 },
      { key: "max_attachment_mb", label: "Max attachment size (MB)", description: "Largest email or support attachment accepted.", type: "number", default: 10, min: 1, max: 100 },
      { key: "max_api_payload_kb", label: "Max API payload (KB)", description: "Largest request body accepted by public API routes.", type: "number", default: 512, min: 16, max: 10240 },
      { key: "max_tags_per_lead", label: "Max tags per lead", description: "Tags allowed on a single lead record.", type: "number", default: 25, min: 1, max: 200 },
    ],
  },
  {
    id: "history",
    label: "Configuration history",
    description: "Every system settings change, with before and after values.",
    store: { table: "platform_settings", key: "system.history" },
    panel: "history",
    fields: [],
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
  if (field.type === "image" && s) {
    // Uploads are served through the app's own signed media proxy, so a
    // site-relative path is as valid as an absolute URL here.
    const ok = /^https?:\/\/\S+$/i.test(s) || (s.startsWith("/") && !s.includes(".."));
    if (!ok) throw new Error(`${field.label} must be an uploaded file or an http(s) URL`);
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
