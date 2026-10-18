import { isActionOnboarding, onboardingDecision, ONBOARDING_GAP_MS } from "@/lib/transactional/engagement";

// This is a guard/bridge for the existing engine, never a scheduler or sender.
type Db = any;
export async function checkActionNotice(client: Db, row: { event_key?: string; user_id?: string | null; workspace_id?: string | null; to_email: string; id?: string }) {
  if (!isActionOnboarding(row.event_key)) return { decision: "send" as const };
  if (!row.user_id || !row.workspace_id) return { decision: "cancel" as const };
  const [auth, workspace, preferences, suppression, subscriber, mailbox, leads, campaigns, notices, template, automation] = await Promise.all([
    client.auth.admin.getUserById(row.user_id),
    client.from("workspaces").select("owner_id, status").eq("id", row.workspace_id).maybeSingle(),
    client.from("notification_preferences").select("email_enabled").eq("user_id", row.user_id).maybeSingle(),
    client.from("email_suppressions").select("id").eq("workspace_id", row.workspace_id).eq("email", row.to_email).limit(1),
    client.from("marketing_subscribers").select("status").eq("email", row.to_email).limit(1),
    client.from("mailboxes").select("id", { count: "exact", head: true }).eq("workspace_id", row.workspace_id).eq("status", "connected").eq("is_active", true),
    client.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", row.workspace_id),
    client.from("campaigns").select("id", { count: "exact", head: true }).eq("workspace_id", row.workspace_id),
    client.from("transactional_emails").select("id, sent_at, queued_at, status").eq("user_id", row.user_id).in("event_key", ["user.created", "onboarding.mailbox_ready", "onboarding.leads_imported"]).in("status", ["sent", "delivered", "sending"]).order("queued_at", { ascending: false }).limit(10),
    client.from("transactional_templates").select("enabled").eq("event_key", row.event_key).maybeSingle(),
    client.from("marketing_automations").select("id").eq("status", "active").limit(1),
  ]);
  if ([auth, workspace, preferences, suppression, subscriber, mailbox, leads, campaigns, notices, template, automation].some((value) => value.error)) return { decision: "defer" as const };
  // Until an owner audits cross-system overlap, active marketing automations
  // conservatively block these optional notices rather than duplicate nudges.
  if (template.data?.enabled !== true || (automation.data ?? []).length) return { decision: "cancel" as const };
  const user = auth.data?.user;
  const last = (notices.data ?? []).find((notice: any) => notice.id !== row.id);
  const optedOut = preferences.data?.email_enabled === false || (suppression.data ?? []).length > 0 || (subscriber.data ?? []).some((s: any) => ["unsubscribed", "bounced", "complained", "suppressed"].includes(s.status));
  const decision = onboardingDecision({ event: row.event_key ?? "", active: Boolean(user && user.email?.toLowerCase() === row.to_email.toLowerCase() && (!user.banned_until || Date.parse(user.banned_until) <= Date.now()) && workspace.data?.owner_id === row.user_id && workspace.data.status === "active"), optedOut, connected: mailbox.count ?? 0, leads: leads.count ?? 0, campaigns: campaigns.count ?? 0, lastNoticeAt: last?.sent_at ?? last?.queued_at, now: Date.now() });
  return { decision, nextAt: new Date(Date.now() + ONBOARDING_GAP_MS).toISOString() };
}

/** Called only after a persisted successful action; recipient is the workspace owner. */
export async function notifyOnboardingAction(client: Db, workspaceId: string, event: "onboarding.mailbox_ready" | "onboarding.leads_imported") {
  try {
    const { data: workspace, error } = await client.from("workspaces").select("owner_id, name").eq("id", workspaceId).maybeSingle();
    if (error || !workspace?.owner_id) return;
    const { data: profile } = await client.from("profiles").select("email, full_name").eq("id", workspace.owner_id).maybeSingle();
    if (!profile?.email) return;
    const check = await checkActionNotice(client, { event_key: event, user_id: workspace.owner_id, workspace_id: workspaceId, to_email: profile.email });
    if (check.decision === "cancel") return;
    const { triggerTransactionalEmail } = await import("@/lib/transactional-email.server");
    await triggerTransactionalEmail(client, { eventKey: event, userId: workspace.owner_id, workspaceId, to: profile.email, idempotencyKey: `${event}:${workspace.owner_id}:${workspaceId}`, ...(check.decision === "defer" ? { notBefore: check.nextAt ?? new Date(Date.now() + ONBOARDING_GAP_MS).toISOString() } : {}), variables: { "user.first_name": String(profile.full_name ?? "").trim().split(/\s+/)[0] || "there", "workspace.name": workspace.name, action_url: `https://munchreach.com/${event === "onboarding.mailbox_ready" ? "leads" : "campaigns"}` } });
  } catch { /* never fail the successful customer action */ }
}