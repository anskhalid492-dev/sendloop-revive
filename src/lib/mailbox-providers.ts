/**
 * Central registry of supported mailbox hosting providers.
 *
 * This is the single source of truth for the IMAP/SMTP defaults offered in the
 * mailbox connection flow. Updating a provider's servers or ports means editing
 * this file only — no component holds its own copy of these values.
 *
 * Client-safe: nothing here talks to a provider or reads a secret. The values
 * are only suggestions the customer can always override, because a mailbox is
 * not necessarily hosted with the company the domain was bought from.
 */
import type { MailHost } from "@/lib/mailbox-auth-check";
import type { MailSecurity } from "@/lib/mailbox-presets";

export type MailboxProviderId =
  | "zoho"
  | "hostinger"
  | "porkbun"
  | "godaddy"
  | "namecheap"
  | "yahoo"
  | "custom";

export type MailboxProvider = {
  id: MailboxProviderId;
  /** Name shown on the provider card. */
  displayName: string;
  /** Incoming (IMAP) defaults. Empty host means "customer supplies it". */
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  /** Outgoing (SMTP) defaults. */
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  /** Documented alternatives, offered as one-click options in Advanced Setup. */
  alternateSmtp?: Array<{ port: number; security: MailSecurity; label: string }>;
  alternateImap?: Array<{ port: number; security: MailSecurity; label: string }>;
  /** True when the provider rejects the normal password for mail clients. */
  supportsAppPassword: boolean;
  /** Official setup documentation for the provider. */
  documentationUrl: string;
  /** Short guidance shown once the provider is selected. */
  notes: string;
  /** Existing sending-ceiling bucket used for the honest volume note. */
  mailHost: MailHost;
  /** Customer fills every server field themselves. */
  manual?: boolean;
};

const SSL_IMAP = { imapPort: 993, imapSecurity: "ssl" as MailSecurity };

export const MAILBOX_PROVIDERS: MailboxProvider[] = [
  {
    id: "zoho",
    displayName: "Zoho",
    imapHost: "imap.zoho.com",
    ...SSL_IMAP,
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    alternateSmtp: [{ port: 587, security: "tls", label: "587 · STARTTLS" }],
    supportsAppPassword: true,
    documentationUrl: "https://www.zoho.com/mail/help/imap-access.html",
    notes:
      "Zoho needs IMAP access switched on for the mailbox. If your account uses two-factor sign-in, create an application-specific password in Zoho and use it here.",
    mailHost: "zoho",
  },
  {
    id: "hostinger",
    displayName: "Hostinger",
    imapHost: "imap.hostinger.com",
    ...SSL_IMAP,
    smtpHost: "smtp.hostinger.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    alternateSmtp: [{ port: 587, security: "tls", label: "587 · STARTTLS" }],
    supportsAppPassword: false,
    documentationUrl:
      "https://support.hostinger.com/en/articles/4305847-titan-email-what-are-the-imap-pop-and-smtp-settings",
    notes: "Use the mailbox address as the username and its own mailbox password.",
    mailHost: "hostinger",
  },
  {
    id: "porkbun",
    displayName: "Porkbun",
    imapHost: "imap.porkbun.com",
    ...SSL_IMAP,
    smtpHost: "smtp.porkbun.com",
    smtpPort: 587,
    smtpSecurity: "tls",
    alternateSmtp: [{ port: 465, security: "ssl", label: "465 · SSL" }],
    supportsAppPassword: false,
    documentationUrl: "https://kb.porkbun.com/article/56-how-to-use-porkbun-email-hosting",
    notes:
      "Use the full mailbox address as the username. Port 587 with STARTTLS is the documented default.",
    mailHost: "custom",
  },
  {
    id: "godaddy",
    displayName: "GoDaddy",
    imapHost: "imap.secureserver.net",
    ...SSL_IMAP,
    smtpHost: "smtpout.secureserver.net",
    smtpPort: 465,
    smtpSecurity: "ssl",
    alternateSmtp: [{ port: 587, security: "tls", label: "587 · STARTTLS" }],
    supportsAppPassword: false,
    documentationUrl:
      "https://www.godaddy.com/help/server-and-port-settings-for-workspace-email-6949",
    notes:
      "These are the settings for mailboxes hosted by GoDaddy itself. If your mail is hosted elsewhere, pick that provider or use Custom Domain.",
    mailHost: "godaddy",
  },
  {
    id: "namecheap",
    displayName: "Namecheap",
    imapHost: "mail.privateemail.com",
    ...SSL_IMAP,
    smtpHost: "mail.privateemail.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    alternateSmtp: [{ port: 587, security: "tls", label: "587 · STARTTLS" }],
    alternateImap: [{ port: 143, security: "tls", label: "143 · STARTTLS" }],
    supportsAppPassword: false,
    documentationUrl:
      "https://www.namecheap.com/support/knowledgebase/article.aspx/1179/2175/mail-client-setup-private-email-imap-pop3-smtp-settings/",
    notes: "For Namecheap Private Email. Use the full mailbox address as the username.",
    mailHost: "titan",
  },
  {
    id: "yahoo",
    displayName: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    ...SSL_IMAP,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecurity: "ssl",
    alternateSmtp: [{ port: 587, security: "tls", label: "587 · STARTTLS" }],
    supportsAppPassword: true,
    documentationUrl: "https://help.yahoo.com/kb/SLN4724.html",
    notes:
      "Yahoo requires an app password generated in your Yahoo account security settings — your normal Yahoo password will be refused. MunchReach cannot bypass that requirement.",
    mailHost: "yahoo",
  },
  {
    id: "custom",
    displayName: "Custom Domain",
    imapHost: "",
    imapPort: 993,
    imapSecurity: "ssl",
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "ssl",
    supportsAppPassword: false,
    documentationUrl: "",
    notes:
      "Use this option if your mailbox provider is not listed. Enter your IMAP and SMTP server details manually.",
    mailHost: "custom",
    manual: true,
  },
];

export function getMailboxProvider(id: MailboxProviderId): MailboxProvider {
  return (
    MAILBOX_PROVIDERS.find((provider) => provider.id === id) ??
    (MAILBOX_PROVIDERS[MAILBOX_PROVIDERS.length - 1] as MailboxProvider)
  );
}

/** Valid provider id, or null — used to validate what the browser sends. */
export function parseMailboxProviderId(value: unknown): MailboxProviderId | null {
  return MAILBOX_PROVIDERS.some((provider) => provider.id === value)
    ? (value as MailboxProviderId)
    : null;
}
