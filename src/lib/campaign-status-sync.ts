/**
 * ONE AUTHORITATIVE CAMPAIGN LIFECYCLE STATE.
 *
 * `campaigns.status` in the database is the only source of truth for where a
 * campaign is in its lifecycle. Queue rows (`campaign_recipients` /
 * `campaign_messages`) describe *work*, never lifecycle: a draft campaign can
 * legitimately hold a fully built queue, and that must never read as Active.
 *
 * Every surface — campaigns list, campaign detail header, overview card,
 * launch button, readiness bar, scheduler eligibility — derives its answer from
 * the helpers below so two pages can never disagree.
 */

export type CampaignLifecycleStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

/** Statuses from which the launch action is still meaningful. */
const LAUNCHABLE = new Set<string>(["draft", "scheduled"]);

/** Statuses the scheduler is allowed to send from. */
export const SCHEDULER_SENDABLE_STATUSES = ["active", "scheduled"] as const;
const SENDABLE = new Set<string>(SCHEDULER_SENDABLE_STATUSES);

/**
 * Is the Launch action available? Uses the authoritative status only — never
 * the presence of queued messages.
 */
export function canLaunchCampaign(status: string | null | undefined): boolean {
  return LAUNCHABLE.has(String(status ?? ""));
}

/** Should the launch-readiness bar ("Ready to launch — N leads") be shown? */
export function showsLaunchReadiness(status: string | null | undefined): boolean {
  return canLaunchCampaign(status);
}

/** Can the scheduler send from this campaign? Draft must always be false. */
export function schedulerCanSend(status: string | null | undefined): boolean {
  return SENDABLE.has(String(status ?? ""));
}

/** A launched campaign is one the database has finalized as active. */
export function isLaunched(campaign: {
  status?: string | null;
  launched_at?: string | null;
}): boolean {
  return campaign.status === "active" || Boolean(campaign.launched_at);
}

/**
 * A launch request can complete on the server and still fail on the wire
 * (dropped connection, gateway timeout). The database row is the arbiter: if it
 * came back active, the launch succeeded and the UI must not stay on Draft.
 */
export function launchSucceededDespiteError(statusAfter: string | null | undefined): boolean {
  return String(statusAfter ?? "") === "active";
}
