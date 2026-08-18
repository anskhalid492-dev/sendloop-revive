import { RECIPIENT_STATUS_LABELS } from "@/lib/campaign-model";
import { Progress } from "@/components/ui/progress";
import type { CampaignBuilder } from "./useCampaignBuilder";

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function AnalyticsTab({ builder }: { builder: CampaignBuilder }) {
  const { queue, steps, leads } = builder;
  const total = queue?.total ?? 0;
  const sent = queue?.sent ?? 0;
  const replied = queue?.replied ?? 0;
  const bounced = queue?.bounced ?? 0;
  const unsubscribed = queue?.unsubscribed ?? 0;

  const emailSteps = steps.filter((s) => s.stepType === "email");
  const byStep = (queue?.byStep ?? []).slice(0, Math.max(1, emailSteps.length));

  const statusCounts = leads.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Leads queued" value={String(total)} />
        <Kpi label="Emails sent" value={String(sent)} sub={`${pct(sent, total)}% of queue`} />
        <Kpi label="Replies" value={String(replied)} sub={`${pct(replied, sent)}% reply rate`} />
        <Kpi label="Bounced" value={String(bounced)} sub={`${pct(bounced, sent)}% bounce rate`} />
        <Kpi
          label="Unsubscribed"
          value={String(unsubscribed)}
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
                    {row.reached} leads · {pct(row.reached, total)}%
                  </span>
                </div>
                <Progress value={pct(row.reached, total)} className="mt-1.5 h-2" />
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
        <h3 className="font-semibold">Lead status breakdown</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(RECIPIENT_STATUS_LABELS).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{statusCounts[key] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
