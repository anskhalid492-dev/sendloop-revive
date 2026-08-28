import {
  Activity,
  CircleAlert,
  Gauge,
  Mail,
  MousePointerClick,
  Reply,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LEAD_DELIVERY_LABELS,
  LEAD_DELIVERY_STYLES,
  STEP_TYPE_LABELS,
  type LeadDeliveryState,
} from "@/lib/campaign-model";
import { cn } from "@/lib/utils";
import { LaunchAuditTrail } from "./LaunchAuditTrail";
import type { CampaignBuilder } from "./useCampaignBuilder";

/** Compact "2m ago" style stamp so the feed reads as live. */
function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function rate(part: number, total: number) {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

function pct(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

/** Headline card: one number, its rate, and what the number actually means. */
function HeadlineCard({
  icon: Icon,
  label,
  value,
  rateLabel,
  hint,
  tone,
}: {
  icon: typeof Send;
  label: string;
  value: number;
  rateLabel?: string | undefined;
  hint: string;
  tone?: string | undefined;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={cn("size-4 text-muted-foreground", tone)} />
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
        {rateLabel ? (
          <span className="text-xs font-medium text-muted-foreground">{rateLabel}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string | undefined;
  tone?: string | undefined;
}) {
  return (
    <div className="rounded-lg border border-border/70 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
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
  // Emails this campaign already sent today — authoritative server count over
  // the FULL message history (the `leads` array here is only one page).
  const campaignSentToday = delivery?.sentToday ?? 0;
  const dailyLimit = settings.dailyCap > 0 ? settings.dailyCap : 0;
  // Remaining daily capacity = daily limit − sent today. Never lead-based.
  const remainingToday = dailyLimit > 0 ? Math.max(0, dailyLimit - campaignSentToday) : null;



  const totalLeads = delivery?.totalLeads ?? queue?.total ?? 0;
  // Lifetime remainder and today's eligible volume are kept strictly separate.
  const remainingTotal = delivery?.remaining ?? Math.max(0, totalLeads - contacted);
  const eligibleToday =
    remainingToday === null ? remainingTotal : Math.min(remainingTotal, remainingToday);
  const sent = delivery?.sent ?? queue?.sent ?? 0;
  const delivered = delivery?.delivered ?? 0;
  const opened = delivery?.opened ?? 0;
  const clicked = delivery?.clicked ?? 0;
  const replied = delivery?.replied ?? queue?.replied ?? 0;
  const bounced = delivery?.bounced ?? queue?.bounced ?? 0;
  const failed = delivery?.failed ?? queue?.failed ?? 0;
  const delayed = delivery?.delayed ?? 0;
  const unsubscribed = delivery?.unsubscribed ?? queue?.unsubscribed ?? 0;
  const completed = queue?.completed ?? 0;
  const pending = queue?.pending ?? 0;

  const progress = totalLeads ? Math.min(100, Math.round((contacted / totalLeads) * 100)) : 0;

  // Funnel mix bar — proportions of the real send outcomes.
  const funnel = [
    { label: "Delivered", value: delivered, color: "bg-primary" },
    { label: "Opened", value: opened, color: "bg-sky-500" },
    { label: "Replied", value: replied, color: "bg-emerald-500" },
    { label: "Bounced", value: bounced, color: "bg-destructive" },
  ];
  const funnelTotal = funnel.reduce((sum, f) => sum + f.value, 0);

  // Feed the activity list from the live per-lead delivery state (real message
  // events), not the recipient row status, so opens/bounces show up instantly.
  const recentActivity = leads
    .filter((l) => l.lastEventAt ?? l.last_sent_at)
    .sort((a, b) => {
      const at = String(a.lastEventAt ?? a.last_sent_at ?? "");
      const bt = String(b.lastEventAt ?? b.last_sent_at ?? "");
      return at < bt ? 1 : -1;
    })
    .slice(0, 8);

  const statusTone =
    campaign.status === "active"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : campaign.status === "paused"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Header: identity, status and delivery progress in one block */}
      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{campaign.name}</h2>
              <Badge variant="secondary" className={cn("font-medium capitalize", statusTone)}>
                {campaign.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {steps.length} step sequence · {selected.length} mailbox
              {selected.length === 1 ? "" : "es"} ·{" "}
              {campaign.launched_at
                ? `started ${new Date(campaign.launched_at).toLocaleDateString()}`
                : "not launched yet"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Next send</p>
            <p className="text-sm font-semibold">
              {queue?.nextSendAt ? new Date(queue.nextSendAt).toLocaleString() : "Not scheduled"}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {contacted} of {totalLeads} leads contacted
            </span>
            <span>{progress}%</span>
          </div>
          <Progress className="mt-1.5 h-2" value={progress} />
          <p className="mt-1 text-xs text-muted-foreground">
            {pending} queued · {completed} finished the sequence
          </p>
        </div>
      </section>

      {/* Headline performance */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeadlineCard
          icon={Send}
          label="Emails sent"
          value={sent}
          hint="Accepted by the sending infrastructure"
        />
        <HeadlineCard
          icon={Mail}
          label="Delivered"
          value={delivered}
          rateLabel={pct(rate(delivered, sent))}
          hint="Confirmed in the recipient mailbox"
        />
        <HeadlineCard
          icon={MousePointerClick}
          label="Opened"
          value={opened}
          rateLabel={pct(rate(opened, delivered || sent))}
          hint={`${clicked} link click${clicked === 1 ? "" : "s"}`}
        />
        <HeadlineCard
          icon={Reply}
          label="Replies"
          value={replied}
          rateLabel={pct(rate(replied, delivered || sent))}
          hint="Conversations started from this campaign"
          tone={replied > 0 ? "text-emerald-600" : undefined}
        />
      </div>

      {/* Outcome mix + secondary counters */}
      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Send outcomes</h2>
          <span className="text-xs text-muted-foreground">
            Bounce rate {pct(rate(bounced, sent))} · Unsubscribe rate{" "}
            {pct(rate(unsubscribed, delivered || sent))}
          </span>
        </div>

        {funnelTotal > 0 ? (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
              {funnel
                .filter((f) => f.value > 0)
                .map((f) => (
                  <div
                    key={f.label}
                    className={f.color}
                    style={{ width: `${(f.value / funnelTotal) * 100}%` }}
                    title={`${f.label}: ${f.value}`}
                  />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {funnel.map((f) => (
                <span key={f.label} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", f.color)} />
                  {f.label} {f.value}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Outcome mix appears as soon as the first messages are delivered.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total campaign (all time)
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <MiniStat label="Total leads" value={totalLeads} />
              <MiniStat label="Contacted" value={contacted} />
              <MiniStat label="Sent" value={sent} hint="Accepted by the provider" />
              <MiniStat label="Remaining" value={remainingTotal} hint="Never emailed yet" />
              <MiniStat
                label="Bounced"
                value={bounced}
                hint="Never counted as delivered or failed"
                tone={bounced > 0 ? "text-destructive" : undefined}
              />
              <MiniStat
                label="Failed"
                value={failed}
                hint="Internal send failures only"
                tone={failed > 0 ? "text-destructive" : undefined}
              />
              <MiniStat label="Clicked" value={clicked} />
              <MiniStat label="Cancelled" value={delivery?.cancelled ?? 0} />
              <MiniStat label="Delayed" value={delayed} hint="Retrying" />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Today / current run
              </p>
              {run ? (
                <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">
                  {run.label}
                </span>
              ) : null}
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <MiniStat
                label="Sent today"
                value={campaignSentToday}
                hint="Since this campaign's local day start"
              />
              <MiniStat
                label="Remaining eligible today"
                value={eligibleToday}
                hint={
                  dailyLimit > 0
                    ? `Daily quota ${dailyLimit.toLocaleString()}`
                    : "No campaign daily quota"
                }
              />
              <MiniStat label="Scheduled" value={delivery?.scheduled ?? 0} hint="Queued to send" />
              <MiniStat
                label="Processing"
                value={delivery?.processing ?? 0}
                hint="Handed to the provider"
              />
              <MiniStat label="Delivered today" value={today?.delivered ?? 0} />
              <MiniStat label="Opened today" value={today?.opened ?? 0} hint="Unique recipients" />
              <MiniStat label="Clicked today" value={today?.clicked ?? 0} hint="Unique recipients" />
              <MiniStat label="Replied today" value={today?.replied ?? 0} hint="Unique recipients" />
            </div>
            {run ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {run.state === "daily_quota_reached"
                  ? "Daily quota reached — the campaign is not paused and resumes automatically."
                  : run.state === "waiting_for_next_run"
                    ? "Outside the sending window."
                    : run.state === "running"
                      ? "Inside the sending window."
                      : null}
                {run.nextRunAt
                  ? ` Next run ${new Date(run.nextRunAt).toLocaleString()}.`
                  : ""}
                {run.retryableFailures > 0
                  ? ` ${run.retryableFailures.toLocaleString()} retryable failure(s) will be re-attempted on the next run.`
                  : ""}
              </p>
            ) : null}
          </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Mailbox capacity is separate: {dailyUsed.toLocaleString()} of{" "}
              {dailyCapacity.toLocaleString()} sends used in the current rolling 12-hour mailbox
              window.
            </p>
          </div>
        </div>
        {campaign.status === "paused" && campaign.limit_reached_at ? (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            This campaign paused automatically because it reached its total send limit of{" "}
            <span className="font-semibold tabular-nums">
              {Number(campaign.email_send_limit ?? 0).toLocaleString()}
            </span>{" "}
            emails — not because of bounces or failures.
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="size-4 text-primary" /> Sequence overview
          </h2>
          <ul className="mt-4 space-y-3">
            {steps.map((step, index) => {
              const reached = queue?.byStep.find((s) => s.step === index + 1)?.reached ?? 0;
              return (
                <li key={step.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span>
                        <span className="font-medium">
                          {step.name || STEP_TYPE_LABELS[step.stepType]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {STEP_TYPE_LABELS[step.stepType]}
                          {index > 0
                            ? ` · waits ${step.waitDays}d ${step.waitHours}h`
                            : " · sends immediately"}
                        </span>
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{reached} reached</span>
                  </div>
                  <Progress
                    className="h-1.5"
                    value={totalLeads ? Math.min(100, (reached / totalLeads) * 100) : 0}
                  />
                </li>
              );
            })}
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
              <p className="text-lg font-semibold">{pending}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Failed sends</p>
              <p className="text-lg font-semibold">{failed}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Mailbox capacity used today (all campaigns)</span>
              <span>
                {dailyUsed} / {dailyCapacity || 0}
              </span>
            </div>
            <Progress
              className="mt-2"
              value={dailyCapacity ? Math.min(100, (dailyUsed / dailyCapacity) * 100) : 0}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Total leads</p>
              <p className="text-lg font-semibold tabular-nums">{totalLeads.toLocaleString()}</p>
              <p className="text-muted-foreground">{pending.toLocaleString()} pending</p>
            </div>
            <div>
              <p className="text-muted-foreground">Daily sending limit</p>
              <p className="text-lg font-semibold tabular-nums">
                {dailyLimit > 0 ? `${dailyLimit.toLocaleString()}/day` : "Not set"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Sent today</p>
              <p className="text-lg font-semibold tabular-nums">{campaignSentToday.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Remaining today</p>
              <p className="text-lg font-semibold tabular-nums">
                {remainingToday === null ? "—" : remainingToday.toLocaleString()}
              </p>
            </div>
          </div>

          {warning.length ? (
            <p className="flex items-center gap-2 text-xs text-amber-700">
              <CircleAlert className="size-3.5" />
              {warning.length} mailbox{warning.length > 1 ? "es need" : " needs"} attention.
            </p>
          ) : null}
          {bounced > 0 && rate(bounced, sent) !== null && (rate(bounced, sent) ?? 0) > 3 ? (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <ShieldAlert className="size-3.5" />
              Bounce rate is above 3% — pause and clean the list before sending more.
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
