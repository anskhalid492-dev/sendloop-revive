/**
 * Headers that sending providers generate themselves.
 *
 * Passing any of these through a provider send API is rejected (Maileroo:
 * "Header 'Message-ID' is system reserved and cannot be used"; SES: "Header
 * <Message-ID> is not supported"). Threading is preserved with In-Reply-To and
 * References, which are NOT reserved and must never be stripped.
 */
export const RESERVED_OUTBOUND_HEADERS = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "reply-to",
  "return-path",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
]);

export function isReservedOutboundHeader(name: string): boolean {
  return RESERVED_OUTBOUND_HEADERS.has(name.trim().toLowerCase());
}

/** Drops provider-generated headers from an outbound header map. */
export function stripReservedHeaders(
  headers: Record<string, string> | undefined | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (isReservedOutboundHeader(name)) continue;
    out[name] = value;
  }
  return out;
}
