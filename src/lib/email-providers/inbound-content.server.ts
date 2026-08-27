/**
 * Provider-neutral inbound content enrichment.
 *
 * Inbound webhooks usually carry only metadata (`email_id`, `from`, `to`,
 * `subject`). When the selected provider declares the `inbound_content`
 * capability, this helper asks the provider adapter for the full text/html body
 * and injects it into the raw webhook payload before the existing parser and
 * storage pipeline runs.
 *
 * Failures are logged and swallowed: an inbound message is always stored, even
 * when its body cannot be retrieved. No UI, routing, threading or Supabase
 * behaviour changes.
 */

import type { EmailProvider } from "./provider";
import { supports } from "./provider";
import type { InboundEmailEvent } from "./types";

export async function enrichInboundPayload(
  provider: EmailProvider,
  payload: Record<string, unknown>,
  inbound: InboundEmailEvent | null,
): Promise<Record<string, unknown>> {
  if (!inbound?.providerMessageId) return payload;
  if (!supports(provider, "inbound_content")) return payload;

  const source =
    payload["data"] && typeof payload["data"] === "object"
      ? (payload["data"] as Record<string, unknown>)
      : payload;

  if (hasContent(source)) return payload;

  try {
    const content = await provider.getInboundMessageContent?.({}, inbound.providerMessageId);
    if (!content) return payload;
    if (content.text && !source["text"]) source["text"] = content.text;
    if (content.html && !source["html"]) source["html"] = content.html;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[inbound-content] fetch failed provider=${provider.id} messageId=${inbound.providerMessageId}: ${message}`,
    );
  }

  return payload;
}

function hasContent(source: Record<string, unknown>): boolean {
  const text = String(source["text"] ?? "");
  const html = String(source["html"] ?? "");
  return text.trim().length > 0 || html.trim().length > 0;
}
