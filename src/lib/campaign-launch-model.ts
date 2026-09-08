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
