/**
 * Provider capability matrix — client-safe, admin-only.
 *
 * Every entry is derived from the provider's CURRENT public API documentation.
 * A capability is only "supported" when the provider exposes it through its own
 * API. When the provider requires work outside its API (dashboard configuration,
 * DNS values published by hand) it is "manual_required". Anything the provider
 * genuinely does not offer is "not_supported".
 *
 * MunchReach never edits DNS at a registrar and integrates no DNS provider: the
 * matrix only records what each EMAIL provider itself can do.
 */

export const PROVIDER_CAPABILITY_KEYS = [
  "sending",
  "domain_management",
  "domain_verification",
  "dns_record_retrieval",
  "tracking",
  "custom_tracking",
  "inbound",
  "webhooks",
  "bounce_events",
  "complaint_events",
  "open_tracking",
  "click_tracking",
] as const;

export type ProviderCapabilityKey = (typeof PROVIDER_CAPABILITY_KEYS)[number];

export type CapabilityLevel = "supported" | "manual_required" | "not_supported";

export const CAPABILITY_LABEL: Record<ProviderCapabilityKey, string> = {
  sending: "Sending",
  domain_management: "Domain management",
  domain_verification: "Domain verification",
  dns_record_retrieval: "DNS record retrieval",
  tracking: "Tracking",
  custom_tracking: "Custom tracking domain",
  inbound: "Inbound / replies",
  webhooks: "Webhooks",
  bounce_events: "Bounce events",
  complaint_events: "Complaint events",
  open_tracking: "Open tracking",
  click_tracking: "Click tracking",
};

export const CAPABILITY_LEVEL_LABEL: Record<CapabilityLevel, string> = {
  supported: "Supported",
  manual_required: "Manual setup required",
  not_supported: "Not supported",
};

export const CAPABILITY_LEVEL_STYLE: Record<CapabilityLevel, string> = {
  supported: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  manual_required: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  not_supported: "border-border bg-muted text-muted-foreground",
};

export type ProviderCapabilityProfile = {
  /** Short admin-facing note explaining the manual parts, if any. */
  note: string;
  capabilities: Record<ProviderCapabilityKey, CapabilityLevel>;
};

const S = "supported" as const;
const M = "manual_required" as const;
const N = "not_supported" as const;

function profile(
  note: string,
  values: Partial<Record<ProviderCapabilityKey, CapabilityLevel>>,
): ProviderCapabilityProfile {
  const capabilities = Object.fromEntries(
    PROVIDER_CAPABILITY_KEYS.map((key) => [key, values[key] ?? N]),
  ) as Record<ProviderCapabilityKey, CapabilityLevel>;
  return { note, capabilities };
}

export const PROVIDER_CAPABILITY_MATRIX: Record<string, ProviderCapabilityProfile> = {
  resend: profile("Domains, DNS records, receiving and webhooks are all API-driven.", {
    sending: S,
    domain_management: S,
    domain_verification: S,
    dns_record_retrieval: S,
    tracking: S,
    custom_tracking: N,
    inbound: S,
    webhooks: S,
    bounce_events: S,
    complaint_events: S,
    open_tracking: S,
    click_tracking: S,
  }),
  ses: profile("Identities, DKIM and event destinations are API-driven; inbound needs SES receipt rules.", {
    sending: S,
    domain_management: S,
    domain_verification: S,
    dns_record_retrieval: S,
    tracking: S,
    custom_tracking: S,
    inbound: S,
    webhooks: S,
    bounce_events: S,
    complaint_events: S,
    open_tracking: S,
    click_tracking: S,
  }),
  mailgun: profile("Domains, DNS records, routes and webhooks are API-driven.", {
    sending: S,
    domain_management: S,
    domain_verification: S,
    dns_record_retrieval: S,
    tracking: S,
    custom_tracking: S,
    inbound: S,
    webhooks: S,
    bounce_events: S,
    complaint_events: S,
    open_tracking: S,
    click_tracking: S,
  }),
  brevo: profile("Domains and DNS records are API-driven; webhooks are API-driven.", {
    sending: S,
    domain_management: S,
    domain_verification: S,
    dns_record_retrieval: S,
    tracking: S,
    inbound: S,
    webhooks: S,
    bounce_events: S,
    complaint_events: S,
    open_tracking: S,
    click_tracking: S,
  }),
  sendgrid: profile("Domain authentication and event webhooks are API-driven.", {
    sending: S,
    domain_management: S,
    domain_verification: S,
    dns_record_retrieval: S,
    tracking: S,
    custom_tracking: S,
    inbound: S,
    webhooks: S,
    bounce_events: S,
    complaint_events: S,
    open_tracking: S,
    click_tracking: S,
  }),

  /* ---------------- providers added in this phase ---------------- */

  nuntly: profile(
    "Domains, DNS records, tracking flags, receiving and webhooks are all API-driven. Domain verification runs automatically once the records are published.",
    {
      sending: S,
      domain_management: S,
      domain_verification: S,
      dns_record_retrieval: S,
      tracking: S,
      custom_tracking: N,
      inbound: S,
      webhooks: S,
      bounce_events: S,
      complaint_events: S,
      open_tracking: S,
      click_tracking: S,
    },
  ),
  elasticemail: profile(
    "Domains, verification, inbound routes and webhooks are API-driven. Only the DKIM record is returned by the API — SPF, DMARC, tracking and inbound MX values are reported as verified/not verified only, so those values must be taken from the provider dashboard.",
    {
      sending: S,
      domain_management: S,
      domain_verification: S,
      dns_record_retrieval: M,
      tracking: S,
      custom_tracking: S,
      inbound: S,
      webhooks: S,
      bounce_events: S,
      complaint_events: S,
      open_tracking: S,
      click_tracking: S,
    },
  ),
  maileroo: profile(
    "Domains, DNS requirements, verification, inbound routes and webhooks are all API-driven. A custom tracking hostname requires a paid plan at the provider.",
    {
      sending: S,
      domain_management: S,
      domain_verification: S,
      dns_record_retrieval: S,
      tracking: S,
      custom_tracking: M,
      inbound: S,
      webhooks: S,
      bounce_events: S,
      complaint_events: S,
      open_tracking: S,
      click_tracking: S,
    },
  ),
  courier: profile(
    "Courier is a delivery orchestration API: it sends and tracks messages but publishes no domain, DNS or inbound email API. Webhooks are created in the Courier dashboard, then verified here by signature.",
    {
      sending: S,
      domain_management: N,
      domain_verification: N,
      dns_record_retrieval: N,
      tracking: S,
      custom_tracking: N,
      inbound: N,
      webhooks: M,
      bounce_events: S,
      complaint_events: N,
      open_tracking: S,
      click_tracking: S,
    },
  ),
  uspeedo: profile(
    "Sending is API-driven. Sending domains, their DNS records and webhook subscriptions are configured in the uSpeedo console; the API documents no endpoints for them.",
    {
      sending: S,
      domain_management: M,
      domain_verification: M,
      dns_record_retrieval: M,
      tracking: S,
      custom_tracking: N,
      inbound: N,
      webhooks: M,
      bounce_events: S,
      complaint_events: S,
      open_tracking: S,
      click_tracking: S,
    },
  ),
};

export function providerCapabilityProfile(providerId: string): ProviderCapabilityProfile | null {
  return PROVIDER_CAPABILITY_MATRIX[providerId] ?? null;
}
