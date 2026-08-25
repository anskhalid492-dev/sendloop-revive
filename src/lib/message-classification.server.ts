/**
 * Outbound message classification.
 *
 * Every email MunchReach sends is registered here with an explicit type the
 * moment the provider accepts it. Webhook processing resolves the type from
 * the provider message id (never from the sender address, mailbox, provider or
 * timing), so a campaign bounce can never move warmup statistics and a warmup
 * bounce can never move campaign statistics.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { providerMessageIdCandidates, providerMessageIdInFilter } from "@/lib/provider-message-id";

export type MessageType =
  | "campaign"
  | "warmup"
  | "transactional"
  | "admin_diagnostic"
  | "manual_reply";

export const MESSAGE_TYPES: MessageType[] = [
  "campaign",
  "warmup",
  "transactional",
  "admin_diagnostic",
  "manual_reply",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Records the classification of one accepted outbound message. Safe to call
 * twice for the same provider message id (the registry is unique on it).
 */
export async function registerOutboundMessage(
  args: {
    providerMessageId: string | null | undefined;
    messageType: MessageType;
    provider?: string | null;
    workspaceId?: string | null;
    sendingAccountId?: string | null;
    toEmail?: string | null;
    refTable?: string | null;
    refId?: string | null;
    alternateProviderMessageIds?: unknown[];
  },
  db?: Db,
): Promise<void> {
  const ids = providerMessageIdCandidates(args.providerMessageId, ...(args.alternateProviderMessageIds ?? []));
  if (!ids.length) return;
  const client: Db = db ?? supabaseAdmin;
  try {
    await client.from("outbound_messages").upsert(
      ids.map((providerMessageId) => ({
        provider_message_id: providerMessageId,
        message_type: args.messageType,
        provider: args.provider ?? null,
        workspace_id: args.workspaceId ?? null,
        sending_account_id: args.sendingAccountId ?? null,
        to_email: args.toEmail?.toLowerCase() ?? null,
        ref_table: args.refTable ?? null,
        ref_id: args.refId ?? null,
      })),
      { onConflict: "provider_message_id", ignoreDuplicates: true },
    );
  } catch {
    /* classification must never break an already delivered send */
  }
}

/**
 * Resolves the type of the message a provider event refers to.
 *
 * The registry is authoritative. When an older message predates the registry
 * we fall back to the concrete send tables — still keyed on the provider
 * message id, never on the address. `null` means "unknown": callers must not
 * attribute the event to any statistic in that case unless they can match it
 * by their own strict rules.
 */
export async function classifyProviderMessage(
  providerMessageId: string | null,
): Promise<MessageType | null> {
  const ids = providerMessageIdCandidates(providerMessageId);
  if (!ids.length) return null;

  const { data: registered } = await supabaseAdmin
    .from("outbound_messages")
    .select("message_type")
    .in("provider_message_id", ids)
    .maybeSingle();
  if (registered?.message_type) return registered.message_type as MessageType;

  const list = providerMessageIdInFilter(ids);

  const [{ data: warmup }, { data: campaign }, { data: conversation }, { data: transactional }] = await Promise.all([
    supabaseAdmin
      .from("warmup_jobs")
      .select("id")
      .in("provider_message_id", ids)
      .maybeSingle(),
    supabaseAdmin
      .from("campaign_messages")
      .select("id, message_type")
      .or(`provider_message_id.in.${list}`)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("conversation_messages")
      .select("id, campaign_message_id, direction")
      .or(`provider_message_id.in.${list},message_id.in.${list}`)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("transactional_emails")
      .select("id")
      .in("provider_message_id", ids)
      .maybeSingle(),
  ]);

  if (warmup) return "warmup";
  if (campaign) return (campaign.message_type as MessageType) ?? "campaign";
  if (conversation?.campaign_message_id) return "campaign";
  if (conversation?.direction === "outbound") return "manual_reply";
  if (transactional) return "transactional";
  return null;
}

/**
 * True when the address is a mailbox that takes part in the warmup network.
 * Used to stop an unidentified event for warmup traffic from being folded into
 * campaign statistics through address-based fallback matching.
 */
export async function isWarmupPeerAddress(email: string | null): Promise<boolean> {
  if (!email) return false;
  const address = email.toLowerCase();
  const [{ data: job }, { data: account }] = await Promise.all([
    supabaseAdmin.from("warmup_jobs").select("id").eq("to_email", address).limit(1).maybeSingle(),
    supabaseAdmin
      .from("sending_accounts")
      .select("id")
      .eq("from_email", address)
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(job || account);
}
