/** Client-safe types for campaign launch readiness. */
export type LaunchIssue = { code: string; message: string };

export type LaunchReadiness = {
  ready: boolean;
  issues: LaunchIssue[];
  campaignId: string;
  workspaceId: string | null;
  listId: string | null;
  listName: string | null;
  eligible: number;
  alreadyQueued: number;
  audience: number;
  unassignedLeads: number;
  activeMailboxes: number;
};

type MailboxLike = { id: string; status?: string | null; customer_enabled?: boolean | null; paused?: boolean | null };

/**
 * Apply a just-saved mailbox selection to the last server readiness snapshot,
 * using the same mailbox rule as the server (not disabled, customer enabled,
 * not paused). Only the mailbox issues are recomputed; every other issue from
 * the server is kept, so this can never mark a campaign ready that the server
 * would reject for another reason. The server snapshot still refetches after.
 */
export function applySavedMailboxesToReadiness(
  prev: LaunchReadiness,
  savedIds: string[],
  knownAccounts: MailboxLike[],
): LaunchReadiness {
  const byId = new Map(knownAccounts.map((a) => [a.id, a]));
  const active = savedIds.filter((id) => {
    const a = byId.get(id);
    return Boolean(a && a.status !== "disabled" && a.customer_enabled && !a.paused);
  }).length;
  const others = prev.issues.filter((i) => i.code !== "no_mailbox" && i.code !== "no_active_mailbox");
  const issues = [...others];
  if (savedIds.length === 0) {
    issues.push({ code: "no_mailbox", message: "No sending mailbox selected for this campaign." } as LaunchIssue);
  } else if (active === 0) {
    issues.push({
      code: "no_active_mailbox",
      message: "No sending mailbox available — connect or resume a mailbox first.",
    } as LaunchIssue);
  }
  return { ...prev, issues, activeMailboxes: active, ready: issues.length === 0 };
}
