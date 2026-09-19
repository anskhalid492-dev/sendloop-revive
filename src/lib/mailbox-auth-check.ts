/**
 * Mailbox domain authentication — pure evaluation layer.
 *
 * Customers connect their OWN mailboxes (IMAP/SMTP) on domains MunchReach does
 * not host, so the only honest thing we can do is read what their domain
 * publishes and report it. This module never performs a lookup and never writes
 * DNS: it turns observed DNS values into a verdict with plain-language reasons.
 *
 * Two rules hold everywhere in here:
 *   - A lookup that could not be completed is `unchecked`, never `fail`.
 *   - DKIM that cannot be seen is a warning, not a failure: selectors are free
 *     text and a mailbox host may use one we cannot guess.
 */

export type AuthCheckState = "pass" | "warn" | "fail" | "unchecked";

export type MailHost =
  | "google_workspace"
  | "microsoft365"
  | "hostinger"
  | "godaddy"
  | "zoho"
  | "titan"
  | "yahoo"
  | "proton"
  | "zimbra"
  | "free_mailbox"
  | "custom"
  | "unknown";

export const MAIL_HOST_LABELS: Record<MailHost, string> = {
  google_workspace: "Google Workspace / Gmail",
  microsoft365: "Microsoft 365 / Outlook",
  hostinger: "Hostinger",
  godaddy: "GoDaddy",
  zoho: "Zoho Mail",
  titan: "Titan / Namecheap Private Email",
  yahoo: "Yahoo Mail",
  proton: "Proton Mail",
  zimbra: "Zimbra",
  free_mailbox: "Free personal mailbox",
  custom: "Custom mail server",
  unknown: "Unknown mail host",
};

export type AuthRecordResult = {
  state: AuthCheckState;
  /** Short status line, safe to show a customer. */
  summary: string;
  /** What was actually observed in DNS, when anything was. */
  observed: string | null;
};

export type MailboxAuthResult = {
  domain: string;
  mailHost: MailHost;
  mailHostLabel: string;
  /** True for gmail.com/outlook.com-style addresses the customer cannot configure. */
  freeMailbox: boolean;
  spf: AuthRecordResult;
  dkim: AuthRecordResult & { selector: string | null };
  dmarc: AuthRecordResult & { policy: string | null };
  overall: AuthCheckState;
  /** One-line explanation of the overall verdict. */
  reason: string;
  /** False only for a hard failure — never for "we could not check". */
  canSend: boolean;
  checkedAt: string;
};

/* ------------------------------------------------------------------ */
/* Free mailbox domains                                               */
/* ------------------------------------------------------------------ */

export const FREE_MAILBOX_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "yandex.com",
] as const;

export function isFreeMailboxDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  return (FREE_MAILBOX_DOMAINS as readonly string[]).includes(d);
}

/** Lowercased domain part of an email address, or null. */
export function mailboxDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return null;
  return email.trim().toLowerCase().slice(at + 1).replace(/^\.+|\.+$/g, "") || null;
}

/* ------------------------------------------------------------------ */
/* Mail host detection from MX                                        */
/* ------------------------------------------------------------------ */

const HOST_PATTERNS: Array<{ host: MailHost; match: RegExp }> = [
  { host: "google_workspace", match: /(aspmx|googlemail|google\.com|gmail-smtp)/ },
  { host: "microsoft365", match: /(mail\.protection\.outlook\.com|outlook\.com|office365)/ },
  { host: "hostinger", match: /hostinger/ },
  { host: "godaddy", match: /(secureserver\.net|godaddy)/ },
  { host: "zoho", match: /zoho/ },
  { host: "titan", match: /(titan\.email|privateemail\.com|spamexperts)/ },
  { host: "yahoo", match: /(yahoodns|yahoo\.com)/ },
  { host: "proton", match: /(protonmail|proton\.me)/ },
  { host: "zimbra", match: /zimbra/ },
];

/**
 * Classifies the mail host from the domain's public MX records.
 *
 * A free personal mailbox wins over MX detection: the customer cannot publish
 * records for a domain they do not own, and that must be said plainly.
 */
export function detectMailHost(domain: string, mxHosts: string[]): MailHost {
  if (isFreeMailboxDomain(domain)) return "free_mailbox";
  const hosts = mxHosts.map((h) => h.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean);
  if (hosts.length === 0) return "unknown";
  for (const entry of HOST_PATTERNS) {
    if (hosts.some((h) => entry.match.test(h))) return entry.host;
  }
  return "custom";
}

/* ------------------------------------------------------------------ */
/* DKIM selectors                                                     */
/* ------------------------------------------------------------------ */

/** Selectors seen across mail hosts, probed in parallel. */
export const COMMON_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",
  "selector2",
  "k1",
  "k2",
  "s1",
  "s2",
  "mail",
  "dkim",
  "smtp",
  "mandrill",
] as const;

const HOST_SELECTORS: Partial<Record<MailHost, string[]>> = {
  google_workspace: ["google", "default"],
  microsoft365: ["selector1", "selector2"],
  hostinger: ["hostingermail-a", "hostingermail-b", "hostingermail-c", "default"],
  godaddy: ["default", "dkim", "email"],
  zoho: ["zoho", "zmail", "default"],
  titan: ["titan1", "titan2", "default"],
  yahoo: ["s1024", "default"],
  proton: ["protonmail", "protonmail2", "protonmail3"],
  zimbra: ["zimbra", "default"],
};

/** The selector list to probe for a domain, host-specific ones first. */
export function dkimSelectorsFor(host: MailHost): string[] {
  const specific = HOST_SELECTORS[host] ?? [];
  const merged = [...specific, ...COMMON_DKIM_SELECTORS];
  return Array.from(new Set(merged));
}

/* ------------------------------------------------------------------ */
/* SPF                                                                */
/* ------------------------------------------------------------------ */

const LOOKUP_MECHANISMS = /\b(include:|a:|mx:|ptr|exists:|redirect=)/g;

/**
 * Evaluates the root TXT records for SPF.
 *
 * `null` means the lookup could not be completed — reported as `unchecked`.
 */
export function evaluateSpf(txtValues: string[] | null): AuthRecordResult {
  if (txtValues === null) {
    return {
      state: "unchecked",
      summary: "We could not read this domain's DNS just now. We will check again automatically.",
      observed: null,
    };
  }
  // Identical values are collapsed first: several resolvers answering the same
  // record must never be reported to the customer as a duplicate record.
  const records = Array.from(
    new Set(
      txtValues
        .map((value) => value.trim().toLowerCase().replace(/\s+/g, " "))
        .filter((value) => value.startsWith("v=spf1")),
    ),
  );

  if (records.length === 0) {
    return {
      state: "fail",
      summary: "No SPF record found. Mail servers cannot confirm who may send for this domain.",
      observed: null,
    };
  }
  if (records.length > 1) {
    return {
      state: "fail",
      summary: `This domain publishes ${records.length} SPF records. Only one is allowed — mail servers treat extra records as an error.`,
      observed: records.join(" | "),
    };
  }

  const record = records[0]!;
  if (/[\s+]all/.test(record) && /(\s|^)\+?all/.test(record) && !/[~\-?]all/.test(record)) {
    return {
      state: "warn",
      summary: "SPF record found, but it allows any server to send for this domain (+all).",
      observed: record,
    };
  }

  const lookups = (record.match(LOOKUP_MECHANISMS) ?? []).length;
  if (lookups > 10) {
    return {
      state: "warn",
      summary: `SPF record found, but it looks up ${lookups} other records — above the limit of 10, which can make checks fail.`,
      observed: record,
    };
  }

  return { state: "pass", summary: "SPF record found and valid.", observed: record };
}

/* ------------------------------------------------------------------ */
/* DKIM                                                               */
/* ------------------------------------------------------------------ */

export type DkimProbe = { selector: string; value: string };

/**
 * Evaluates a DKIM probe result.
 *
 * Nothing found is a warning, never a failure: a mail host can use a selector
 * we do not know about, and claiming "no DKIM" from that would be wrong.
 */
export function evaluateDkim(
  found: DkimProbe | null,
  lookupCompleted: boolean,
): AuthRecordResult & { selector: string | null } {
  if (!lookupCompleted) {
    return {
      state: "unchecked",
      summary: "We could not read this domain's DNS just now. We will check again automatically.",
      observed: null,
      selector: null,
    };
  }
  if (!found) {
    return {
      state: "warn",
      summary:
        "No DKIM key found on the selectors we can check. Turn DKIM on with your mail host — without it more of your mail is filtered.",
      observed: null,
      selector: null,
    };
  }
  const value = found.value.trim().toLowerCase();
  const isCname = !value.startsWith("v=dkim1") && !value.includes("p=");
  if (isCname) {
    return {
      state: "pass",
      summary: `DKIM is set up on selector "${found.selector}".`,
      observed: found.value,
      selector: found.selector,
    };
  }
  const key = value.match(/p=([^;\s]*)/)?.[1] ?? "";
  if (key.length === 0) {
    return {
      state: "fail",
      summary: `The DKIM record on selector "${found.selector}" has no signing key, so signing is broken.`,
      observed: found.value,
      selector: found.selector,
    };
  }
  return {
    state: "pass",
    summary: `DKIM key found on selector "${found.selector}".`,
    observed: found.value,
    selector: found.selector,
  };
}

/* ------------------------------------------------------------------ */
/* DMARC                                                              */
/* ------------------------------------------------------------------ */

export function evaluateDmarc(
  txtValues: string[] | null,
): AuthRecordResult & { policy: string | null } {
  if (txtValues === null) {
    return {
      state: "unchecked",
      summary: "We could not read this domain's DNS just now. We will check again automatically.",
      observed: null,
      policy: null,
    };
  }
  // Identical values collapse first — see the note in `evaluateSpf`.
  const records = Array.from(
    new Set(
      txtValues
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter((value) => value.toLowerCase().startsWith("v=dmarc1")),
    ),
  );

  if (records.length === 0) {
    const stray = txtValues.find((value) => value.toLowerCase().includes("dmarc"));
    return {
      state: "warn",
      summary: stray
        ? "A DMARC record exists but does not start with v=DMARC1, so mail servers ignore it."
        : "No DMARC record found. Adding one is recommended — it tells mail servers how to treat mail that fails the checks.",
      observed: stray ?? null,
      policy: null,
    };
  }
  if (records.length > 1) {
    return {
      state: "warn",
      summary: `This domain publishes ${records.length} DMARC records. Only one is allowed — mail servers ignore all of them.`,
      observed: records.join(" | "),
      policy: null,
    };
  }

  const record = records[0]!;
  const policy = record.toLowerCase().match(/\bp\s*=\s*(none|quarantine|reject)\b/)?.[1] ?? null;
  if (!policy) {
    return {
      state: "warn",
      summary: "A DMARC record exists but has no policy (p=), so mail servers ignore it.",
      observed: record,
      policy: null,
    };
  }
  return {
    state: "pass",
    summary: `DMARC record found with policy "${policy}".`,
    observed: record,
    policy,
  };
}

/* ------------------------------------------------------------------ */
/* Overall verdict                                                    */
/* ------------------------------------------------------------------ */

/**
 * Folds the three record results into one verdict.
 *
 * Only a definite problem blocks sending: a missing/duplicated SPF record or a
 * broken DKIM key. Missing DMARC and undetectable DKIM are warnings.
 */
export function overallAuthVerdict(input: {
  freeMailbox: boolean;
  spf: AuthRecordResult;
  dkim: AuthRecordResult;
  dmarc: AuthRecordResult;
}): { overall: AuthCheckState; reason: string; canSend: boolean } {
  if (input.freeMailbox) {
    return {
      overall: "fail",
      reason:
        "This is a free personal mailbox. You cannot publish authentication records for it, so it is not safe for outreach — use a mailbox on your own domain.",
      canSend: false,
    };
  }
  const parts = [input.spf, input.dkim, input.dmarc];
  const failed = parts.find((part) => part.state === "fail");
  if (failed) return { overall: "fail", reason: failed.summary, canSend: false };

  if (parts.every((part) => part.state === "unchecked")) {
    return {
      overall: "unchecked",
      reason: "We could not check this domain's DNS just now. Sending is not blocked — we retry automatically.",
      canSend: true,
    };
  }
  const warned = parts.find((part) => part.state === "warn");
  if (warned) return { overall: "warn", reason: warned.summary, canSend: true };

  return {
    overall: "pass",
    reason: "SPF, DKIM and DMARC are all published correctly for this domain.",
    canSend: true,
  };
}

export const AUTH_STATE_LABELS: Record<AuthCheckState, string> = {
  pass: "Passing",
  warn: "Needs attention",
  fail: "Failing",
  unchecked: "Not checked yet",
};
