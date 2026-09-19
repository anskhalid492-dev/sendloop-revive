/**
 * Mailbox domain authentication — lookups and persistence.
 *
 * Reads the customer's PUBLIC DNS through the shared resolver layer (Google +
 * Cloudflare over DoH, cache-busted), independently of their mail host. It never
 * writes DNS and never claims a record is missing when the lookup failed.
 */
import {
  TransientDnsError,
  lookupPublicCname,
  lookupPublicMx,
  lookupPublicTxt,
} from "@/lib/dns.server";
import {
  detectMailHost,
  dkimSelectorsFor,
  evaluateDkim,
  evaluateDmarc,
  evaluateSpf,
  isFreeMailboxDomain,
  mailboxDomainOf,
  MAIL_HOST_LABELS,
  overallAuthVerdict,
  type DkimProbe,
  type MailboxAuthResult,
} from "@/lib/mailbox-auth-check";
import { providerSendingLimit } from "@/lib/mailbox-provider-limits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** A lookup that could not be completed returns null, never an empty answer. */
async function safeTxt(name: string): Promise<string[] | null> {
  try {
    return await lookupPublicTxt(name);
  } catch (error) {
    if (error instanceof TransientDnsError) return null;
    return null;
  }
}

async function probeDkim(
  domain: string,
  selectors: string[],
): Promise<{ found: DkimProbe | null; completed: boolean }> {
  let completed = false;
  const probe = async (selector: string): Promise<DkimProbe | null> => {
    const name = `${selector}._domainkey.${domain}`;
    const [txt, cname] = await Promise.all([safeTxt(name), safeCname(name)]);
    if (txt !== null || cname !== null) completed = true;
    const txtHit = (txt ?? []).find((value) => value.includes("p=") || value.includes("v=dkim1"));
    if (txtHit) return { selector, value: txtHit };
    const cnameHit = (cname ?? [])[0];
    if (cnameHit) return { selector, value: cnameHit };
    return null;
  };

  // Probed in bounded batches so one mailbox check cannot fan out unbounded.
  for (let i = 0; i < selectors.length; i += 6) {
    const batch = selectors.slice(i, i + 6);
    const results = await Promise.all(batch.map(probe));
    const hit = results.find((result): result is DkimProbe => result !== null);
    if (hit) return { found: hit, completed: true };
  }
  return { found: null, completed };
}

async function safeCname(name: string): Promise<string[] | null> {
  try {
    return await lookupPublicCname(name);
  } catch {
    return null;
  }
}

async function safeMx(domain: string): Promise<string[] | null> {
  try {
    const records = await lookupPublicMx(domain);
    return records.map((record) => record.host);
  } catch {
    return null;
  }
}

/**
 * Runs the full authentication check for one mailbox address.
 *
 * Read-only: it observes DNS and returns a verdict. Nothing is published, and a
 * resolver outage produces `unchecked`, never a failure.
 */
export async function checkMailboxDomainAuth(email: string): Promise<MailboxAuthResult> {
  const domain = mailboxDomainOf(email);
  if (!domain) throw new Error("That does not look like an email address.");

  const free = isFreeMailboxDomain(domain);
  const mxHosts = await safeMx(domain);
  const mailHost = detectMailHost(domain, mxHosts ?? []);
  const selectors = dkimSelectorsFor(mailHost);

  const [spfTxt, dmarcTxt, dkim] = await Promise.all([
    safeTxt(domain),
    safeTxt(`_dmarc.${domain}`),
    probeDkim(domain, selectors),
  ]);

  const spf = evaluateSpf(spfTxt);
  const dkimResult = evaluateDkim(dkim.found, dkim.completed || spfTxt !== null);
  const dmarc = evaluateDmarc(dmarcTxt);
  const verdict = overallAuthVerdict({ freeMailbox: free, spf, dkim: dkimResult, dmarc });

  return {
    domain,
    mailHost,
    mailHostLabel: MAIL_HOST_LABELS[mailHost],
    freeMailbox: free,
    spf,
    dkim: dkimResult,
    dmarc,
    ...verdict,
    checkedAt: new Date().toISOString(),
  };
}

/** True when a write failed only because the auth columns are not deployed yet. */
function missingColumn(error: { code?: string | null } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export type MailboxAuthPersistOptions = {
  /** Previous stored status, used so a first sweep can report without alerting twice. */
  previousStatus?: string | null;
  /** When true, a repeated hard failure alerts the workspace. */
  allowPause?: boolean;
  /** Used to notify the workspace when a domain stops authenticating. */
  workspaceId?: string | null;
  /** Shown in the alert. */
  emailAddress?: string | null;
};

/** Tells the workspace, in plain language, that a mailbox is held out of sending. */
async function notifyAuthHold(
  admin: Admin,
  workspaceId: string,
  mailboxId: string,
  emailAddress: string | null,
  reason: string,
): Promise<void> {
  try {
    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId);
    const rows = ((members ?? []) as { user_id: string }[]).map((member) => ({
      user_id: member.user_id,
      workspace_id: workspaceId,
      type: "mailbox",
      title: `${emailAddress ?? "A mailbox"} is paused for sending`,
      message: `${reason} Replies still arrive in your inbox. Fix the records, then re-check the mailbox.`.slice(
        0,
        500,
      ),
      entity_type: "mailbox",
      entity_id: mailboxId,
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  } catch (error) {
    console.error("[mailbox-auth] could not notify workspace", error);
  }
}

/**
 * Stores the result on the mailbox row.
 *
 * Tolerant of the auth columns not being deployed yet: the check still runs and
 * is returned to the caller, it just is not persisted.
 *
 * A failing domain is held out of campaign sending through `auth_status` only —
 * the mailbox connection itself stays active so replies and bounces keep syncing
 * into the Unified Inbox — and the workspace is told why.
 */
export async function persistMailboxAuth(
  admin: Admin,
  mailboxId: string,
  result: MailboxAuthResult,
  options: MailboxAuthPersistOptions = {},
): Promise<{ stored: boolean; paused: boolean }> {
  const limit = providerSendingLimit(result.mailHost);
  // A first check only ever reports. Sending is withheld from the SECOND
  // consecutive hard failure, so a backfill can never interrupt a live campaign.
  const pause =
    options.allowPause === true && result.overall === "fail" && options.previousStatus === "fail";

  const patch: Record<string, unknown> = {
    auth_status: result.overall,
    auth_reason: result.reason,
    spf_status: result.spf.state,
    dkim_status: result.dkim.state,
    dkim_selector_found: result.dkim.selector,
    dmarc_status: result.dmarc.state,
    dmarc_policy: result.dmarc.policy,
    mail_host: result.mailHost,
    provider_daily_ceiling: limit.dailyCeiling,
    auth_detail: result as unknown as Record<string, unknown>,
    auth_checked_at: result.checkedAt,
  };

  const { error } = await admin.from("mailboxes").update(patch).eq("id", mailboxId);
  if (error) {
    if (missingColumn(error)) return { stored: false, paused: false };
    throw new Error(error.message);
  }
  if (pause && options.workspaceId) {
    await notifyAuthHold(
      admin,
      options.workspaceId,
      mailboxId,
      options.emailAddress ?? null,
      result.reason,
    );
  }
  return { stored: true, paused: pause };
}


export type MailboxAuthRow = {
  id: string;
  email_address: string;
  auth_status?: string | null;
  auth_checked_at?: string | null;
  is_active?: boolean | null;
};

/**
 * Loads the mailboxes due for a re-check, oldest first.
 *
 * Returns an empty list when the auth columns are not deployed yet rather than
 * failing the runner.
 */
export async function mailboxesDueForAuthCheck(
  admin: Admin,
  limit: number,
): Promise<MailboxAuthRow[] | null> {
  const { data, error } = await admin
    .from("mailboxes")
    .select("id, email_address, auth_status, auth_checked_at, is_active")
    .order("auth_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    if (missingColumn(error)) return null;
    throw new Error(error.message);
  }
  return (data ?? []) as MailboxAuthRow[];
}

/** Checks a batch, reusing one DNS result per domain. */
export async function runMailboxAuthSweep(
  admin: Admin,
  limit: number,
): Promise<{ checked: number; pass: number; warn: number; fail: number; paused: number; skipped: string | null }> {
  const rows = await mailboxesDueForAuthCheck(admin, limit);
  if (rows === null) {
    return { checked: 0, pass: 0, warn: 0, fail: 0, paused: 0, skipped: "auth columns not deployed" };
  }

  const cache = new Map<string, MailboxAuthResult>();
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let paused = 0;

  for (const row of rows) {
    const domain = mailboxDomainOf(row.email_address);
    if (!domain) continue;
    try {
      let result = cache.get(domain);
      if (!result) {
        result = await checkMailboxDomainAuth(row.email_address);
        cache.set(domain, result);
      }
      const stored = await persistMailboxAuth(admin, row.id, result, {
        previousStatus: row.auth_status ?? null,
        allowPause: true,
      });
      if (stored.paused) paused += 1;
      if (result.overall === "pass") pass += 1;
      else if (result.overall === "warn") warn += 1;
      else if (result.overall === "fail") fail += 1;
    } catch (error) {
      console.error(`[mailbox-auth] check failed for ${row.email_address}`, error);
    }
  }

  return { checked: rows.length, pass, warn, fail, paused, skipped: null };
}
