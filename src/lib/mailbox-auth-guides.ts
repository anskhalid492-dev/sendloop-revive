/**
 * Where a customer goes to fix a missing authentication record.
 *
 * Instructions are per mail host, detected from the domain's MX records. They
 * describe the customer's OWN host — MunchReach never publishes records for a
 * domain it does not control.
 */
import type { MailHost } from "@/lib/mailbox-auth-check";

export type MailboxAuthGuide = {
  host: MailHost;
  /** Where the records are added. */
  steps: string[];
  /** Caveat that catches most people out. */
  note: string;
  docsUrl: string | null;
};

const DNS_CAVEAT =
  "These records live wherever your domain's DNS is hosted — that can be a different company from your mail host (for example a domain bought at GoDaddy but hosted on Cloudflare).";

const GUIDES: Record<MailHost, MailboxAuthGuide> = {
  google_workspace: {
    host: "google_workspace",
    steps: [
      "Sign in to the Google Admin console at admin.google.com.",
      "Open Apps, then Google Workspace, then Gmail, then Authenticate email.",
      "Select your domain and generate the DKIM key, then copy the record shown.",
      "Add that DKIM record, the SPF record (include:_spf.google.com) and a _dmarc record at your DNS host.",
      "Return to Authenticate email and click Start authentication.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://support.google.com/a/answer/174124",
  },
  microsoft365: {
    host: "microsoft365",
    steps: [
      "Sign in to the Microsoft 365 admin centre at admin.microsoft.com.",
      "Open Settings, then Domains, and select your domain to see its DNS records.",
      "Open the Defender portal, then Email & collaboration, then Policies & rules, then Email authentication settings, and enable DKIM for the domain.",
      "Add the two DKIM CNAMEs (selector1 and selector2), the SPF record (include:spf.protection.outlook.com) and a _dmarc record at your DNS host.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://learn.microsoft.com/microsoft-365/security/office-365-security/email-authentication-dkim-configure",
  },
  hostinger: {
    host: "hostinger",
    steps: [
      "Sign in to hPanel at hpanel.hostinger.com.",
      "Open Emails and select your domain, then open the email configuration / DNS records section.",
      "Copy the SPF and DKIM records Hostinger shows for the mailbox.",
      "Open Domains, then DNS / Nameservers, then DNS records, and add the SPF, DKIM and _dmarc records there.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://support.hostinger.com/en/articles/4728222",
  },
  godaddy: {
    host: "godaddy",
    steps: [
      "Sign in to GoDaddy and open Domain Portfolio.",
      "Select your domain, then open DNS, then DNS Records.",
      "Add the SPF record (include:secureserver.net), the DKIM record from your mail product's settings, and a _dmarc record.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://www.godaddy.com/help/add-a-txt-record-19232",
  },
  zoho: {
    host: "zoho",
    steps: [
      "Sign in to the Zoho Mail admin console at mailadmin.zoho.com.",
      "Open Domains, select your domain, then open Email Configuration / DKIM.",
      "Add a selector, copy the generated DKIM record, and verify it.",
      "Add the SPF record (include:zoho.com) and a _dmarc record at your DNS host.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://www.zoho.com/mail/help/adminconsole/domain-authentication.html",
  },
  titan: {
    host: "titan",
    steps: [
      "Sign in to your Titan or Namecheap Private Email control panel.",
      "Open the domain's email settings and copy the SPF and DKIM records shown there.",
      "Add the SPF, DKIM and _dmarc records at your DNS host.",
    ],
    note: DNS_CAVEAT,
    docsUrl: null,
  },
  yahoo: {
    host: "yahoo",
    steps: [
      "Yahoo-hosted business mail publishes its own records. Open your mail host's DNS settings to confirm SPF and DKIM are present.",
      "Add a _dmarc record at your DNS host if one is missing.",
    ],
    note: DNS_CAVEAT,
    docsUrl: null,
  },
  proton: {
    host: "proton",
    steps: [
      "Sign in to Proton and open Settings, then Domain names.",
      "Select your domain and follow the SPF, DKIM and DMARC steps Proton lists.",
      "Add each record at your DNS host and re-verify in Proton.",
    ],
    note: DNS_CAVEAT,
    docsUrl: "https://proton.me/support/anti-spoofing-custom-domain",
  },
  zimbra: {
    host: "zimbra",
    steps: [
      "Ask your mail administrator to generate a DKIM key for the domain on the Zimbra server.",
      "Add the SPF record listing your mail server, the DKIM record from Zimbra, and a _dmarc record at your DNS host.",
    ],
    note: DNS_CAVEAT,
    docsUrl: null,
  },
  custom: {
    host: "custom",
    steps: [
      "Ask your mail host or administrator for this domain's SPF value and DKIM record — every host has its own.",
      "Add the SPF record, the DKIM record and a _dmarc record at your DNS host.",
    ],
    note: DNS_CAVEAT,
    docsUrl: null,
  },
  unknown: {
    host: "unknown",
    steps: [
      "This domain has no mail servers published, so we cannot tell who hosts its email. Check the domain is spelled correctly and that its MX records are in place.",
      "Then add the SPF record, the DKIM record and a _dmarc record your mail host provides.",
    ],
    note: DNS_CAVEAT,
    docsUrl: null,
  },
  free_mailbox: {
    host: "free_mailbox",
    steps: [
      "Free mailboxes such as gmail.com or outlook.com belong to the provider, so you cannot publish authentication records for them.",
      "Connect a mailbox on a domain you own (for example sales@yourcompany.com) and use that for outreach.",
    ],
    note: "Sending cold outreach from a free mailbox address is heavily filtered, whatever tool sends it.",
    docsUrl: null,
  },
};

export function mailboxAuthGuide(host: MailHost): MailboxAuthGuide {
  return GUIDES[host];
}
