/** Provider message-id normalization shared by sending, webhooks and analytics. */

function stripAngle(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.replace(/^<|>$/g, "").trim() || null;
}

function primitiveProviderId(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function collectProviderIds(value: unknown, output: string[]): void {
  const primitive = primitiveProviderId(value);
  if (primitive) {
    output.push(primitive);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectProviderIds(item, output);
    return;
  }

  const item = value as Record<string, unknown>;
  const headerName = item["name"] ?? item["key"];
  if (typeof headerName === "string") {
    const lower = headerName.toLowerCase();
    if (lower === "message-id" || lower === "x-message-id" || lower === "x-resend-id") {
      collectProviderIds(item["value"] ?? item["Value"], output);
    }
  }

  for (const key of ["email_id", "emailId", "id", "message_id", "messageId", "MessageID", "MessageId", "Message-Id", "X-Message-Id"]) {
    collectProviderIds(item[key], output);
  }
}

export function providerMessageIdCandidates(...values: unknown[]): string[] {
  const raw: string[] = [];
  for (const value of values) collectProviderIds(value, raw);
  const candidates: string[] = [];
  for (const value of raw) {
    const trimmed = value.trim();
    const stripped = stripAngle(trimmed);
    if (trimmed) candidates.push(trimmed);
    if (stripped) candidates.push(stripped);
    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded !== trimmed) {
        candidates.push(decoded);
        const decodedStripped = stripAngle(decoded);
        if (decodedStripped) candidates.push(decodedStripped);
      }
    } catch {
      /* not URL-encoded */
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

export function firstProviderMessageId(...values: unknown[]): string | null {
  return providerMessageIdCandidates(...values)[0] ?? null;
}

export function providerMessageIdInFilter(values: string[]): string {
  return `(${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}