import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env["PROVIDER_CREDENTIALS_KEY"];
  if (!raw) throw new Error("PROVIDER_CREDENTIALS_KEY is not set");
  return createHash("sha256").update(raw).digest();
}

export function encryptCredentials(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptCredentials<T = Record<string, string>>(stored: string): T {
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString(
    "utf8",
  );
  return JSON.parse(plain) as T;
}

export type ProviderTestResult = {
  ok: boolean;
  verified: boolean;
  message: string;
};

/**
 * Verifies provider credentials with a read-only API call.
 * SMTP and SES cannot be verified over plain HTTP from the server runtime, so
 * they stay "untested" until the sending engine performs the first real send.
 */
export async function testProviderCredentials(
  provider: string,
  credentials: Record<string, string>,
): Promise<ProviderTestResult> {
  const timeout = AbortSignal.timeout(10_000);

  const request = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: timeout });
    if (res.ok) return { ok: true, verified: true, message: "Connection verified." };
    const body = (await res.text()).slice(0, 300);
    return {
      ok: false,
      verified: false,
      message: `Provider rejected the credentials [${res.status}]: ${body}`,
    };
  };

  try {
    switch (provider) {
      case "sendgrid":
        return await request("https://api.sendgrid.com/v3/scopes", {
          Authorization: `Bearer ${credentials["api_key"]}`,
        });
      case "resend":
        return await request("https://api.resend.com/domains", {
          Authorization: `Bearer ${credentials["api_key"]}`,
        });
      case "postmark":
        return await request("https://api.postmarkapp.com/server", {
          "X-Postmark-Server-Token": credentials["api_key"] ?? "",
          Accept: "application/json",
        });
      case "mailgun":
        return await request("https://api.mailgun.net/v3/domains", {
          Authorization: `Basic ${Buffer.from(`api:${credentials["api_key"]}`).toString("base64")}`,
        });
      case "zeptomail":
        return await request("https://api.zeptomail.com/v1.1/domains", {
          Authorization: `Zoho-enczapikey ${credentials["api_key"]}`,
        });
      case "brevo":
        return await request("https://api.brevo.com/v3/account", {
          "api-key": credentials["api_key"] ?? "",
          Accept: "application/json",
        });
      case "emailit":
        return {
          ok: true,
          verified: false,
          message:
            "Emailit credentials stored securely. They are verified on the first send request.",
        };

      case "smtp":
        return {
          ok: true,
          verified: false,
          message:
            "SMTP credentials stored securely. They are verified on the first send, since SMTP cannot be dialled from this runtime.",
        };
      case "ses":
        return {
          ok: true,
          verified: false,
          message:
            "Amazon SES credentials stored securely. They are verified on the first send request.",
        };
      default:
        return { ok: false, verified: false, message: "Unknown provider." };
    }
  } catch (error) {
    return {
      ok: false,
      verified: false,
      message: `Could not reach the provider: ${(error as Error).message}`,
    };
  }
}

export type TestSendResult = {
  ok: boolean;
  message: string;
  messageId?: string | undefined;
  rfcMessageId?: string | undefined;
  requestId?: string | undefined;
  statusCode?: number | undefined;
  providerResponse?: string | undefined;
};

export type OutboundAttachment = { name: string; url?: string | undefined; content?: string | undefined };

export type OutboundEmail = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  to: string;
  cc?: string[] | undefined;
  bcc?: string[] | undefined;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: OutboundAttachment[] | undefined;
  /** RFC threading headers so replies stay in one email thread. */
  headers?: Record<string, string> | undefined;
};

function extractMessageId(body: string, headers: Headers): string | undefined {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const candidate =
      json["id"] ??
      json["email_id"] ??
      json["emailId"] ??
      json["MessageID"] ??
      json["messageId"] ??
      json["message_id"] ??
      (json["data"] as Record<string, unknown> | undefined)?.["id"] ??
      (json["data"] as Record<string, unknown> | undefined)?.["email_id"] ??
      (json["data"] as Record<string, unknown> | undefined)?.["emailId"];
    if (typeof candidate === "string") return candidate;
  } catch {
    /* not JSON — fall through to headers */
  }
  return headers.get("x-message-id") ?? undefined;
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers ?? {})) {
    const name = rawName.trim();
    const value = rawValue.trim();
    if (!name || !value) continue;
    if (!/^[A-Za-z0-9-]+$/.test(name)) continue;
    if (/[\r\n]/.test(value)) continue;
    clean[name] = value;
  }
  return clean;
}

/**
 * Sends a real email through the provider's HTTP API and returns the provider
 * message id so the campaign queue can be reconciled later.
 * SMTP and SES have no HTTP API available in this runtime.
 */
export async function sendProviderEmail(
  provider: string,
  rawCredentials: Record<string, string>,
  message: OutboundEmail,
): Promise<TestSendResult> {
  // Resend can also be wired through a project secret so a real provider is
  // available for end-to-end testing before an admin stores credentials.
  const credentials =
    provider === "resend" && !rawCredentials["api_key"] && process.env["RESEND_API_KEY"]
      ? { ...rawCredentials, api_key: process.env["RESEND_API_KEY"]! }
      : rawCredentials;
  const signal = AbortSignal.timeout(20_000);
  const { subject, text } = message;
  const html = message.html ?? undefined;
  const from = `${message.fromName} <${message.fromEmail}>`;
  const replyTo = message.replyTo || undefined;
  const headers = sanitizeHeaders(message.headers);
  const hasHeaders = Object.keys(headers).length > 0;
  const postmarkHeaders = Object.entries(headers).map(([Name, Value]) => ({ Name, Value }));

  const post = async (url: string, init: RequestInit): Promise<TestSendResult> => {
    const res = await fetch(url, { method: "POST", signal, ...init });
    const body = await res.text();
    const requestId =
      res.headers.get("x-request-id") ??
      res.headers.get("request-id") ??
      res.headers.get("cf-ray") ??
      undefined;
    if (res.ok) {
      return {
        ok: true,
        message: `Provider accepted the email for ${message.to}.`,
        messageId: extractMessageId(body, res.headers),
        requestId,
        statusCode: res.status,
        providerResponse: body.slice(0, 1000),
      };
    }
    return {
      ok: false,
      message: `Provider refused the send [${res.status}]: ${body.slice(0, 300)}`,
      requestId,
      statusCode: res.status,
      providerResponse: body.slice(0, 1000),
    };
  };

  try {
    switch (provider) {
      case "sendgrid":
        return await post("https://api.sendgrid.com/v3/mail/send", {
          headers: {
            Authorization: `Bearer ${credentials["api_key"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: message.to }] }],
            from: { email: message.fromEmail, name: message.fromName },
            ...(replyTo ? { reply_to: { email: replyTo } } : {}),
            ...(hasHeaders ? { headers } : {}),
            subject,
            content: html
              ? [
                  { type: "text/plain", value: text },
                  { type: "text/html", value: html },
                ]
              : [{ type: "text/plain", value: text }],
          }),
        });
      case "resend": {
        // Provider-specific behaviour lives in the Resend adapter (Phase 4).
        const { sendResendEmail } = await import("@/lib/email-providers/resend-send.server");
        const sent = await sendResendEmail(credentials, {
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          replyTo: message.replyTo ?? null,
          to: message.to,
          ...(message.cc?.length ? { cc: message.cc } : {}),
          ...(message.bcc?.length ? { bcc: message.bcc } : {}),
          subject,
          text,
          ...(html ? { html } : {}),
          ...(hasHeaders ? { headers } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments.map((a) => ({ name: a.name, ...(a.url ? { url: a.url } : {}), ...(a.content ? { content: a.content } : {}) })) } : {}),
        });
        return {
          ok: sent.ok,
          message: sent.message,
          messageId: sent.providerMessageId ?? undefined,
          rfcMessageId: sent.rfcMessageId ?? undefined,
          requestId: sent.requestId ?? undefined,
          statusCode: sent.statusCode ?? undefined,
          providerResponse: sent.providerResponse ?? undefined,
        };
      }
      case "postmark":
        return await post("https://api.postmarkapp.com/email", {
          headers: {
            "X-Postmark-Server-Token": credentials["api_key"] ?? "",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            From: from,
            To: message.to,
            ...(replyTo ? { ReplyTo: replyTo } : {}),
            Subject: subject,
            TextBody: text,
            ...(html ? { HtmlBody: html } : {}),
            ...(postmarkHeaders.length ? { Headers: postmarkHeaders } : {}),
            MessageStream: "outbound",
          }),
        });
      case "mailgun": {
        const domain = credentials["domain"] ?? "";
        const form = new URLSearchParams({ from, to: message.to, subject, text });
        if (html) form.set("html", html);
        if (replyTo) form.set("h:Reply-To", replyTo);
        for (const [name, value] of Object.entries(headers)) form.set(`h:${name}`, value);
        return await post(`https://api.mailgun.net/v3/${domain}/messages`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`api:${credentials["api_key"]}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        });
      }
      case "zeptomail":
        return await post("https://api.zeptomail.com/v1.1/email", {
          headers: {
            Authorization: `Zoho-enczapikey ${credentials["api_key"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: { address: message.fromEmail, name: message.fromName },
            to: [{ email_address: { address: message.to } }],
            ...(replyTo ? { reply_to: [{ address: replyTo }] } : {}),
            ...(hasHeaders ? { headers } : {}),
            subject,
            textbody: text,
            ...(html ? { htmlbody: html } : {}),
          }),
        });
      case "brevo":
        return await post("https://api.brevo.com/v3/smtp/email", {
          headers: {
            "api-key": credentials["api_key"] ?? "",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            sender: { name: message.fromName, email: message.fromEmail },
            to: [{ email: message.to }],
            ...(replyTo ? { replyTo: { email: replyTo } } : {}),
            ...(hasHeaders ? { headers } : {}),
            subject,
            textContent: text,
            ...(html ? { htmlContent: html } : {}),
          }),
        });
      case "emailit":
        return await post("https://api.emailit.com/v1/emails", {
          headers: {
            Authorization: `Bearer ${credentials["api_key"]}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject,
            text,
            ...(html ? { html } : {}),
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...(hasHeaders ? { headers } : {}),
          }),
        });
      case "ses":
      case "nuntly":
      case "elasticemail":
      case "maileroo":
      case "courier":
      case "uspeedo": {
        // Provider-specific behaviour lives entirely in the unified adapter.
        const { getEmailProvider } = await import("@/lib/email-providers/registry.server");
        const adapter = getEmailProvider(provider);
        if (!adapter.send) {
          return { ok: false, message: "Sending is not available for this provider." };
        }
        const sent = await adapter.send(credentials, {
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          replyTo: message.replyTo ?? null,
          to: message.to,
          ...(message.cc?.length ? { cc: message.cc } : {}),
          ...(message.bcc?.length ? { bcc: message.bcc } : {}),
          subject,
          text,
          ...(html ? { html } : {}),
          ...(hasHeaders ? { headers } : {}),
        });
        const extra = sent as { requestId?: string | null; providerResponse?: string | null };
        return {
          ok: sent.ok,
          message: sent.message,
          messageId: sent.providerMessageId ?? undefined,
          rfcMessageId: sent.rfcMessageId ?? undefined,
          requestId: extra.requestId ?? undefined,
          statusCode: sent.statusCode ?? undefined,
          providerResponse: extra.providerResponse ?? undefined,
        };
      }

      case "smtp":
        return {
          ok: false,
          message:
            "Sending for SMTP is not available from this runtime yet. Use an HTTP API provider such as Resend.",
        };
      default:
        return { ok: false, message: "Unknown provider." };
    }
  } catch (error) {
    return { ok: false, message: `Could not reach the provider: ${(error as Error).message}` };
  }
}

/** Sends a canned test email so a mailbox can be verified end to end. */
export async function sendProviderTestEmail(
  provider: string,
  credentials: Record<string, string>,
  message: { fromName: string; fromEmail: string; to: string },
): Promise<TestSendResult> {
  return sendProviderEmail(provider, credentials, {
    ...message,
    subject: "MunchReach test email",
    text: "This is a test email from MunchReach.\n\nIf you received it, this sending account is ready to run campaigns.",
  });
}
