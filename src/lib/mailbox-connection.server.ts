/**
 * Real SMTP + IMAP login checks for the customer mailbox-connection flow.
 *
 * Server-only. Opens genuine TCP/TLS sockets and performs an actual login,
 * reporting pass/fail separately for each protocol with the mail server's own
 * error text. It never sends mail, never stores anything, and never touches
 * the existing sending or system-email (Resend) paths.
 *
 * Sockets come from the Workers `connect()` API, which also supports upgrading
 * a plaintext connection with STARTTLS. `node:net` + `node:tls` is used as a
 * fallback when that API is unavailable (local dev on Node).
 */
import type { MailSecurity } from "@/lib/mailbox-presets";

export type MailEndpoint = {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
};

export type ProtocolResult = { ok: boolean; message: string };

export type MailboxTestResult = {
  ok: boolean;
  smtp: ProtocolResult;
  imap: ProtocolResult;
  testedAt: string;
};

const TIMEOUT_MS = 15_000;

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

/** Minimal duplex the protocol code talks to, so both socket backends fit. */
type Wire = {
  send: (line: string) => Promise<void>;
  readUntil: (done: (buffered: string) => boolean) => Promise<string>;
  startTls: () => Promise<void>;
  supportsStartTls: boolean;
  close: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function loadWorkersConnect(): Promise<Any | null> {
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:sockets")) as Any;
    return typeof mod?.connect === "function" ? mod.connect : null;
  } catch {
    return null;
  }
}

function textWire(
  write: (data: Uint8Array) => Promise<void>,
  read: () => Promise<Uint8Array | null>,
  hooks: { startTls: () => Promise<void>; supportsStartTls: boolean; close: () => void },
): Wire {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    send: (line) => write(encoder.encode(`${line}\r\n`)),
    readUntil: async (done) => {
      while (!done(buffer)) {
        const chunk = await read();
        if (!chunk || chunk.length === 0) break;
        buffer += decoder.decode(chunk);
      }
      const text = buffer;
      buffer = "";
      return text;
    },
    startTls: hooks.startTls,
    supportsStartTls: hooks.supportsStartTls,
    close: hooks.close,
  };
}

/** Opens a socket, upgradable to TLS later when `security` is "tls". */
async function openWire(endpoint: MailEndpoint): Promise<Wire> {
  const connect = await loadWorkersConnect();

  if (connect) {
    let socket: Any = connect(
      { hostname: endpoint.host, port: endpoint.port },
      {
        secureTransport:
          endpoint.security === "ssl" ? "on" : endpoint.security === "tls" ? "starttls" : "off",
        allowHalfOpen: false,
      },
    );
    let reader: Any = socket.readable.getReader();
    let writer: Any = socket.writable.getWriter();

    return textWire(
      (data) => writer.write(data),
      async () => {
        const { value, done } = await reader.read();
        return done ? null : (value as Uint8Array);
      },
      {
        supportsStartTls: endpoint.security === "tls",
        startTls: async () => {
          await reader.releaseLock();
          await writer.releaseLock();
          socket = socket.startTls();
          reader = socket.readable.getReader();
          writer = socket.writable.getWriter();
        },
        close: () => {
          try {
            socket.close();
          } catch {
            // Peer may have closed first.
          }
        },
      },
    );
  }

  // Node fallback (local dev).
  const net = await import("node:net");
  const tls = await import("node:tls");

  let socket: Any =
    endpoint.security === "ssl"
      ? tls.connect({ host: endpoint.host, port: endpoint.port, servername: endpoint.host })
      : net.connect({ host: endpoint.host, port: endpoint.port });

  const queue: Uint8Array[] = [];
  let waiter: ((chunk: Uint8Array | null) => void) | null = null;
  let closed = false;

  const attach = (s: Any) => {
    s.on("data", (chunk: Buffer) => {
      const data = new Uint8Array(chunk);
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(data);
      } else queue.push(data);
    });
    s.on("close", () => {
      closed = true;
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(null);
      }
    });
    s.on("error", () => {
      closed = true;
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(null);
      }
    });
  };
  attach(socket);

  await new Promise<void>((resolve, reject) => {
    socket.once(endpoint.security === "ssl" ? "secureConnect" : "connect", () => resolve());
    socket.once("error", (error: Error) => reject(error));
  });

  return textWire(
    (data) =>
      new Promise<void>((resolve, reject) =>
        socket.write(data, (error?: Error | null) => (error ? reject(error) : resolve())),
      ),
    () => {
      const next = queue.shift();
      if (next) return Promise.resolve(next);
      if (closed) return Promise.resolve(null);
      return new Promise<Uint8Array | null>((resolve) => {
        waiter = resolve;
      });
    },
    {
      supportsStartTls: endpoint.security === "tls",
      startTls: async () => {
        const plain = socket;
        socket = tls.connect({ socket: plain, servername: endpoint.host });
        attach(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once("secureConnect", () => resolve());
          socket.once("error", (error: Error) => reject(error));
        });
      },
      close: () => {
        try {
          socket.destroy();
        } catch {
          // Already gone.
        }
      },
    },
  );
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
  return Buffer.from(value, "utf8").toString("base64");
}

export async function testSmtpLogin(endpoint: MailEndpoint): Promise<ProtocolResult> {
  let wire: Wire | null = null;
  try {
    wire = await withTimeout(openWire(endpoint), "SMTP connection");

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

    await wire.send("QUIT");
    return { ok: true, message: "SMTP login succeeded." };
  } catch (error) {
    return { ok: false, message: `SMTP error: ${(error as Error).message}` };
  } finally {
    wire?.close();
  }
}

export async function testImapLogin(endpoint: MailEndpoint): Promise<ProtocolResult> {
  let wire: Wire | null = null;
  try {
    wire = await withTimeout(openWire(endpoint), "IMAP connection");

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

/** Runs both logins and reports them separately. */
export async function testMailboxEndpoints(
  smtp: MailEndpoint,
  imap: MailEndpoint,
): Promise<MailboxTestResult> {
  const smtpResult = await testSmtpLogin(smtp);
  const imapResult = await testImapLogin(imap);
  return {
    ok: smtpResult.ok && imapResult.ok,
    smtp: smtpResult,
    imap: imapResult,
    testedAt: new Date().toISOString(),
  };
}
