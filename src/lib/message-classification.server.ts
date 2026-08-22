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
  },
  db?: Db,
): Promise<void> {
  if (!args.providerMessageId) return;
  const client: Db = db ?? supabaseAdmin;
  try {
    await client.from("outbound_messages").upsert(
      {
        provider_message_id: args.providerMessageId,
        message_type: args.messageType,
        provider: args.provider ?? null,
        workspace_id: args.workspaceId ?? null,
        sending_account_id: args.sendingAccountId ?? null,
        to_email: args.toEmail?.toLowerCase() ?? null,
        ref_table: args.refTable ?? null,
        ref_id: args.refId ?? null,
      },
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
  if (!providerMessageId) return null;

  const { data: registered } = await supabaseAdmin
    .from("outbound_messages")
    .select("message_type")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (registered?.message_type) return registered.message_type as MessageType;

  const [{ data: warmup }, { data: campaign }, { data: transactional }] = await Promise.all([
    supabaseAdmin
      .from("warmup_jobs")
      .select("id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle(),
    supabaseAdmin
      .from("campaign_messages")
      .select("id, message_type")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle(),
    supabaseAdmin
      .from("transactional_emails")
      .select("id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle(),
  ]);

  if (warmup) return "warmup";
  if (campaign) return (campaign.message_type as MessageType) ?? "campaign";
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
