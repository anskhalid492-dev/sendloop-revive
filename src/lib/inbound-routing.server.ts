/**
 * Reply-address routing tokens.
 *
 * Every outbound email gets a unique, unguessable reply address
 * (`replies+<token>@domain`). When the prospect replies, the token alone tells
 * us the workspace, mailbox, lead, campaign and thread — no fragile subject or
 * header matching, and no database ids exposed in the address.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomToken(length = 22): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export type RouteTarget = {
  workspaceId: string;
  sendingAccountId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  conversationId?: string | null;
  purpose?: string;
};

/**
 * Creates a routed reply address based on `baseAddress`. Returns the base
 * address unchanged when routing cannot be set up, so sending never breaks
 * because of inbound configuration.
 */
export async function mintReplyAddress(
  baseAddress: string | null,
  target: RouteTarget,
): Promise<string | null> {
  if (!baseAddress || !baseAddress.includes("@")) return baseAddress;
  const [rawLocal, domain] = baseAddress.split("@");
  const local = (rawLocal ?? "").split("+")[0];
  if (!local || !domain) return baseAddress;

  const token = randomToken();
  const { error } = await supabaseAdmin.from("inbound_routes").insert({
    token,
    workspace_id: target.workspaceId,
    sending_account_id: target.sendingAccountId ?? null,
    lead_id: target.leadId ?? null,
    campaign_id: target.campaignId ?? null,
    conversation_id: target.conversationId ?? null,
    purpose: target.purpose ?? "campaign",
  });
  if (error) return baseAddress;
  return `${local}+${token}@${domain.toLowerCase()}`;
}

/**
 * Same routing architecture as `mintReplyAddress`, but for customer-visible
 * sends where reply capture is mandatory. The visible From stays the mailbox;
 * only Reply-To carries the unguessable token.
 */
export async function mintRequiredReplyAddress(
  baseAddress: string | null,
  target: RouteTarget,
): Promise<string> {
  const replyTo = await mintReplyAddress(baseAddress, target);
  if (!replyTo || !tokenFromAddress(replyTo)) {
    throw new Error("Reply routing is not ready for this mailbox. Please try again shortly.");
  }
  return replyTo;
}

export type ResolvedRoute = {
  id: string;
  workspace_id: string;
  sending_account_id: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  conversation_id: string | null;
};

export function tokenFromAddress(address: string): string | null {
  const local = address.split("@")[0] ?? "";
  const plus = local.indexOf("+");
  if (plus === -1) return null;
  const token = local.slice(plus + 1).trim().toLowerCase();
  return /^[a-z0-9]{8,64}$/.test(token) ? token : null;
}

/** Looks up the routing record encoded in a recipient address. */
export async function resolveRouteFromAddress(address: string): Promise<ResolvedRoute | null> {
  const token = tokenFromAddress(address);
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("inbound_routes")
    .select("id, workspace_id, sending_account_id, lead_id, campaign_id, conversation_id")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  await supabaseAdmin
    .from("inbound_routes")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data as ResolvedRoute;
}
