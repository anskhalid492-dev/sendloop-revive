/** RFC threading helpers for outbound mail. */

export function createOutboundRfcMessageId(fromEmail: string | null | undefined): string {
  const domain = (fromEmail?.split("@")[1] ?? "munchreach.local")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "") || "munchreach.local";
  return `${crypto.randomUUID()}@${domain}`;
}

export function messageIdHeader(messageId: string): string {
  const trimmed = messageId.trim().replace(/^<|>$/g, "");
  return `<${trimmed}>`;
}

export function mergeEmailHeaders(
  ...sources: Array<Record<string, string | null | undefined> | null | undefined>
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source ?? {})) {
      const cleanKey = key.trim();
      const cleanValue = value?.trim();
      if (cleanKey && cleanValue) headers[cleanKey] = cleanValue;
    }
  }
  return headers;
}