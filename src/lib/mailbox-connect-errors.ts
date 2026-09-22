/**
 * Customer-facing wording for mailbox connection failures.
 *
 * The connection tester returns the mail server's own reply, which is useful
 * for support but is not something a customer should have to read. This maps
 * the common cases to a plain instruction, and falls back to a generic one so
 * no raw server text, host name or stack trace reaches the interface.
 */
export type ConnectProtocol = "smtp" | "imap";

const PROTOCOL_LABEL: Record<ConnectProtocol, string> = {
  smtp: "outgoing (SMTP)",
  imap: "incoming (IMAP)",
};

/** Turns a raw tester message into one sentence the customer can act on. */
export function friendlyMailboxError(
  protocol: ConnectProtocol,
  raw: string | null | undefined,
  options: { appPasswordProvider?: string | null } = {},
): string {
  const text = (raw ?? "").toLowerCase();
  const label = PROTOCOL_LABEL[protocol];

  if (/auth|login|credential|password|535|534|invalid user|no such user/.test(text)) {
    if (options.appPasswordProvider) {
      return `${options.appPasswordProvider} refused the sign-in. This provider needs an app password created in your ${options.appPasswordProvider} account security settings — a normal account password will not work.`;
    }
    return `The ${label} server refused the username and password. Check the mailbox address and its password, and make sure mail-client access is switched on with your provider.`;
  }
  if (/timed out|timeout|etimedout/.test(text)) {
    return `The ${label} server did not respond in time. Check the host name and port, then try again.`;
  }
  if (/refused|econnrefused|unreachable|enetunreach/.test(text)) {
    return `Nothing accepted the connection on that ${label} port. Check the host name and port against your provider's setup guide.`;
  }
  if (/enotfound|dns|getaddrinfo|not known/.test(text)) {
    return `That ${label} server name could not be found. Check it for a typo.`;
  }
  if (/tls|ssl|certificate|handshake|wrong version/.test(text)) {
    return `The ${label} security setting does not match the port. Try SSL on 465 (SMTP) or 993 (IMAP), or STARTTLS on 587 (SMTP) or 143 (IMAP).`;
  }
  if (/too many|rate|throttl|try again later|temporarily|4\.\d\.\d/.test(text)) {
    return `Your provider is temporarily refusing ${label} connections. Wait a few minutes and test again.`;
  }
  if (/disabled|not enabled|imap access/.test(text)) {
    return `Your provider has ${label} access switched off for this mailbox. Enable it in your provider's mail settings, then test again.`;
  }
  return `Unable to connect to the ${label} server. Please verify the host, port, security type, username and password.`;
}

/** Wording for a successful check. */
export function mailboxSuccessMessage(protocol: ConnectProtocol): string {
  return protocol === "smtp"
    ? "SMTP connection successful — the outgoing server accepted the sign-in."
    : "IMAP connection successful — the incoming server accepted the sign-in.";
}
