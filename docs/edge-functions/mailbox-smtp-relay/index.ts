// Supabase Edge Function: mailbox-smtp-relay
//
// Deploy it yourself (this project cannot create edge functions from the editor):
//   mkdir -p supabase/functions/mailbox-smtp-relay
//   cp docs/edge-functions/mailbox-smtp-relay/index.ts supabase/functions/mailbox-smtp-relay/index.ts
//   supabase functions deploy mailbox-smtp-relay --project-ref rihgzkofoxcjljlbvbya
// (or paste this file into Dashboard -> Edge Functions -> New function)
//
// Why this exists: the app runs on Cloudflare Workers, which refuses outbound
// connections to Cloudflare's own IP ranges. Mail servers behind Cloudflare
// (Hostinger and friends) are therefore unreachable from the app itself.
// Supabase Edge Functions run on Deno with no such restriction, so all real
// SMTP/IMAP socket work happens here and the app calls it over HTTPS.
//
// AUTH: never publicly usable. The caller must present the project's
// service-role key as `Authorization: Bearer <key>`. If the optional
// MAILBOX_RELAY_SECRET env var is set on the function, the `x-relay-secret`
// header must match it as well.
//
// Actions:
//   { action: "test", smtp, imap }            -> { ok, smtp, imap, testedAt }
//   { action: "send", smtp, message: {...} }  -> { ok, message, messageId }
//   { action: "check", imap, sinceUid }       -> { ok, message, messages: [...] }

type Security = "ssl" | "tls" | "none";

type Endpoint = {
  host: string;
  port: number;
  security: Security;
  username: string;
  password: string;
};

type ProtocolResult = { ok: boolean; message: string };

const TIMEOUT_MS = 20_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${TIMEOUT_MS / 1000}s`)),
      TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Line-oriented duplex over a Deno TCP/TLS connection, upgradable via STARTTLS. */
class Wire {
  private buffer = "";
  private chunk = new Uint8Array(64 * 1024);

  private constructor(
    private conn: Deno.Conn,
    private readonly host: string,
  ) {}

  static async open(endpoint: Endpoint): Promise<Wire> {
    const conn =
      endpoint.security === "ssl"
        ? await Deno.connectTls({ hostname: endpoint.host, port: endpoint.port })
        : await Deno.connect({ hostname: endpoint.host, port: endpoint.port });
    return new Wire(conn, endpoint.host);
  }

  async send(line: string): Promise<void> {
    await this.conn.write(encoder.encode(`${line}\r\n`));
  }

  async readUntil(done: (buffered: string) => boolean): Promise<string> {
    while (!done(this.buffer)) {
      const read = await this.conn.read(this.chunk);
      if (read === null || read === 0) break;
      this.buffer += decoder.decode(this.chunk.subarray(0, read));
    }
    const text = this.buffer;
    this.buffer = "";
    return text;
  }

  async startTls(): Promise<void> {
    this.conn = await Deno.startTls(this.conn as Deno.TcpConn, { hostname: this.host });
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      // Peer may have closed first.
    }
  }
}

function smtpComplete(text: string): boolean {
  const lines = text.trimEnd().split("\r\n");
  return /^\d{3} /.test(lines[lines.length - 1] ?? "");
}

function smtpCode(text: string): number {
  const lines = text.trimEnd().split("\r\n");
  return Number((lines[lines.length - 1] ?? "").slice(0, 3));
}

function firstLine(text: string): string {
  return text.trim().split("\r\n")[0] ?? text.trim();
}

function base64(value: string): string {
  return btoa(String.fromCharCode(...encoder.encode(value)));
}

/** Opens an SMTP session, upgrades TLS when asked, and authenticates. */
async function smtpAuthenticate(wire: Wire, endpoint: Endpoint): Promise<ProtocolResult> {
  const greeting = await withTimeout(wire.readUntil(smtpComplete), "SMTP greeting");
  if (smtpCode(greeting) !== 220) {
    return { ok: false, message: `SMTP server refused the connection: ${firstLine(greeting)}` };
  }

  await wire.send("EHLO munchreach.com");
  let ehlo = await withTimeout(wire.readUntil(smtpComplete), "SMTP EHLO");
  if (smtpCode(ehlo) !== 250) {
    return { ok: false, message: `SMTP handshake failed: ${firstLine(ehlo)}` };
  }

  if (endpoint.security === "tls") {
    if (!/STARTTLS/i.test(ehlo)) {
      return {
        ok: false,
        message: "SMTP server does not offer STARTTLS on this port — try SSL on port 465.",
      };
    }
    await wire.send("STARTTLS");
    const ready = await withTimeout(wire.readUntil(smtpComplete), "SMTP STARTTLS");
    if (smtpCode(ready) !== 220) {
      return { ok: false, message: `SMTP STARTTLS refused: ${firstLine(ready)}` };
    }
    await wire.startTls();
    await wire.send("EHLO munchreach.com");
    ehlo = await withTimeout(wire.readUntil(smtpComplete), "SMTP EHLO after STARTTLS");
    if (smtpCode(ehlo) !== 250) {
      return { ok: false, message: `SMTP handshake after STARTTLS failed: ${firstLine(ehlo)}` };
    }
  }

  if (!/AUTH[ =-][^\r\n]*(LOGIN|PLAIN)/i.test(ehlo)) {
    return {
      ok: false,
      message:
        "SMTP server did not offer password login (AUTH LOGIN/PLAIN) on this port. Check the port and security setting.",
    };
  }

  await wire.send("AUTH LOGIN");
  const userPrompt = await withTimeout(wire.readUntil(smtpComplete), "SMTP AUTH");
  if (smtpCode(userPrompt) !== 334) {
    return { ok: false, message: `SMTP login not accepted: ${firstLine(userPrompt)}` };
  }

  await wire.send(base64(endpoint.username));
  const passPrompt = await withTimeout(wire.readUntil(smtpComplete), "SMTP username");
  if (smtpCode(passPrompt) !== 334) {
    return { ok: false, message: `SMTP rejected the username: ${firstLine(passPrompt)}` };
  }

  await wire.send(base64(endpoint.password));
  const auth = await withTimeout(wire.readUntil(smtpComplete), "SMTP password");
  if (smtpCode(auth) !== 235) {
    return { ok: false, message: `SMTP login failed: ${firstLine(auth)}` };
  }

  return { ok: true, message: "SMTP login succeeded." };
}

async function testSmtpLogin(endpoint: Endpoint): Promise<ProtocolResult> {
  let wire: Wire | null = null;
  try {
    wire = await withTimeout(Wire.open(endpoint), "SMTP connection");
    const result = await smtpAuthenticate(wire, endpoint);
    if (result.ok) await wire.send("QUIT");
    return result;
  } catch (error) {
    return { ok: false, message: `SMTP error: ${(error as Error).message}` };
  } finally {
    wire?.close();
  }
}

async function testImapLogin(endpoint: Endpoint): Promise<ProtocolResult> {
  let wire: Wire | null = null;
  try {
    wire = await withTimeout(Wire.open(endpoint), "IMAP connection");

    const greeting = await withTimeout(
      wire.readUntil((text) => text.includes("\r\n")),
      "IMAP greeting",
    );
    if (!/^\* (OK|PREAUTH)/i.test(greeting.trim())) {
      return { ok: false, message: `IMAP server refused the connection: ${firstLine(greeting)}` };
    }

    if (endpoint.security === "tls") {
      await wire.send("a0 STARTTLS");
      const ready = await withTimeout(
        wire.readUntil((text) => /a0 (OK|NO|BAD)/i.test(text)),
        "IMAP STARTTLS",
      );
      if (!/a0 OK/i.test(ready)) {
        return { ok: false, message: `IMAP STARTTLS refused: ${firstLine(ready)}` };
      }
      await wire.startTls();
    }

    const escape = (value: string) => value.replace(/(["\\])/g, "\\$1");
    await wire.send(`a1 LOGIN "${escape(endpoint.username)}" "${escape(endpoint.password)}"`);
    const login = await withTimeout(
      wire.readUntil((text) => /a1 (OK|NO|BAD)/i.test(text)),
      "IMAP login",
    );
    if (!/a1 OK/i.test(login)) {
      const failure = login
        .trim()
        .split("\r\n")
        .find((line) => /a1 (NO|BAD)/i.test(line));
      return { ok: false, message: `IMAP login failed: ${failure ?? firstLine(login)}` };
    }

    await wire.send("a2 LOGOUT");
    return { ok: true, message: "IMAP login succeeded." };
  } catch (error) {
    return { ok: false, message: `IMAP error: ${(error as Error).message}` };
  } finally {
    wire?.close();
  }
}

type SendAttachment = {
  filename: string;
  contentType: string;
  /** Base64-encoded content, exactly as the app read it from the picked file. */
  contentBase64: string;
};

type SendMessage = {
  from: string;
  fromName?: string;
  /** Visible To header (and default envelope recipient). */
  to: string;
  /**
   * Every address the message is delivered to: To + Cc + Bcc. Bcc addresses
   * appear here ONLY — never in a header — which is exactly standard Bcc
   * behaviour. Omitted means "just the To address".
   */
  envelopeTo?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: SendAttachment[];
};

function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

/** Base64 payloads must be wrapped to keep SMTP line lengths legal. */
function wrapBase64(value: string): string {
  return (value.replace(/[\r\n\s]/g, "").match(/.{1,76}/g) ?? []).join("\r\n");
}

function sanitizeFilename(name: string): string {
  return (name || "attachment").replace(/["\\\r\n]/g, "_").slice(0, 200);
}

function boundaryId(): string {
  return `mr_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** The body of the message: text, html, or a multipart/alternative of both. */
function buildBodyPart(message: SendMessage): { headers: string[]; body: string } {
  if (message.html && message.text) {
    const boundary = boundaryId();
    return {
      headers: [`Content-Type: multipart/alternative; boundary="${boundary}"`],
      body: [
        `--${boundary}`,
        'Content-Type: text/plain; charset="utf-8"',
        "",
        dotStuff(message.text),
        `--${boundary}`,
        'Content-Type: text/html; charset="utf-8"',
        "",
        dotStuff(message.html),
        `--${boundary}--`,
      ].join("\r\n"),
    };
  }
  const isHtml = !!message.html;
  return {
    headers: [`Content-Type: text/${isHtml ? "html" : "plain"}; charset="utf-8"`],
    body: dotStuff(message.html ?? message.text ?? ""),
  };
}

function buildMime(message: SendMessage, messageId: string): string {
  const from = message.fromName ? `"${message.fromName}" <${message.from}>` : message.from;
  const extra = Object.entries(message.headers ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\r\n");

  const head = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    ...(extra ? [extra] : []),
  ];

  const part = buildBodyPart(message);
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return [...head, ...part.headers, "", part.body, ""].join("\r\n");
  }

  // One multipart/mixed message: the body first, then each file as a real
  // base64 attachment part.
  const boundary = boundaryId();
  const lines = [
    ...head,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...part.headers,
    "",
    part.body,
  ];
  for (const file of attachments) {
    const filename = sanitizeFilename(file.filename);
    lines.push(
      `--${boundary}`,
      `Content-Type: ${file.contentType || "application/octet-stream"}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrapBase64(file.contentBase64),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}


async function sendViaSmtp(
  endpoint: Endpoint,
  message: SendMessage,
): Promise<{ ok: boolean; message: string; messageId: string | null }> {
  let wire: Wire | null = null;
  const messageId = `<${crypto.randomUUID()}@${message.from.split("@")[1] ?? "munchreach.com"}>`;
  try {
    wire = await withTimeout(Wire.open(endpoint), "SMTP connection");
    const auth = await smtpAuthenticate(wire, endpoint);
    if (!auth.ok) return { ok: false, message: auth.message, messageId: null };

    await wire.send(`MAIL FROM:<${message.from}>`);
    const mailFrom = await withTimeout(wire.readUntil(smtpComplete), "SMTP MAIL FROM");
    if (smtpCode(mailFrom) !== 250) {
      return {
        ok: false,
        message: `SMTP rejected the sender: ${firstLine(mailFrom)}`,
        messageId: null,
      };
    }

    // One message, every recipient at the envelope level: To, Cc and Bcc all
    // get this same message, and Bcc addresses stay out of every header.
    const envelope = (
      message.envelopeTo?.length ? message.envelopeTo : [message.to]
    ).filter((address, index, all) => !!address && all.indexOf(address) === index);
    const rejected: string[] = [];
    for (const recipient of envelope) {
      await wire.send(`RCPT TO:<${recipient}>`);
      const rcpt = await withTimeout(wire.readUntil(smtpComplete), "SMTP RCPT TO");
      if (![250, 251].includes(smtpCode(rcpt))) {
        rejected.push(`${recipient} (${firstLine(rcpt)})`);
      }
    }
    if (rejected.length === envelope.length) {
      return {
        ok: false,
        message: `SMTP rejected the recipient: ${rejected[0]}`,
        messageId: null,
      };
    }




    await wire.send("DATA");
    const dataReady = await withTimeout(wire.readUntil(smtpComplete), "SMTP DATA");
    if (smtpCode(dataReady) !== 354) {
      return {
        ok: false,
        message: `SMTP refused the message body: ${firstLine(dataReady)}`,
        messageId: null,
      };
    }

    await wire.send(`${buildMime(message, messageId)}\r\n.`);
    const accepted = await withTimeout(wire.readUntil(smtpComplete), "SMTP message accept");
    if (smtpCode(accepted) !== 250) {
      return {
        ok: false,
        message: `SMTP did not accept the message: ${firstLine(accepted)}`,
        messageId: null,
      };
    }

    await wire.send("QUIT");
    return { ok: true, message: "Message accepted for delivery.", messageId };
  } catch (error) {
    return { ok: false, message: `SMTP error: ${(error as Error).message}`, messageId: null };
  } finally {
    wire?.close();
  }
}


// ---------------------------------------------------------------- check (IMAP)
//
// Additive: reads new mail from the mailbox's own inbox. Never sends anything
// and never touches the "test"/"send" paths above.

type CheckedMessage = {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  text: string | null;
};

const MAX_MESSAGES_PER_CHECK = 50;
const HEADER_FIELDS = "MESSAGE-ID IN-REPLY-TO REFERENCES FROM TO SUBJECT DATE";
const BODY_PREVIEW_BYTES = 8192;

/** Unfolds RFC 5322 headers and returns the first value for each name. */
function parseHeaders(raw: string): Record<string, string> {
  const unfolded = raw.replace(/\r\n[ \t]+/g, " ");
  const out: Record<string, string> = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim().toLowerCase();
    if (!(name in out)) out[name] = line.slice(at + 1).trim();
  }
  return out;
}

/**
 * Splits one FETCH response into its literal payloads, in the order the server
 * sent them: headers first, then the body preview.
 */
function literals(chunk: string): string[] {
  const found: string[] = [];
  let index = 0;
  while (index < chunk.length) {
    const match = /\{(\d+)\}\r\n/.exec(chunk.slice(index));
    if (!match) break;
    const start = index + (match.index ?? 0) + match[0].length;
    const length = Number(match[1]);
    found.push(chunk.slice(start, start + length));
    index = start + length;
  }
  return found;
}

function parseFetchResponse(raw: string): CheckedMessage[] {
  const parts = raw.split(/\r\n(?=\* \d+ FETCH )/i).filter((part) => /\* \d+ FETCH /i.test(part));
  const messages: CheckedMessage[] = [];
  for (const part of parts) {
    const uid = Number(/UID (\d+)/i.exec(part)?.[1] ?? 0);
    if (!uid) continue;
    const blocks = literals(part);
    const headers = parseHeaders(blocks[0] ?? "");
    const body = (blocks[1] ?? "").trim();
    messages.push({
      uid,
      messageId: headers["message-id"] ?? null,
      inReplyTo: headers["in-reply-to"] ?? null,
      references: headers["references"] ?? null,
      from: headers["from"] ?? null,
      to: headers["to"] ?? null,
      subject: headers["subject"] ?? null,
      date: headers["date"] ?? null,
      text: body ? body.slice(0, BODY_PREVIEW_BYTES) : null,
    });
  }
  return messages;
}

async function checkImapMailbox(
  endpoint: Endpoint,
  sinceUid: number | null,
): Promise<{ ok: boolean; message: string; messages: CheckedMessage[] }> {
  let wire: Wire | null = null;
  try {
    wire = await withTimeout(Wire.open(endpoint), "IMAP connection");

    const greeting = await withTimeout(
      wire.readUntil((text) => text.includes("\r\n")),
      "IMAP greeting",
    );
    if (!/^\* (OK|PREAUTH)/i.test(greeting.trim())) {
      return { ok: false, message: `IMAP server refused the connection: ${firstLine(greeting)}`, messages: [] };
    }

    if (endpoint.security === "tls") {
      await wire.send("b0 STARTTLS");
      const ready = await withTimeout(
        wire.readUntil((text) => /b0 (OK|NO|BAD)/i.test(text)),
        "IMAP STARTTLS",
      );
      if (!/b0 OK/i.test(ready)) {
        return { ok: false, message: `IMAP STARTTLS refused: ${firstLine(ready)}`, messages: [] };
      }
      await wire.startTls();
    }

    const escape = (value: string) => value.replace(/(["\\])/g, "\\$1");
    await wire.send(`b1 LOGIN "${escape(endpoint.username)}" "${escape(endpoint.password)}"`);
    const login = await withTimeout(
      wire.readUntil((text) => /b1 (OK|NO|BAD)/i.test(text)),
      "IMAP login",
    );
    if (!/b1 OK/i.test(login)) {
      return { ok: false, message: `IMAP login failed: ${firstLine(login)}`, messages: [] };
    }

    await wire.send("b2 SELECT INBOX");
    const select = await withTimeout(
      wire.readUntil((text) => /b2 (OK|NO|BAD)/i.test(text)),
      "IMAP SELECT",
    );
    if (!/b2 OK/i.test(select)) {
      return { ok: false, message: `IMAP could not open the inbox: ${firstLine(select)}`, messages: [] };
    }

    const uidNext = Number(/UIDNEXT (\d+)/i.exec(select)?.[1] ?? 0);
    // First-ever check: only look at the most recent slice of the inbox.
    const from =
      sinceUid && sinceUid > 0
        ? sinceUid + 1
        : Math.max(1, (uidNext || MAX_MESSAGES_PER_CHECK + 1) - MAX_MESSAGES_PER_CHECK);

    await wire.send(
      `b3 UID FETCH ${from}:* (UID BODY.PEEK[HEADER.FIELDS (${HEADER_FIELDS})] BODY.PEEK[TEXT]<0.${BODY_PREVIEW_BYTES}>)`,
    );
    const fetched = await withTimeout(
      wire.readUntil((text) => /^b3 (OK|NO|BAD)/im.test(text)),
      "IMAP FETCH",
    );
    if (/^b3 (NO|BAD)/im.test(fetched)) {
      return { ok: false, message: `IMAP fetch failed: ${firstLine(fetched)}`, messages: [] };
    }

    const all = parseFetchResponse(fetched).sort((a, b) => a.uid - b.uid);
    // Cap the batch so one very busy inbox can never overload a single run.
    const messages = all.slice(-MAX_MESSAGES_PER_CHECK);

    await wire.send("b4 LOGOUT");
    return { ok: true, message: `Fetched ${messages.length} message(s).`, messages };
  } catch (error) {
    return { ok: false, message: `IMAP error: ${(error as Error).message}`, messages: [] };
  } finally {
    wire?.close();
  }
}

function authorized(request: Request): boolean {
  // The shared secret is the primary credential when configured: service-role
  // keys exist in two formats (legacy JWT and sb_secret_*) and the value the
  // caller holds is not always byte-identical to this function's own env value.
  const relaySecret = Deno.env.get("MAILBOX_RELAY_SECRET");
  if (relaySecret) return request.headers.get("x-relay-secret") === relaySecret;

  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const accepted = [
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    Deno.env.get("SB_SERVICE_ROLE_KEY"),
  ].filter((value): value is string => !!value);
  return !!bearer && accepted.includes(bearer);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = payload["action"];

  if (action === "test") {
    const smtp = payload["smtp"] as Endpoint | undefined;
    const imap = payload["imap"] as Endpoint | undefined;
    if (!smtp || !imap) return json({ error: "smtp and imap are required for action 'test'" }, 400);

    const smtpResult = await testSmtpLogin(smtp);
    const imapResult = await testImapLogin(imap);
    return json({
      ok: smtpResult.ok && imapResult.ok,
      smtp: smtpResult,
      imap: imapResult,
      testedAt: new Date().toISOString(),
    });
  }

  if (action === "send") {
    const smtp = payload["smtp"] as Endpoint | undefined;
    const message = payload["message"] as SendMessage | undefined;
    if (!smtp || !message?.from || !message?.to || !message?.subject) {
      return json(
        { error: "smtp and message{from,to,subject} are required for action 'send'" },
        400,
      );
    }
    return json(await sendViaSmtp(smtp, message));
  }

  if (action === "check") {
    const imap = payload["imap"] as Endpoint | undefined;
    if (!imap?.host || !imap?.username) {
      return json({ error: "imap{host,port,security,username,password} is required for action 'check'" }, 400);
    }
    const rawSince = payload["sinceUid"];
    const sinceUid = typeof rawSince === "number" && Number.isFinite(rawSince) ? Math.trunc(rawSince) : null;
    return json(await checkImapMailbox(imap, sinceUid));
  }

  return json({ error: "Unknown action. Use 'test', 'send' or 'check'." }, 400);
});
