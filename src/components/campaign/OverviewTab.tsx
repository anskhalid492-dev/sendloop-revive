import { Activity, CircleAlert, Gauge, Mail, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { STEP_TYPE_LABELS } from "@/lib/campaign-model";
import { LaunchAuditTrail } from "./LaunchAuditTrail";
import type { CampaignBuilder } from "./useCampaignBuilder";

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function OverviewTab({ builder }: { builder: CampaignBuilder }) {
  const { campaign, queue, delivery, steps, accounts, settings, leads } = builder;
  if (!campaign || !settings) return null;

  const selected = accounts.filter((a) => settings.sendingAccountIds.includes(a.id));
  const warning = selected.filter((a) => a.paused || a.status === "failed");
  const dailyUsed = selected.reduce((sum, a) => sum + (a.sent_today ?? 0), 0);
  const dailyCapacity = selected.reduce((sum, a) => sum + (a.daily_limit ?? 0), 0);
  const contacted = delivery?.contacted ?? leads.filter((l) => l.status !== "pending").length;

  const recentActivity = leads
    .filter((l) => l.last_sent_at)
    .sort((a, b) => (a.last_sent_at! < b.last_sent_at! ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">Campaign</p>
          <p className="text-lg font-semibold">{campaign.name}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <p className="text-lg font-semibold capitalize">{campaign.status}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Started</p>
          <p className="text-lg font-semibold">
            {campaign.launched_at ? new Date(campaign.launched_at).toLocaleDateString() : "Not yet"}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Next send</p>
          <p className="text-lg font-semibold">
            {queue?.nextSendAt ? new Date(queue.nextSendAt).toLocaleString() : "Not scheduled"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total leads" value={delivery?.totalLeads ?? queue?.total ?? 0} />
        <Metric label="Leads contacted" value={contacted} />
        <Metric label="Emails sent" value={delivery?.sent ?? queue?.sent ?? 0} hint="Accepted by the sending infrastructure" />
        <Metric
          label="Delivered"
          value={delivery?.delivered ?? 0}
          hint="Confirmed in the recipient mailbox"
        />
        <Metric label="Opened" value={delivery?.opened ?? 0} />
        <Metric label="Clicked" value={delivery?.clicked ?? 0} />
        <Metric label="Replies" value={delivery?.replied ?? queue?.replied ?? 0} />
        <Metric label="Completed" value={queue?.completed ?? 0} />
        <Metric label="Bounced" value={delivery?.bounced ?? queue?.bounced ?? 0} hint="Never counted as delivered" />
        <Metric label="Delayed" value={delivery?.delayed ?? 0} hint="Retrying" />
        <Metric label="Unsubscribed" value={delivery?.unsubscribed ?? queue?.unsubscribed ?? 0} />
        <Metric label="Failed" value={delivery?.failed ?? queue?.failed ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" /> Sequence overview
          </h2>
          <ul className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span>
                    <span className="font-medium">{step.name || STEP_TYPE_LABELS[step.stepType]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {STEP_TYPE_LABELS[step.stepType]}
                      {index > 0
                        ? ` · waits ${step.waitDays}d ${step.waitHours}h`
                        : " · sends immediately"}
                    </span>
                  </span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {queue?.byStep.find((s) => s.step === index + 1)?.reached ?? 0} reached
                </span>
              </li>
            ))}
            {steps.length === 0 ? (
              <li className="text-sm text-muted-foreground">No steps yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="surface-card space-y-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="size-4 text-primary" /> Sending health
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Active accounts</p>
              <p className="text-lg font-semibold">{selected.length - warning.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">With warnings</p>
              <p className="text-lg font-semibold">{warning.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Queue size</p>
              <p className="text-lg font-semibold">{queue?.pending ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed sends</p>
              <p className="text-lg font-semibold">{queue?.failed ?? 0}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Daily sending usage</span>
              <span>
                {dailyUsed} / {dailyCapacity || 0}
              </span>
            </div>
            <Progress
              className="mt-2"
              value={dailyCapacity ? Math.min(100, (dailyUsed / dailyCapacity) * 100) : 0}
            />
          </div>
          {warning.length ? (
            <p className="flex items-center gap-2 text-xs text-amber-700">
              <CircleAlert className="size-3.5" />
              {warning.length} mailbox{warning.length > 1 ? "es need" : " needs"} attention.
            </p>
          ) : null}
        </section>
      </div>

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="size-4 text-primary" /> Recent activity
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
        </div>
        {recentActivity.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" /> Nothing sent yet. Activity appears once the queue starts.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60 text-sm">
            {recentActivity.map((row) => {
              const state = (row.deliveryState ?? "not_contacted") as LeadDeliveryState;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{row.lead?.email ?? "Lead"}</span>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 font-normal ${LEAD_DELIVERY_STYLES[state] ?? ""}`}
                    >
                      {LEAD_DELIVERY_LABELS[state] ?? state}
                    </Badge>
                  </span>
                  <span
                    className="whitespace-nowrap text-xs text-muted-foreground"
                    title={new Date(row.lastEventAt ?? row.last_sent_at!).toLocaleString()}
                  >
                    {relativeTime(row.lastEventAt ?? row.last_sent_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>


      <LaunchAuditTrail campaignId={campaign.id} />
    </div>
  );
}
