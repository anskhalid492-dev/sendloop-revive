/**
 * Client-safe SMTP/IMAP presets for the "Connect Your Mailbox" form.
 *
 * Suggestions are derived from the email address domain only, so the customer
 * usually only has to type a password. Nothing here talks to a provider.
 */

export type MailSecurity = "ssl" | "tls" | "none";

export type MailboxPreset = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  /** Extra guidance shown under the form when a preset matches. */
  note?: string;
};

const GOOGLE = ["gmail.com", "googlemail.com"];
const MICROSOFT = ["outlook.com", "hotmail.com", "live.com", "msn.com", "office365.com"];
const ZOHO = ["zoho.com", "zohomail.com", "zoho.eu", "zoho.in"];
const HOSTINGER = ["hostinger.com", "hostinger.co.uk", "hostinger.in"];
const TITAN = ["privateemail.com", "titan.email", "namecheap.com"];

function preset(
  provider: string,
  smtpHost: string,
  imapHost: string,
  note?: string,
): MailboxPreset {
  return {
    provider,
    smtpHost,
    smtpPort: 465,
    smtpSecurity: "ssl",
    imapHost,
    imapPort: 993,
    imapSecurity: "ssl",
    ...(note ? { note } : {}),
  };
}

const PRESETS: Array<{ domains: string[]; preset: MailboxPreset }> = [
  {
    domains: GOOGLE,
    preset: preset(
      "Gmail / Google Workspace",
      "smtp.gmail.com",
      "imap.gmail.com",
      "Google requires an App Password — your normal account password will be rejected.",
    ),
  },
  {
    domains: MICROSOFT,
    preset: {
      provider: "Outlook / Microsoft 365",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecurity: "tls",
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecurity: "ssl",
      note: "Microsoft 365 needs SMTP AUTH enabled on the mailbox, and an App Password when MFA is on.",
    },
  },
  { domains: ZOHO, preset: preset("Zoho Mail", "smtp.zoho.com", "imap.zoho.com") },
  {
    domains: HOSTINGER,
    preset: preset("Hostinger", "smtp.hostinger.com", "imap.hostinger.com"),
  },
  {
    domains: TITAN,
    preset: preset(
      "Namecheap Private Email / Titan",
      "smtp.privateemail.com",
      "imap.privateemail.com",
    ),
  },
];

/** Lowercased domain part of an email address, or null. */
export function domainOfEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  return email.trim().toLowerCase().slice(at + 1).trim() || null;
}

/**
 * Suggests hosts/ports for an email address.
 *
 * Custom domains hosted on one of these providers can't be detected from the
 * address alone, so an unknown domain falls back to a conventional
 * `mail.<domain>` guess the customer can correct.
 */
export function suggestMailboxSettings(email: string): MailboxPreset | null {
  const domain = domainOfEmail(email);
  if (!domain) return null;

  for (const entry of PRESETS) {
    if (entry.domains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      return entry.preset;
    }
  }

  return preset(
    "Custom domain (best guess)",
    `mail.${domain}`,
    `mail.${domain}`,
    "We guessed these from your domain — check them against your email host's documentation.",
  );
}

/** Whether an implicit-TLS socket should be opened for a security mode. */
export function usesImplicitTls(security: MailSecurity): boolean {
  return security === "ssl";
}
