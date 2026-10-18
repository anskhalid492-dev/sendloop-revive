import { Badge } from "@/components/ui/badge";

const TRIGGERS = [
  ["Account created", "user.created", "Existing welcome; unchanged"],
  ["No mailbox after 24 hours", "", "Not added — delayed engagement"],
  ["Mailbox connected", "onboarding.mailbox_ready", "New action-confirmed notice"],
  ["Leads imported", "onboarding.leads_imported", "New action-confirmed notice"],
  ["Campaign still unlaunched", "", "Not added — delayed engagement"],
  ["Campaign launched", "campaign.launched", "Existing launch confirmation; unchanged"],
  ["Approaching free limits", "", "Not added — upgrade promotion"],
  ["Inactive for 7 days", "", "Not added — re-engagement"],
];
export function EngagementTriggerTable({ templates, usage }: { templates: { event_key: string; name: string; enabled: boolean }[]; usage: Record<string, { sent: number; failed: number; lastExecution?: string | null; keyed?: number; records?: number }> }) {
  return <section className="space-y-3 py-4"><h2 className="text-lg font-semibold">Customer onboarding triggers</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{["Trigger", "Template / coverage", "Status", "Last queued execution (30d)", "Sent / failed (30d)", "Duplicate prevention"].map(label => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>{TRIGGERS.map(([label, key, coverage]) => {
    const template = templates.find(t => t.event_key === key); const stats = key ? usage[key] : undefined;
    return <tr className="border-b" key={label}><td className="px-3 py-3 font-medium">{label}</td><td className="px-3 py-3">{template?.name ?? "—"}<div className="text-xs text-muted-foreground">{coverage}</div></td><td className="px-3 py-3"><Badge variant="outline">{template ? template.enabled ? "Enabled" : "Disabled" : "Not configured"}</Badge></td><td className="px-3 py-3">{stats?.lastExecution ? new Date(stats.lastExecution).toLocaleString() : "—"}</td><td className="px-3 py-3">{key ? `${stats?.sent ?? 0} / ${stats?.failed ?? 0}` : "—"}</td><td className="px-3 py-3">{key ? stats?.records ? `${stats.keyed ?? 0}/${stats.records} keyed records` : "Stable key; no executions yet" : "—"}</td></tr>;
  })}</tbody></table></div></section>;
}