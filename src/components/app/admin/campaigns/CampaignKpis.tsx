import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  Layers,
  MailCheck,
  MailX,
  MessageSquare,
  Pause,
  Play,
  Send,
  Smile,
  UserMinus,
  Users,
  XCircle,
} from "lucide-react";

import type { KpiTotals } from "@/lib/admin-campaign-monitor";

type Trend = { current: number; previous: number; changePct: number } | null;

function rateText(v: number | null) {
  return v === null ? "—" : `${v}%`;
}

function Kpi({
  icon,
  label,
  value,
  hint,
  trend,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  trend?: Trend;
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <p className="truncate text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      {trend ? (
        <p className={`mt-0.5 text-xs ${trend.changePct >= 0 ? "text-primary" : "text-muted-foreground"}`}>
          {trend.changePct >= 0 ? "+" : ""}
          {trend.changePct}% vs previous 7 days ({trend.current.toLocaleString()} vs {trend.previous.toLocaleString()})
        </p>
      ) : hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function CampaignKpis({
  totals,
  trends,
}: {
  totals: KpiTotals;
  trends: { sent: Trend; replies: Trend; bounces: Trend };
}) {
  const n = (v: number) => v.toLocaleString();
  const s = "size-3.5";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      <Kpi icon={<Layers className={s} />} label="Total campaigns" value={n(totals.campaigns)} />
      <Kpi icon={<Play className={s} />} label="Active" value={n(totals.active)} />
      <Kpi icon={<Pause className={s} />} label="Paused" value={n(totals.paused)} />
      <Kpi icon={<CheckCircle2 className={s} />} label="Completed" value={n(totals.completed)} />
      <Kpi icon={<Users className={s} />} label="Total leads" value={n(totals.leads)} />
      <Kpi icon={<Send className={s} />} label="Emails sent" value={n(totals.sent)} trend={trends.sent} hint="Accepted by mailbox" />
      <Kpi icon={<MailCheck className={s} />} label="Confirmed delivered" value={totals.sent ? n(totals.delivered) : "—"} hint="Explicit delivery receipts only" />
      <Kpi icon={<BarChart3 className={s} />} label="Delivery rate" value={rateText(totals.deliveryRate)} hint="No SMTP delivery receipts" />
      <Kpi icon={<Eye className={s} />} label="Opens" value={n(totals.opens)} hint="Unique" />
      <Kpi icon={<BarChart3 className={s} />} label="Open rate" value={rateText(totals.openRate)} />
      <Kpi icon={<MessageSquare className={s} />} label="Replies" value={n(totals.replies)} trend={trends.replies} />
      <Kpi icon={<BarChart3 className={s} />} label="Reply rate" value={rateText(totals.replyRate)} />
      <Kpi icon={<Smile className={s} />} label="Positive replies" value={n(totals.positiveReplies)} />
      <Kpi icon={<MailX className={s} />} label="Bounces" value={n(totals.bounced)} trend={trends.bounces} />
      <Kpi icon={<BarChart3 className={s} />} label="Bounce rate" value={rateText(totals.bounceRate)} />
      <Kpi
        icon={<XCircle className={s} />}
        label="Failed emails"
        value={n(totals.failed)}
        hint={totals.unknown ? `${n(totals.unknown)} unknown outcome(s) held separately` : "Excludes bounces"}
      />
      <Kpi icon={<UserMinus className={s} />} label="Unsubscribes" value={n(totals.unsubscribes)} />
      <Kpi icon={<AlertTriangle className={s} />} label="Unknown outcomes" value={n(totals.unknown)} hint="Held for review, not resent" />
    </div>
  );
}
