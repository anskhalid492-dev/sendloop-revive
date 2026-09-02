/**
 * Pure mapping from the campaign settings form payload to the `campaigns`
 * column patch.
 *
 * Extracted from the server function so the mapping — in particular the
 * customer-chosen daily sending limit (`dailyCap` -> `daily_cap`) — is
 * regression-tested: the value entered in the UI must always be the value
 * stored, with no silent fallback.
 */

export const CAMPAIGN_UPDATE_COLUMN_MAP: Record<string, string> = {
  name: "name",
  description: "description",
  listId: "list_id",
  sendingAccountIds: "sending_account_ids",
  timezone: "timezone",
  sendDays: "send_days",
  sendStartHour: "send_start_hour",
  sendEndHour: "send_end_hour",
  dailyCap: "daily_cap",
  stopOnReply: "stop_on_reply",
  tags: "tags",
  startAt: "start_at",
  endAt: "end_at",
  minDelayMinutes: "min_delay_minutes",
  randomDelayMinutes: "random_delay_minutes",
  maxPerHour: "max_per_hour",
  businessDaysOnly: "business_days_only",
  openTracking: "open_tracking",
  clickTracking: "click_tracking",
  textOnly: "text_only",
  stopOnCompanyReply: "stop_on_company_reply",
  maxContactsPerCompany: "max_contacts_per_company",
  emailSendLimit: "email_send_limit",
  unsubscribeEnabled: "unsubscribe_enabled",
  inboxRotationEnabled: "inbox_rotation_enabled",
  inboxRotationStrategy: "inbox_rotation_strategy",
  rotationDailyCapPerInbox: "rotation_daily_cap_per_inbox",
  customVariables: "custom_variables",
};

export function buildCampaignUpdatePatch(data: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(CAMPAIGN_UPDATE_COLUMN_MAP)) {
    const value = data[key];
    if (key !== "id" && value !== undefined) patch[column] = value;
  }
  return patch;
}
