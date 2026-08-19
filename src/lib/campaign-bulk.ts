/**
 * Pure authorization partitioning for bulk campaign actions.
 *
 * Kept separate from the server function so the workspace-isolation rules can
 * be tested directly: ids the caller cannot see, or that belong to a workspace
 * the caller is not a member of, must never reach the mutating branch.
 */
export type BulkAction = "pause" | "resume" | "duplicate" | "archive" | "delete";

export type VisibleCampaign = { id: string; workspace_id: string; status: string };

export type BulkPartition = {
  targets: string[];
  failed: Array<{ id: string; reason: string }>;
};

export const NOT_FOUND_REASON = "Campaign not found in your workspaces";
export const FORBIDDEN_REASON = "Not authorized for this workspace";

export function partitionBulkTargets(
  ids: string[],
  action: BulkAction,
  visible: Map<string, VisibleCampaign>,
  allowedWorkspaces: Set<string>,
): BulkPartition {
  const targets: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const row = visible.get(id);
    if (!row) {
      failed.push({ id, reason: NOT_FOUND_REASON });
      continue;
    }
    if (!allowedWorkspaces.has(row.workspace_id)) {
      failed.push({ id, reason: FORBIDDEN_REASON });
      continue;
    }
    if (action === "pause" && row.status === "draft") {
      failed.push({ id, reason: "Draft campaigns cannot be paused" });
      continue;
    }
    targets.push(id);
  }

  return { targets, failed };
}
