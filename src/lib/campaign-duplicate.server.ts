/** Shared campaign duplication used by the single and bulk actions. */
import { campaignColumns, withCampaignDefaults, STEP_COLUMNS, type Campaign } from "@/lib/campaign-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export async function duplicateCampaignRow(
  client: Client,
  userId: string,
  options: {
    id: string;
    includeLeads?: boolean;
    includeSchedule?: boolean;
    includeAccounts?: boolean;
  },
): Promise<{ id: string }> {
  const includeLeads = options.includeLeads ?? false;
  const includeSchedule = options.includeSchedule ?? true;
  const includeAccounts = options.includeAccounts ?? true;

  const { data: source, error } = await client
    .from("campaigns")
    .select(await campaignColumns(client))
    .eq("id", options.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!source) throw new Error("Campaign not found");
  const c = withCampaignDefaults(source as Record<string, unknown>) as unknown as Campaign;

  const { data: created, error: cErr } = await client
    .from("campaigns")
    .insert({
      workspace_id: c.workspace_id,
      name: `${c.name} (copy)`,
      description: c.description,
      created_by: userId,
      list_id: includeLeads ? c.list_id : null,
      sending_account_ids: includeAccounts ? c.sending_account_ids : [],
      timezone: c.timezone,
      send_days: includeSchedule ? c.send_days : [1, 2, 3, 4, 5],
      send_start_hour: includeSchedule ? c.send_start_hour : 9,
      send_end_hour: includeSchedule ? c.send_end_hour : 17,
      daily_cap: c.daily_cap,
      stop_on_reply: c.stop_on_reply,
      tags: c.tags,
      min_delay_minutes: c.min_delay_minutes,
      random_delay_minutes: c.random_delay_minutes,
      max_per_hour: c.max_per_hour,
      business_days_only: c.business_days_only,
      open_tracking: c.open_tracking,
      click_tracking: c.click_tracking,
      text_only: c.text_only,
      stop_on_company_reply: c.stop_on_company_reply,
      max_contacts_per_company: c.max_contacts_per_company,
      email_send_limit: c.email_send_limit,
      unsubscribe_enabled: c.unsubscribe_enabled,
      inbox_rotation_enabled: c.inbox_rotation_enabled,
      inbox_rotation_strategy: c.inbox_rotation_strategy,
      rotation_daily_cap_per_inbox: c.rotation_daily_cap_per_inbox,
      custom_variables: c.custom_variables ?? [],
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);

  const { data: steps, error: sErr } = await client
    .from("campaign_steps")
    .select(STEP_COLUMNS)
    .eq("campaign_id", c.id)
    .order("step_order", { ascending: true });
  if (sErr) throw new Error(sErr.message);

  if (steps?.length) {
    const { error: insErr } = await client.from("campaign_steps").insert(
      (steps as Array<Record<string, unknown>>).map((s) => ({
        campaign_id: created.id,
        workspace_id: c.workspace_id,
        step_order: s["step_order"],
        name: s["name"],
        step_type: s["step_type"],
        subject: s["subject"],
        body: s["body"],
        wait_days: s["wait_days"],
        wait_hours: s["wait_hours"],
        delay_minutes: s["delay_minutes"],
        same_thread: s["same_thread"],
        config: s["config"],
      })),
    );
    if (insErr) throw new Error(insErr.message);
  }

  return { id: created.id as string };
}
