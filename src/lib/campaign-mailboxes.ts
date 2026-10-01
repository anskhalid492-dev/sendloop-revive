/**
 * Tenant-scoped mailbox loading for the Campaign Builder.
 * mailbox.workspace_id must equal campaign.workspace_id, and the caller must be
 * a member of that workspace (admin role does NOT bypass this for the builder).
 */
import { ACCOUNT_COLUMNS, buildSummary, decorate } from "@/lib/sending-query";
import { isEligibleMailbox } from "@/lib/mailbox-assignment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export async function campaignWorkspaceFor(
  client: Client,
  campaignId: string,
  userId: string,
): Promise<string> {
  const { data: campaign, error } = await client
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const workspaceId = (campaign as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) throw new Error("Campaign not found");
  const { data: member, error: mErr } = await client.rpc("is_workspace_member", {
    _workspace_id: workspaceId,
    _user_id: userId,
  });
  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("You don't have access to this campaign");
  return workspaceId;
}

/** Pure filter, exported for tests. */
export function selectCampaignMailboxes<T extends { workspace_id?: string | null }>(
  rows: T[],
  workspaceId: string,
): T[] {
  return rows.filter(
    (row) => row.workspace_id === workspaceId && isEligibleMailbox(row as never),
  );
}

export async function loadCampaignWorkspaceAccounts(
  client: Client,
  campaignId: string,
  userId: string,
) {
  const workspaceId = await campaignWorkspaceFor(client, campaignId, userId);
  const { data, error } = await client
    .from("sending_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("customer_enabled", true)
    .eq("paused", false)
    .not("status", "in", "(disabled,disconnected)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = selectCampaignMailboxes((data ?? []) as Array<Record<string, unknown> & { workspace_id?: string | null }>, workspaceId);
  return {
    workspaceId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accounts: rows.map((row) => decorate(row as any, null)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary: buildSummary(rows as any[]),
  };
}

/** Rejects any mailbox id that is not an eligible mailbox of the campaign's workspace. */
export async function assertCampaignMailboxes(
  client: Client,
  campaignId: string,
  userId: string,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  const { accounts } = await loadCampaignWorkspaceAccounts(client, campaignId, userId);
  const allowed = new Set(accounts.map((a: { id: string }) => a.id));
  if (ids.some((id) => !allowed.has(id))) {
    throw new Error("One or more selected mailboxes are unavailable or not in this workspace. Please reselect mailboxes.");
  }
}
