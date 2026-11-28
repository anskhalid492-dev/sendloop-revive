/**
 * Microsoft 365 mailboxes through Microsoft Graph (delegated Mail.Send / Mail.Read).
 *
 * A Graph mailbox is an ordinary `mailboxes` row whose smtp_host/imap_host hold the
 * GRAPH_HOST marker and whose password columns stay null, so no mailboxes schema
 * change is needed and SMTP AUTH is never used. Tokens live only in
 * `microsoft_mailbox_tokens.encrypted_tokens` (AES-GCM, PROVIDER_CREDENTIALS_KEY),
 * readable by the service role only. Token and provider bodies are never logged.
 */
import { z } from "zod";
import type { MicrosoftConfig, MicrosoftTokenGrant, MicrosoftTransaction } from "@/lib/microsoft-oauth.server";
import type { RelayCheckedMessage } from "@/lib/mailbox-relay.server";

export const GRAPH_HOST = "graph.microsoft.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
const REFRESH_SKEW_MS = 2 * 60_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export function isGraphMailbox(row: { smtp_host?: string | null; imap_host?: string | null }): boolean {
  return row.smtp_host === GRAPH_HOST || row.imap_host === GRAPH_HOST;
}

/** Only Microsoft-hosted legacy connections can be upgraded in place by Microsoft consent. */
export function isMicrosoftSmtpMailbox(row: { smtp_host?: string | null; imap_host?: string | null }): boolean {
  const smtp = row.smtp_host?.trim().toLowerCase();
  const imap = row.imap_host?.trim().toLowerCase();
  return ["smtp.office365.com", "smtp-mail.outlook.com", "smtp.outlook.com"].includes(smtp ?? "") &&
    ["outlook.office365.com", "imap-mail.outlook.com", "imap.outlook.com"].includes(imap ?? "");
}

type StoredTokens = { accessToken: string; refreshToken: string; expiresAt: number };
type TokenRow = { mailbox_id: string; encrypted_tokens: string | null; token_version: number; status: string };

export class MicrosoftReauthRequired extends Error {}
export class MicrosoftInboxVerificationError extends Error {}

async function crypto_() { return import("@/lib/provider-credentials.server"); }

/** Refreshes with the stored refresh token; Microsoft rotates it, so the new one replaces the old. */
export async function refreshTokens(config: MicrosoftConfig, refreshToken: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<StoredTokens> {
  const { MICROSOFT_SCOPES, parseTokenResponse } = await import("@/lib/microsoft-oauth.server");
  const response = await fetcher(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      grant_type: "refresh_token", refresh_token: refreshToken, scope: MICROSOFT_SCOPES.join(" ") }),
  });
  if (response.status === 400 || response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant" || body.error === "interaction_required" || body.error === "consent_required") {
      throw new MicrosoftReauthRequired("Microsoft sign-in expired or was revoked. Reconnect the mailbox.");
    }
  }
  if (!response.ok) throw new Error(`Microsoft token refresh failed (${response.status}).`);
  const raw = (await response.json()) as Record<string, unknown>;
  // Microsoft may omit a new refresh token; keep the current one then.
  const t = parseTokenResponse({ refresh_token: refreshToken, ...raw }, now);
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt };
}

/**
 * Returns a valid access token, refreshing when it is near expiry. The write is a
 * compare-and-swap on token_version: when a parallel worker already rotated the
 * refresh token, its result is re-read instead of overwritten.
 */
export async function getGraphAccessToken(admin: Admin, mailboxId: string, deps: { config?: MicrosoftConfig; fetcher?: typeof fetch; now?: number } = {}): Promise<string> {
  const now = deps.now ?? Date.now();
  const { encryptCredentials, decryptCredentials } = await crypto_();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin.from("microsoft_mailbox_tokens")
      .select("mailbox_id, encrypted_tokens, token_version, status").eq("mailbox_id", mailboxId).maybeSingle();
    if (error) throw new Error("Microsoft mailbox credentials could not be read.");
    const row = data as TokenRow | null;
    if (!row?.encrypted_tokens || row.status === "revoked") throw new MicrosoftReauthRequired("This Microsoft mailbox is not connected. Reconnect it.");
    const tokens = decryptCredentials<StoredTokens>(row.encrypted_tokens);
    if (tokens.expiresAt - REFRESH_SKEW_MS > now) return tokens.accessToken;
    const { microsoftConfigFromEnv } = await import("@/lib/microsoft-oauth.server");
    let next: StoredTokens;
    try {
      next = await refreshTokens(deps.config ?? microsoftConfigFromEnv(), tokens.refreshToken, deps.fetcher, now);
    } catch (e) {
      if (e instanceof MicrosoftReauthRequired) {
        await admin.from("microsoft_mailbox_tokens").update({ status: "revoked", encrypted_tokens: null, last_error: e.message })
          .eq("mailbox_id", mailboxId).eq("token_version", row.token_version);
        await admin.from("mailboxes").update({ status: "failed" }).eq("id", mailboxId);
      }
      throw e;
    }
    const { data: swapped } = await admin.from("microsoft_mailbox_tokens")
      .update({ encrypted_tokens: encryptCredentials(next), token_version: row.token_version + 1,
        access_expires_at: new Date(next.expiresAt).toISOString(), last_error: null })
      .eq("mailbox_id", mailboxId).eq("token_version", row.token_version).select("mailbox_id");
    if ((swapped ?? []).length === 1) return next.accessToken;
  }
  throw new Error("Microsoft token refresh conflicted repeatedly; try again.");
}

async function graph(token: string, path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetcher(`${GRAPH}${path}`, { ...init, headers, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(15_000) });
}

/**
 * Non-secret claims of a Graph access token for diagnostics. Personal Microsoft account
 * tokens are usually opaque (not a readable JWT), which is reported as such. Never returns the token.
 */
export function accessTokenClaims(token: string): { format: string; scp: string | null; aud: string | null; tid: string | null } {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return { format: parts.length === 5 ? "encrypted (JWE)" : "opaque", scp: null, aud: null, tid: null };
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const c = z.object({ scp: z.string().nullish(), aud: z.string().nullish(), tid: z.string().nullish() }).safeParse(JSON.parse(json));
    if (!c.success) return { format: "jwt (unreadable claims)", scp: null, aud: null, tid: null };
    return { format: "jwt", scp: c.data.scp ?? null, aud: c.data.aud ?? null, tid: c.data.tid ?? null };
  } catch { return { format: "jwt (unreadable claims)", scp: null, aud: null, tid: null }; }
}

/** Server-log-only diagnostics for a failed Graph call: full error body plus token scp/aud, never the token itself. */
export function logGraphFailure(context: string, response: Response, bodyText: string, token?: string) {
  console.error(`[microsoft-graph] ${context} failed`, JSON.stringify({
    status: response.status,
    body: bodyText.slice(0, 4000),
    wwwAuthenticate: response.headers.get("www-authenticate"),
    requestId: response.headers.get("request-id"),
    clientRequestId: response.headers.get("client-request-id"),
    token: token ? accessTokenClaims(token) : null,
  }));
}

/** Only allowlisted error codes are exposed to the user; the full Graph body goes to server logs only. */
export async function inboxVerificationFailure(response: Response, token?: string): Promise<{ status: number; code: string; message: string }> {
  const bodyText = await response.text().catch(() => "");
  logGraphFailure("inbox check", response, bodyText, token);
  let body: unknown = null;
  try { body = JSON.parse(bodyText); } catch { body = null; }
  const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(body);
  const known: Record<string, string> = {
    ErrorAccessDenied: "Microsoft denied inbox access. Check delegated Mail.Read consent and your organization's access policies.",
    Authorization_RequestDenied: "Microsoft denied inbox access. Check delegated Mail.Read consent and your organization's access policies.",
    InvalidAuthenticationToken: "Microsoft rejected the inbox authorization. Start Microsoft sign-in again.",
    MailboxNotEnabledForRESTAPI: "Microsoft reports this account's mailbox is unavailable through Graph. Confirm that Outlook web opens the mailbox; organizational accounts may require an Exchange Online mailbox.",
    ErrorMailboxNotEnabledForRESTAPI: "Microsoft reports this account's mailbox is unavailable through Graph. Confirm that Outlook web opens the mailbox; organizational accounts may require an Exchange Online mailbox.",
    ErrorItemNotFound: "Microsoft could not find this account's inbox. Confirm the mailbox opens in Outlook web.",
    TooManyRequests: "Microsoft temporarily limited inbox requests. Wait and try Microsoft sign-in again.",
    OrganizationFromTenantGuidNotFound: "Microsoft signed this account in through an organization directory that has no Outlook mailbox. Personal Outlook.com accounts must sign in as a personal Microsoft account.",
  };
  const rawCode = parsed.success ? parsed.data.error.code : "";
  const code = Object.hasOwn(known, rawCode) ? rawCode : "Unspecified";
  const detail = known[code] ?? (response.status >= 500 ? "Microsoft's inbox service is temporarily unavailable. Try again later." : "Microsoft inbox access could not be verified. Check the mailbox in Outlook web and its delegated Mail.Read consent.");
  return { status: response.status, code, message: `${detail} (HTTP ${response.status}; ${code}).` };
}

export type GraphOutbound = {
  from: string; fromName?: string | null; to: string; envelopeTo?: string[]; subject: string;
  html?: string | null; text?: string | null; headers?: Record<string, string>;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
};

const addr = (address: string) => ({ emailAddress: { address } });
function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}
function splitList(v: string | undefined): string[] {
  return (v ?? "").split(",").map(s => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase()).filter(Boolean);
}

/** Builds the sendMail payload. Graph only accepts custom X- headers; standard headers are set by Exchange. */
export function buildGraphMessage(m: GraphOutbound, sendKey: string) {
  const to = m.to.trim().toLowerCase();
  const cc = splitList(headerValue(m.headers, "Cc")).filter(a => a !== to);
  const bcc = (m.envelopeTo ?? []).map(a => a.trim().toLowerCase()).filter(a => a && a !== to && !cc.includes(a));
  const custom = Object.entries(m.headers ?? {})
    .filter(([k]) => /^x-/i.test(k)).slice(0, 4).map(([name, value]) => ({ name, value: String(value).slice(0, 900) }));
  custom.push({ name: "X-MunchReach-Send-Key", value: sendKey });
  return {
    message: {
      subject: m.subject,
      body: m.html ? { contentType: "HTML", content: m.html } : { contentType: "Text", content: m.text ?? "" },
      toRecipients: [addr(to)],
      ...(cc.length ? { ccRecipients: cc.map(addr) } : {}),
      ...(bcc.length ? { bccRecipients: bcc.map(addr) } : {}),
      internetMessageHeaders: custom,
      ...(m.attachments?.length ? { attachments: m.attachments.map(a => ({
        "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename, contentType: a.contentType, contentBytes: a.contentBase64 })) } : {}),
    },
    saveToSentItems: true,
  };
}

/** Sends via POST /me/sendMail (Mail.Send; no SMTP AUTH) and then finds the Internet Message-ID in Sent Items (Mail.Read). */
export async function sendViaGraph(admin: Admin, mailboxId: string, m: GraphOutbound, deps: { fetcher?: typeof fetch; lookupDelaysMs?: number[] } = {}) {
  try {
    const token = await getGraphAccessToken(admin, mailboxId, { ...(deps.fetcher ? { fetcher: deps.fetcher } : {}) });
    const sendKey = crypto.randomUUID();
    const res = await graph(token, "/me/sendMail", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGraphMessage(m, sendKey)) }, deps.fetcher);
    if (res.status !== 202) {
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      return { ok: false, message: `Microsoft rejected the send (${res.status}${body.error?.code ? ` ${body.error.code}` : ""}): ${(body.error?.message ?? "").slice(0, 300)}`.trim(), messageId: null };
    }
    let messageId: string | null = null;
    for (const delay of deps.lookupDelaysMs ?? [1500, 3000]) {
      await new Promise(r => setTimeout(r, delay));
      messageId = await findSentMessageId(token, sendKey, deps.fetcher).catch(() => null);
      if (messageId) break;
    }
    return { ok: true, message: "Accepted by Microsoft 365.", messageId };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Microsoft send failed.", messageId: null };
  }
}

async function findSentMessageId(token: string, sendKey: string, fetcher?: typeof fetch): Promise<string | null> {
  const res = await graph(token, "/me/mailFolders/sentitems/messages?$top=10&$orderby=sentDateTime desc&$select=internetMessageId,internetMessageHeaders", {}, fetcher);
  if (!res.ok) return null;
  const body = (await res.json()) as { value?: { internetMessageId?: string; internetMessageHeaders?: { name: string; value: string }[] }[] };
  const hit = (body.value ?? []).find(v => v.internetMessageHeaders?.some(h => h.name.toLowerCase() === "x-munchreach-send-key" && h.value === sendKey));
  return hit?.internetMessageId ?? null;
}

const graphMessage = z.object({
  id: z.string(), internetMessageId: z.string().nullish(), subject: z.string().nullish(), receivedDateTime: z.string(),
  from: z.object({ emailAddress: z.object({ address: z.string().nullish(), name: z.string().nullish() }) }).nullish(),
  toRecipients: z.array(z.object({ emailAddress: z.object({ address: z.string().nullish() }) })).nullish(),
  body: z.object({ content: z.string().nullish(), contentType: z.string().nullish() }).nullish(),
  internetMessageHeaders: z.array(z.object({ name: z.string(), value: z.string() })).nullish(),
});
export type GraphMessage = z.infer<typeof graphMessage>;

/** Maps a Graph message onto the relay shape the existing reply/bounce/warmup pipeline already processes. */
export function toRelayMessage(m: GraphMessage, uid: number): RelayCheckedMessage {
  const h = (n: string) => m.internetMessageHeaders?.find(x => x.name.toLowerCase() === n)?.value ?? null;
  const from = m.from?.emailAddress;
  return {
    uid, messageId: m.internetMessageId ?? h("message-id"), inReplyTo: h("in-reply-to"), references: h("references"),
    from: from?.address ? (from.name ? `${from.name} <${from.address}>` : from.address) : null,
    to: m.toRecipients?.[0]?.emailAddress.address ?? null, subject: m.subject ?? null, date: m.receivedDateTime,
    text: m.body?.content ?? null, contentType: "text/plain; charset=utf-8", contentTransferEncoding: "8bit",
  };
}

/** Lists messages received strictly after the cursor, oldest first (max 50 per run). */
export async function listGraphMessages(token: string, folder: "inbox" | "junkemail", since: string, fetcher?: typeof fetch) {
  const q = new URLSearchParams({ $filter: `receivedDateTime gt ${since}`, $orderby: "receivedDateTime asc", $top: "50",
    $select: "id,internetMessageId,subject,receivedDateTime,from,toRecipients,body,internetMessageHeaders" });
  const res = await graph(token, `/me/mailFolders/${folder}/messages?${q}`, { headers: { Prefer: 'outlook.body-content-type="text"' } }, fetcher);
  if (!res.ok) throw new Error(`Microsoft inbox read failed (${res.status}).`);
  const body = (await res.json()) as { value?: unknown[] };
  return (body.value ?? []).map(v => graphMessage.parse(v));
}

/**
 * A mailbox stays bound to the Microsoft account that first passed the inbox check.
 * Tokens from attempts that never verified (e.g. a wrong-tenant sign-in) may be replaced.
 */
export function microsoftIdentityConflict(
  prior: { microsoft_user_id: string | null; verified_at?: string | null } | null | undefined,
  microsoftUserId: string,
): boolean {
  if (!prior || !prior.verified_at) return false;
  return prior.microsoft_user_id !== microsoftUserId;
}

/**
 * Persists a completed authorization. The mailbox is marked connected only after
 * the tokens are stored encrypted AND a Mail.Read call made with the stored,
 * decrypted token succeeds.
 */
export async function connectMicrosoftMailbox(admin: Admin, tx: MicrosoftTransaction, grant: MicrosoftTokenGrant, deps: { fetcher?: typeof fetch; now?: number } = {}) {
  const now = deps.now ?? Date.now();
  const { data: member } = await admin.from("workspace_members").select("user_id")
    .eq("workspace_id", tx.workspaceId).eq("user_id", tx.userId).maybeSingle();
  if (!member) throw new Error("You no longer have access to this workspace.");
  const email = grant.profile.email;
  const { data: existing } = await admin.from("mailboxes").select("id, smtp_host, imap_host")
    .eq("workspace_id", tx.workspaceId).eq("email_address", email).maybeSingle();
  if (existing && !isGraphMailbox(existing) && !isMicrosoftSmtpMailbox(existing)) {
    throw new Error("This address already uses another mail provider. Its connection was left unchanged.");
  }
  let mailboxId: string = existing?.id;
  if (!existing) {
    const { requireMailboxCapacity } = await import("@/lib/billing/gates.server");
    await requireMailboxCapacity(tx.workspaceId, 1);
    const { data: created, error } = await admin.from("mailboxes").insert({
      workspace_id: tx.workspaceId, email_address: email, display_name: grant.profile.displayName,
      smtp_host: GRAPH_HOST, smtp_port: 443, smtp_secure: true, smtp_username: email, smtp_password: null,
      imap_host: GRAPH_HOST, imap_port: 443, imap_secure: true, imap_username: email, imap_password: null,
      status: "pending", warmup_enabled: false,
    }).select("id").single();
    if (error || !created) throw new Error("The mailbox could not be saved.");
    mailboxId = created.id;
  }
  const { data: prior } = await admin.from("microsoft_mailbox_tokens").select("microsoft_user_id, token_version, inbox_cursor, verified_at")
    .eq("mailbox_id", mailboxId).maybeSingle();
  if (microsoftIdentityConflict(prior, grant.profile.id)) throw new Error("A different Microsoft account signed in for this mailbox.");
  const { encryptCredentials } = await crypto_();
  const { error: tokenError } = await admin.from("microsoft_mailbox_tokens").upsert({
    mailbox_id: mailboxId, workspace_id: tx.workspaceId, microsoft_user_id: grant.profile.id, email_address: email,
    encrypted_tokens: encryptCredentials({ accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresAt: grant.expiresAt }),
    access_expires_at: new Date(grant.expiresAt).toISOString(), token_version: (prior?.token_version ?? 0) + 1,
    status: "pending", last_error: null, granted_scopes: grant.scope,
    // Never import old mail on first connect; reconnect resumes from the saved position.
    inbox_cursor: prior?.inbox_cursor ?? new Date(now).toISOString(),
    junk_cursor: prior ? undefined : new Date(now).toISOString(),
  }, { onConflict: "mailbox_id" });
  if (tokenError) throw new Error("Microsoft credentials could not be stored securely. No mailbox was connected.");
  const token = await getGraphAccessToken(admin, mailboxId, { ...(deps.fetcher ? { fetcher: deps.fetcher } : {}), now });
  const check = await graph(token, "/me/mailFolders/inbox/messages?$top=1", {}, deps.fetcher);
  if (!check.ok) {
    const failure = await inboxVerificationFailure(check, token);
    await admin.from("microsoft_mailbox_tokens").update({ status: "error", last_error: failure.message }).eq("mailbox_id", mailboxId);
    throw new MicrosoftInboxVerificationError(failure.message);
  }
  const verifiedAt = new Date(now).toISOString();
  const { error: verifiedError } = await admin.from("microsoft_mailbox_tokens")
    .update({ status: "connected", verified_at: verifiedAt }).eq("mailbox_id", mailboxId);
  if (verifiedError) throw new Error("Microsoft connection verification could not be saved.");
  // Switch the existing row only AFTER encrypted-token storage and inbox verification.
  // Its ID, campaign links, limits, pause state and warmup/history remain untouched.
  const { error: connectedError } = await admin.from("mailboxes").update({
    status: "connected", last_tested_at: verifiedAt,
    smtp_host: GRAPH_HOST, smtp_port: 443, smtp_secure: true, smtp_username: email, smtp_password: null,
    imap_host: GRAPH_HOST, imap_port: 443, imap_secure: true, imap_username: email, imap_password: null,
  }).eq("id", mailboxId).eq("workspace_id", tx.workspaceId);
  if (connectedError) throw new Error("Microsoft mailbox connection could not be saved.");
  return { mailboxId, email };
}

/** Polls Inbox and Junk through Graph into the same processing as IMAP. */
export async function readGraphFolders(admin: Admin, mailboxId: string, fetcher?: typeof fetch) {
  const { data } = await admin.from("microsoft_mailbox_tokens").select("inbox_cursor, junk_cursor").eq("mailbox_id", mailboxId).maybeSingle();
  if (!data) throw new MicrosoftReauthRequired("This Microsoft mailbox is not connected. Reconnect it.");
  const token = await getGraphAccessToken(admin, mailboxId, fetcher ? { fetcher } : {});
  const start = new Date().toISOString();
  const inbox = await listGraphMessages(token, "inbox", data.inbox_cursor ?? start, fetcher);
  const junk = await listGraphMessages(token, "junkemail", data.junk_cursor ?? start, fetcher).catch(() => [] as GraphMessage[]);
  return { inbox, junk };
}

export async function saveGraphCursors(admin: Admin, mailboxId: string, inbox: GraphMessage[], junk: GraphMessage[]) {
  const patch: Record<string, string> = {};
  const last = (l: GraphMessage[]) => l[l.length - 1]?.receivedDateTime;
  if (last(inbox)) patch["inbox_cursor"] = last(inbox)!;
  if (last(junk)) patch["junk_cursor"] = last(junk)!;
  if (Object.keys(patch).length) await admin.from("microsoft_mailbox_tokens").update(patch).eq("mailbox_id", mailboxId);
}
