import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState, LoadingRows, StatCard, num } from "@/components/app/admin/OutreachUI";
import type { getAdminCampaignInsights } from "@/lib/admin-outreach.server";

type Insights = Awaited<ReturnType<typeof getAdminCampaignInsights>>;

function CountList({ title, items, empty }: { title: string; items: { label: string; count: number }[]; empty: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li key={i.label} className="flex items-start justify-between gap-3 text-xs">
              <span className="break-all text-muted-foreground">{i.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{num(i.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SendingActivity({ data, loading }: { data?: Insights; loading: boolean }) {
  if (loading) return <LoadingRows rows={3} />;
  if (!data) return <EmptyState />;
  const hasData = data.timeline.some((d) => d.sent || d.bounced || d.failed);
  return (
    <div className="space-y-3">
      {hasData ? (
        <div className="h-56 w-full rounded-lg border p-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} fontSize={10} stroke="var(--muted-foreground)" />
              <YAxis allowDecimals={false} fontSize={10} width={32} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="sent" name="Sent" stackId="a" fill="var(--chart-1)" />
              <Bar dataKey="bounced" name="Bounced" stackId="a" fill="var(--chart-4)" />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="var(--destructive)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No sends in the last 30 days." />
      )}
      <p className="text-xs text-muted-foreground">{data.timelineNote}</p>
    </div>
  );
}

export function Diagnostics({ data, loading }: { data?: Insights; loading: boolean }) {
  if (loading) return <LoadingRows rows={3} />;
  if (!data) return <EmptyState />;
  const d = data.diagnostics;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Failed (not bounced)" value={num(data.totals.failed)} />
        <StatCard label="Bounced" value={num(data.totals.bounced)} />
        <StatCard label="Unknown outcomes" value={num(d.unknownOutcomes)} hint="Held for review; never resent automatically" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountList title="Failed email breakdown" items={d.failedBreakdown} empty="No failed sends." />
        <CountList title="SMTP codes" items={d.smtpCodes} empty="No SMTP codes recorded." />
        <CountList title="Bounce reasons" items={d.bounceReasons} empty="No bounces recorded." />
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Mailbox-related problems</p>
          {d.mailboxProblems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mailbox problems detected.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {d.mailboxProblems.map((p, i) => (
                <li key={`${p.label}-${i}`}>
                  <span className="font-medium">{p.label}</span>{" "}
                  <span className="text-muted-foreground">— {p.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Breakdowns use the latest {num(d.sampled)} failed/bounced rows.</p>
    </div>
  );
}

export function LeadActivity({ data, loading }: { data?: Insights; loading: boolean }) {
  if (loading) return <LoadingRows rows={2} />;
  if (!data) return <EmptyState />;
  const l = data.leadActivity;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label="Total leads" value={num(l.total)} />
      <StatCard label="Contacted" value={num(l.contacted)} />
      <StatCard label="Replied" value={num(l.replied)} />
      <StatCard label="Interested" value={num(l.interested)} hint="Leads with a positive reply" />
      <StatCard label="Meeting booked" value={num(l.meetingBooked)} hint="From recorded meeting activity" />
      <StatCard label="Remaining" value={num(l.remaining)} hint="Pending or in progress" />
    </div>
  );
}
