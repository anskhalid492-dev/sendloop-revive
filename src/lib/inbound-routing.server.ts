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

export type MintedReplyRoute = {
  id: string | null;
  token: string;
  routedAddress: string;
  visibleAddress: string;
};

export function cleanReplyAddress(baseAddress: string | null): string | null {
  if (!baseAddress || !baseAddress.includes("@")) return baseAddress;
  const [rawLocal, rawDomain] = baseAddress.split("@");
  const local = (rawLocal ?? "").split("+")[0]?.trim();
  const domain = rawDomain?.trim().toLowerCase();
  if (!local || !domain) return baseAddress;
  return `${local}@${domain}`;
}

export async function mintReplyRoute(
  baseAddress: string | null,
  target: RouteTarget,
): Promise<MintedReplyRoute | null> {
  const visibleAddress = cleanReplyAddress(baseAddress);
  if (!visibleAddress || !visibleAddress.includes("@")) return null;
  const [local, domain] = visibleAddress.split("@");
  if (!local || !domain) return null;

  const token = randomToken();
  const { data, error } = await supabaseAdmin
    .from("inbound_routes")
    .insert({
      token,
      workspace_id: target.workspaceId,
      sending_account_id: target.sendingAccountId ?? null,
      lead_id: target.leadId ?? null,
      campaign_id: target.campaignId ?? null,
      conversation_id: target.conversationId ?? null,
      purpose: target.purpose ?? "campaign",
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return {
    id: data?.id ?? null,
    token,
    routedAddress: `${local}+${token}@${domain}`,
    visibleAddress,
  };
}

/**
 * Creates a routed reply address based on `baseAddress`. Returns the base
 * address unchanged when routing cannot be set up, so sending never breaks
 * because of inbound configuration.
 */
export async function mintReplyAddress(
  baseAddress: string | null,
  target: RouteTarget,
): Promise<string | null> {
  const route = await mintReplyRoute(baseAddress, target);
  return route?.routedAddress ?? baseAddress;
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

/**
 * Creates the same backend route record as `mintRequiredReplyAddress`, but
 * returns only the professional mailbox address for the customer-visible
 * Reply-To header. Clean-address replies are threaded by RFC Message-ID via the
 * outbound message registry and participant fallback in the inbox ingester.
 */
export async function mintCleanReplyAddress(
  baseAddress: string | null,
  target: RouteTarget,
): Promise<string> {
  const route = await mintReplyRoute(baseAddress, target);
  if (!route) {
    throw new Error("Reply routing is not ready for this mailbox. Please try again shortly.");
  }
  return route.visibleAddress;
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
