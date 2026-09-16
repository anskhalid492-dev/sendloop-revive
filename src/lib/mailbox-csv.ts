/**
 * CSV template + parser for bulk mailbox imports.
 *
 * Client-safe. Rows are mapped onto the same shape the single-mailbox
 * test-and-save server function already accepts — no new storage or logic.
 */
import type { MailSecurity } from "@/lib/mailbox-presets";

export const MAILBOX_CSV_HEADERS = [
  "Email",
  "First Name",
  "Last Name",
  "IMAP Username",
  "IMAP Password",
  "IMAP Host",
  "IMAP Port",
  "SMTP Username",
  "SMTP Password",
  "SMTP Host",
  "SMTP Port",
  "Daily Limit",
  "Warmup Enabled",
  "Warmup Limit",
] as const;

export type MailboxCsvRow = {
  line: number;
  emailAddress: string;
  displayName: string;
  dailySendLimit: number;
  warmupEnabled: boolean;
  smtp: { host: string; port: number; security: MailSecurity; username: string; password: string };
  imap: { host: string; port: number; security: MailSecurity; username: string; password: string };
  error?: string;
};

/** A ready-to-download template with the headers and one example row. */
export function mailboxCsvTemplate(): string {
  const example = [
    "jane@yourdomain.com",
    "Jane",
    "Doe",
    "jane@yourdomain.com",
    "imap-password",
    "imap.yourdomain.com",
    "993",
    "jane@yourdomain.com",
    "smtp-password",
    "smtp.yourdomain.com",
    "465",
    "50",
    "false",
    "20",
  ];
  return `${MAILBOX_CSV_HEADERS.join(",")}\n${example.join(",")}\n`;
}

/** Splits one CSV line, honouring double-quoted values. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      out.push(value);
      value = "";
    } else value += char;
  }
  out.push(value);
  return out.map((entry) => entry.trim());
}

/** Ports 465 (SMTP) and 993 (IMAP) are implicit TLS; 587/25 use STARTTLS. */
function securityForPort(port: number): MailSecurity {
  if (port === 465 || port === 993) return "ssl";
  if (port === 587 || port === 143 || port === 25) return "tls";
  return "ssl";
}

function truthy(value: string): boolean {
  return ["true", "yes", "1", "on", "enabled"].includes(value.toLowerCase());
}

/** Parses the uploaded file into rows, marking invalid rows instead of throwing. */
export function parseMailboxCsv(text: string): MailboxCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = splitLine(lines[0]!).map((cell) => cell.toLowerCase());
  const index = (name: string) => header.indexOf(name.toLowerCase());
  const cols = {
    email: index("Email"),
    first: index("First Name"),
    last: index("Last Name"),
    imapUser: index("IMAP Username"),
    imapPass: index("IMAP Password"),
    imapHost: index("IMAP Host"),
    imapPort: index("IMAP Port"),
    smtpUser: index("SMTP Username"),
    smtpPass: index("SMTP Password"),
    smtpHost: index("SMTP Host"),
    smtpPort: index("SMTP Port"),
    daily: index("Daily Limit"),
    warmup: index("Warmup Enabled"),
  };

  const rows: MailboxCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitLine(lines[i]!);
    const at = (position: number) => (position >= 0 ? (cells[position] ?? "") : "");

    const email = at(cols.email).toLowerCase();
    const smtpPort = Number(at(cols.smtpPort)) || 465;
    const imapPort = Number(at(cols.imapPort)) || 993;
    const displayName = [at(cols.first), at(cols.last)].filter(Boolean).join(" ").trim();

    const row: MailboxCsvRow = {
      line: i + 1,
      emailAddress: email,
      displayName,
      dailySendLimit: Number(at(cols.daily)) || 50,
      warmupEnabled: truthy(at(cols.warmup)),
      smtp: {
        host: at(cols.smtpHost),
        port: smtpPort,
        security: securityForPort(smtpPort),
        username: at(cols.smtpUser) || email,
        password: at(cols.smtpPass),
      },
      imap: {
        host: at(cols.imapHost),
        port: imapPort,
        security: securityForPort(imapPort),
        username: at(cols.imapUser) || email,
        password: at(cols.imapPass),
      },
    };

    if (!email.includes("@")) row.error = "Missing or invalid email address.";
    else if (!row.smtp.host || !row.imap.host) row.error = "Missing SMTP or IMAP host.";
    else if (!row.smtp.password || !row.imap.password) row.error = "Missing SMTP or IMAP password.";

    rows.push(row);
  }
  return rows;
}
