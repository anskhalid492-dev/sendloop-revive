import { MailMinus, MessageSquareReply, Send, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import {
  LEAD_DELIVERY_LABELS,
  LEAD_DELIVERY_STATES,
  LEAD_DELIVERY_STYLES,
  type LeadDeliveryState,
} from "@/lib/campaign-model";
import { Progress } from "@/components/ui/progress";
import type { CampaignBuilder } from "./useCampaignBuilder";

/** Solid fill colors for the proportional status bar. */
const BAR_COLORS: Record<LeadDeliveryState, string> = {
  not_contacted: "bg-muted-foreground/30",
  queued: "bg-muted-foreground/40",
  sent: "bg-primary/70",
  delayed: "bg-amber-500/70",
  delivered: "bg-sky-500/70",
  opened: "bg-emerald-500/70",
  clicked: "bg-emerald-600/80",
  replied: "bg-emerald-700/80",
  unsubscribed: "bg-amber-600/70",
  complained: "bg-destructive/60",
  bounced: "bg-destructive/80",
  failed: "bg-destructive",
};

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: LucideIcon }) {
  return (
    <div className="surface-card min-w-0 p-5">
      <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-3xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function AnalyticsTab({ builder }: { builder: CampaignBuilder }) {
  const { queue, delivery, steps, leadStates, leadTotal } = builder;
  // Every headline number comes from the shared campaign stats source, so this
  // tab always matches the workspace Analytics page for the same campaign.
  const total = delivery?.totalLeads ?? queue?.total ?? 0;
  const sent = delivery?.sent ?? 0;
  const replied = delivery?.replied ?? 0;
  const bounced = delivery?.bounced ?? 0;
  const unsubscribed = delivery?.unsubscribed ?? 0;


  const emailSteps = steps.filter((s) => s.stepType === "email");
  const byStep = (queue?.byStep ?? []).slice(0, Math.max(1, emailSteps.length));

  // Counted from the live per-lead delivery state (derived from real message
  // events), so this matches what the Leads tab and the activity feed show.
  // Exact server-side per-lead counts over the whole audience.
  //
  // An accepted send that never bounced counts as delivered — the same rule the
  // KPI cards, dashboard and Analytics page use — so the breakdown can never
  // disagree with "Emails sent" above.
  const statusCounts: Record<string, number> = { ...leadStates };
  if (statusCounts["sent"]) {
    statusCounts["delivered"] = (statusCounts["delivered"] ?? 0) + statusCounts["sent"];
    statusCounts["sent"] = 0;
  }
  const breakdown = LEAD_DELIVERY_STATES.map((state) => ({
    state,
    label: LEAD_DELIVERY_LABELS[state],
    count: statusCounts[state] ?? 0,
    share: pct(statusCounts[state] ?? 0, leadTotal),
  }));
  const visibleBreakdown = breakdown.filter((row) => row.count > 0);
  const emptyBreakdown = breakdown.filter((row) => row.count === 0);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Analytics</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Leads Queued" value={total.toLocaleString()} icon={Users} />
        <Kpi label="Emails Sent" value={sent.toLocaleString()} icon={Send} sub={`${pct(sent, total)}% of queue`} />
        <Kpi label="Replies" value={replied.toLocaleString()} icon={MessageSquareReply} sub={`${pct(replied, sent)}% reply rate`} />
        <Kpi label="Bounced" value={bounced.toLocaleString()} icon={ShieldAlert} sub={`${pct(bounced, sent)}% bounce rate`} />
        <Kpi
          label="Unsubscribed"
          value={unsubscribed.toLocaleString()}
          icon={MailMinus}
          sub={`${pct(unsubscribed, sent)}% opt-out`}
        />
      </div>

      <section className="surface-card p-5">
        <h3 className="font-semibold">Sequence funnel</h3>
        <p className="text-sm text-muted-foreground">
          How far leads travel through the steps of this campaign.
        </p>
        <div className="mt-4 space-y-4">
          {byStep.map((row) => {
            const step = emailSteps[row.step - 1];
            return (
              <div key={row.step}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium">
                    Step {row.step}
                    {step?.name ? ` · ${step.name}` : ""}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {row.sent.toLocaleString()} emailed · {pct(row.sent, total)}%
                    {row.scheduled > 0 ? ` · ${row.scheduled.toLocaleString()} pending` : ""}
                  </span>
                </div>
                <Progress value={pct(row.sent, total)} className="mt-1.5 h-2" />
              </div>
            );
          })}

          {byStep.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Launch the campaign to start collecting funnel data.
            </p>
          ) : null}
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Lead status breakdown</h3>
            <p className="text-sm text-muted-foreground">
              Live state of every lead in this campaign, from real delivery events.
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {leadTotal.toLocaleString()} leads
          </span>
        </div>

        {leadTotal === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No leads queued yet. Add an audience and launch to see live status.
          </p>
        ) : (
          <>
            {/* Single proportional bar gives the mix at a glance. */}
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {visibleBreakdown.map((row) => (
                <div
                  key={row.state}
                  className={`h-full ${BAR_COLORS[row.state]}`}
                  style={{ width: `${row.share}%` }}
                  title={`${row.label}: ${row.count} (${row.share}%)`}
                />
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleBreakdown.map((row) => (
                <div
                  key={row.state}
                  className="rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </p>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${LEAD_DELIVERY_STYLES[row.state]}`}
                    >
                      {row.share}%
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {row.count.toLocaleString()}
                  </p>
                  <Progress value={row.share} className="mt-2 h-1.5" />
                </div>
              ))}
            </div>

            {emptyBreakdown.length ? (
              <p className="mt-4 text-xs text-muted-foreground">
                No leads yet in: {emptyBreakdown.map((row) => row.label).join(", ")}.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
