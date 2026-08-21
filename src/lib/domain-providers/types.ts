/**
 * Client-safe types for the MunchReach domain provider abstraction.
 *
 * Customers only ever see "MunchReach Email Infrastructure". The concrete
 * provider (Amazon SES, Mailgun, Brevo, Resend, SendGrid) lives server-side and
 * is never named in customer-facing UI.
 */

export type ProviderRecordKind = "spf" | "dkim" | "dmarc" | "mx" | "tracking" | "verification";

export type ProviderDnsRecord = {
  /** Stable id so statuses survive re-generation. */
  id: string;
  kind: ProviderRecordKind;
  type: "TXT" | "CNAME" | "MX";
  /** Relative host to create at the DNS host, plus the resolved FQDN. */
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  priority?: number | undefined;
  required: boolean;
  purpose: string;
};

export type ProviderDomainState = {
  /** Normalised provider-side authorisation state. */
  state: "unknown" | "pending" | "verified" | "failed";
  /** Raw provider detail — admin/logs only, never shown to a customer. */
  detail: string;
};

export type ProviderDomainSetup = ProviderDomainState & {
  providerDomainId: string | null;
  records: ProviderDnsRecord[];
};

/** Overall customer-facing domain stage. */
export type DomainStage =
  | "pending_dns"
  | "checking"
  | "dns_verified"
  | "provider_verification"
  | "ready"
  | "dns_error"
  | "provider_error"
  | "disabled";

export const DOMAIN_STAGE_LABEL: Record<DomainStage, string> = {
  pending_dns: "Pending DNS",
  checking: "Checking",
  dns_verified: "DNS verified",
  provider_verification: "Verifying domain",
  ready: "Ready to send",
  dns_error: "DNS error",
  provider_error: "Verification failed",
  disabled: "Disabled",
};

export const DOMAIN_STAGE_STYLE: Record<DomainStage, string> = {
  pending_dns: "border-border bg-muted text-muted-foreground",
  checking: "border-border bg-muted text-muted-foreground",
  dns_verified: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  provider_verification: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  ready: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  dns_error: "border-destructive/30 bg-destructive/10 text-destructive",
  provider_error: "border-destructive/30 bg-destructive/10 text-destructive",
  disabled: "border-border bg-muted text-muted-foreground",
};

/** Copy shown to customers instead of any raw provider error. */
export const DOMAIN_PROVIDER_ERROR_MESSAGE =
  "Your sending domain could not be verified yet. We will keep checking automatically.";

export const DOMAIN_INFRA_LABEL = "MunchReach Email Infrastructure";
