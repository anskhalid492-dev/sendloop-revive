/**
 * Client-safe types and labels for customer-owned sending domains and mailboxes.
 *
 * MunchReach never provisions domains or mailboxes: everything here describes
 * infrastructure the customer owns and connects themselves.
 */

export type DnsStatus = "pending" | "verified" | "failed";

export type DnsRecordView = {
  kind: "spf" | "dkim" | "dmarc" | "mx" | "tracking";
  type: "TXT" | "CNAME" | "MX";
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  priority?: number | undefined;
  required: boolean;
  purpose: string;
  status: DnsStatus;
  message?: string | undefined;
  observed?: string | null | undefined;
};

export type SendingDomain = {
  id: string;
  domain: string;
  registrar: string | null;
  dkim_selector: string;
  tracking_host: string | null;
  dns_status: DnsStatus;
  spf_status: DnsStatus;
  dkim_status: DnsStatus;
  dmarc_status: DnsStatus;
  mx_status: DnsStatus;
  tracking_status: DnsStatus;
  last_checked_at: string | null;
  verified_at: string | null;
  last_error: string | null;
  created_at: string;
  /** Derived. */
  mailboxCount: number;
  activeMailboxes: number;
  health: "good" | "fair" | "poor";
};

export const DNS_STATUS_LABEL: Record<DnsStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
};

export const DNS_STATUS_STYLE: Record<DnsStatus, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  verified: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const RECORD_KIND_LABEL: Record<DnsRecordView["kind"], string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  mx: "MX",
  tracking: "Tracking domain",
};

/**
 * Sending infrastructure is fully managed by MunchReach. Customers connect a
 * mailbox on a domain they own; they never choose, see or submit a sending
 * provider or provider credentials — those live server-side only.
 */
export const SENDING_INFRA_LABEL = "Managed by MunchReach";

export function domainHealth(domain: {
  dns_status: DnsStatus;
  spf_status: DnsStatus;
  dkim_status: DnsStatus;
  dmarc_status: DnsStatus;
}): "good" | "fair" | "poor" {
  const core = [domain.spf_status, domain.dkim_status, domain.dmarc_status];
  if (core.every((s) => s === "verified")) return "good";
  if (core.some((s) => s === "verified")) return "fair";
  return "poor";
}
