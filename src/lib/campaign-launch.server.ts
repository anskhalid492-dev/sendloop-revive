/**
 * Server-side launch readiness for a campaign.
 *
 * Everything here is resolved from the database with the caller's RLS-scoped
 * client, so the UI can never talk a campaign into launching with an audience
 * it does not actually own.
 */

// The Supabase generated types make these chained queries very noisy; the
// handler validates every field it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type LaunchIssue = { code: string; message: string };

export type LaunchReadiness = {
  ready: boolean;
  issues: LaunchIssue[];
  campaignId: string;
  workspaceId: string | null;
  listId: string | null;
  listName: string | null;
  /** Leads in the saved list that can still be queued. */
  eligible: number;
  /** Recipients already queued for this campaign. */
  alreadyQueued: number;
  /** Total people this launch will be sending to. */
  audience: number;
  /** Leads in the workspace that are not in any list yet. */
  unassignedLeads: number;
  activeMailboxes: number;
  eligibleLeadIds: string[];
};

const LEAD_ELIGIBLE_STATUSES = ["new"] as const;

export async function evaluateLaunchReadiness(
  supabase: Client,
  campaignId: string,
): Promise<LaunchReadiness> {
  const issues: LaunchIssue[] = [];

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      "id, workspace_id, list_id, sending_account_ids, send_days, send_start_hour, send_end_hour, status",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) throw new Error("Campaign not found");

  const workspaceId: string = campaign.workspace_id;

  // Anything already queued counts as a valid audience even if the campaign has
  // no default list (leads can be attached one-by-one from the Leads tab).
  const { data: recipientRows, error: rErr } = await supabase
    .from("campaign_recipients")
    .select("lead_id, status")
    .eq("campaign_id", campaignId);
  if (rErr) throw new Error(rErr.message);
  const recipients = (recipientRows ?? []) as Array<{ lead_id: string; status: string }>;
  const queuedLeadIds = new Set(recipients.map((r) => r.lead_id));
  const alreadyQueued = recipients.filter((r) =>
    ["pending", "in_progress"].includes(r.status),
  ).length;

  // Leads that are not in any list — surfaced in the UI so the user knows why
  // "All leads" looks populated while the campaign has no audience.
  const { count: unassignedLeads } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("list_id", null)
    .in("status", LEAD_ELIGIBLE_STATUSES as unknown as string[]);

  let listName: string | null = null;
  let eligibleLeadIds: string[] = [];

  if (!campaign.list_id) {
    if (alreadyQueued === 0) {
      issues.push({
        code: "no_list",
        message: "No lead list selected. Pick a saved list (or add leads on the Leads tab).",
      });
    }
  } else {
    const { data: list, error: lErr } = await supabase
      .from("lead_lists")
      .select("id, name, workspace_id")
      .eq("id", campaign.list_id)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);

    if (!list) {
      issues.push({
        code: "list_missing",
        message: "The selected lead list no longer exists. Choose another list.",
      });
    } else if (list.workspace_id !== workspaceId) {
      issues.push({
        code: "list_foreign",
        message: "The selected lead list belongs to another workspace.",
      });
    } else {
      listName = list.name;
      const { data: leadRows, error: leadErr } = await supabase
        .from("leads")
        .select("id")
        .eq("list_id", campaign.list_id)
        .in("status", LEAD_ELIGIBLE_STATUSES as unknown as string[]);
      if (leadErr) throw new Error(leadErr.message);
      eligibleLeadIds = ((leadRows ?? []) as Array<{ id: string }>)
        .map((l) => l.id)
        .filter((id) => !queuedLeadIds.has(id));

      if (eligibleLeadIds.length === 0 && alreadyQueued === 0) {
        issues.push({
          code: "list_empty",
          message: `“${list.name}” contains 0 eligible leads. Import or assign leads to this list first.`,
        });
      }
    }
  }

  // Mailboxes
  const accountIds: string[] = campaign.sending_account_ids ?? [];
  let activeMailboxes = 0;
  if (accountIds.length === 0) {
    issues.push({ code: "no_mailbox", message: "No sending mailbox selected for this campaign." });
  } else {
    const { data: accounts, error: aErr } = await supabase
      .from("sending_accounts")
      .select("id, status, customer_enabled, paused")
      .in("id", accountIds);
    if (aErr) throw new Error(aErr.message);
    activeMailboxes = ((accounts ?? []) as Array<Record<string, unknown>>).filter(
      (a) => a["status"] !== "disabled" && a["customer_enabled"] && !a["paused"],
    ).length;
    if (activeMailboxes === 0) {
      issues.push({
        code: "no_active_mailbox",
        message: "No sending mailbox available — connect or resume a mailbox first.",
      });
    }
  }

  // Sequence
  const { data: steps, error: sErr } = await supabase
    .from("campaign_steps")
    .select("id, subject, body, step_type")
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });
  if (sErr) throw new Error(sErr.message);
  const firstStep = ((steps ?? []) as Array<Record<string, string>>).find(
    (s) => s["step_type"] === "email",
  );
  if (!firstStep || !String(firstStep["subject"] ?? "").trim() || !String(firstStep["body"] ?? "").trim()) {
    issues.push({
      code: "sequence_incomplete",
      message: "Campaign sequence is incomplete — the first email needs a subject and a body.",
    });
  }

  // Schedule sanity
  if ((campaign.send_end_hour ?? 0) <= (campaign.send_start_hour ?? 0)) {
    issues.push({
      code: "bad_window",
      message: "The sending window end must be after the start.",
    });
  }
  if (!(campaign.send_days ?? []).length) {
    issues.push({ code: "no_days", message: "Pick at least one sending day." });
  }

  return {
    ready: issues.length === 0,
    issues,
    campaignId,
    workspaceId,
    listId: campaign.list_id ?? null,
    listName,
    eligible: eligibleLeadIds.length,
    alreadyQueued,
    audience: eligibleLeadIds.length + alreadyQueued,
    unassignedLeads: unassignedLeads ?? 0,
    activeMailboxes,
    eligibleLeadIds,
  };
}
