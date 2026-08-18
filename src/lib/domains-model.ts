/**
 * Client-safe types and labels for customer-owned sending domains and mailboxes.
 *
 * Sendloop never provisions domains or mailboxes: everything here describes
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
 * Mailbox connection methods a customer can use with their own mailbox.
 * Only HTTP-API methods are offered because SMTP cannot be dialled from the
 * serverless runtime — offering it would mean pretending a connection works.
 */
export type MailboxMethod = {
  id: "resend" | "sendgrid" | "postmark" | "mailgun" | "brevo" | "zeptomail";
  label: string;
  blurb: string;
  fields: { name: string; label: string; placeholder?: string; secret?: boolean }[];
};

export const MAILBOX_METHODS: MailboxMethod[] = [
  {
    id: "resend",
    label: "Resend",
    blurb: "Connect the mailbox through your own Resend account and domain.",
    fields: [{ name: "api_key", label: "Resend API key", placeholder: "re_...", secret: true }],
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    blurb: "Use your own SendGrid API key with full send permissions.",
    fields: [{ name: "api_key", label: "SendGrid API key", placeholder: "SG....", secret: true }],
  },
  {
    id: "postmark",
    label: "Postmark",
    blurb: "Use the server token of your own Postmark server.",
    fields: [{ name: "api_key", label: "Server token", secret: true }],
  },
  {
    id: "mailgun",
    label: "Mailgun",
    blurb: "Use your own Mailgun API key and sending domain.",
    fields: [
      { name: "api_key", label: "Mailgun API key", secret: true },
      { name: "domain", label: "Mailgun sending domain", placeholder: "mg.yourcompany.com" },
    ],
  },
  {
    id: "brevo",
    label: "Brevo",
    blurb: "Use your own Brevo API key.",
    fields: [{ name: "api_key", label: "Brevo API key", secret: true }],
  },
  {
    id: "zeptomail",
    label: "ZeptoMail",
    blurb: "Use your own ZeptoMail send-mail token.",
    fields: [{ name: "api_key", label: "Send-mail token", secret: true }],
  },
];

export function methodLabel(id: string | null): string {
  return MAILBOX_METHODS.find((m) => m.id === id)?.label ?? "—";
}

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
