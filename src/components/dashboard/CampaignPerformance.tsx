import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampaignPerformance as Row } from "@/lib/dashboard.functions";

function pct(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : "—";
}

/** Top campaigns for the selected window, built from real message history. */
export function CampaignPerformance({
  rows,
  loading,
}: {
  rows: Row[];
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Campaign performance</h3>
          <p className="text-xs text-muted-foreground">
            Your highest-volume campaigns in this period.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link to="/campaigns">
            View all campaigns <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Campaign</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                <th className="px-3 py-2.5 text-right font-medium">Confirmed delivered</th>
                <th className="px-3 py-2.5 text-right font-medium">Replies</th>
                <th className="px-3 py-2.5 text-right font-medium">Reply rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Positive</th>
                <th className="px-3 py-2.5 text-right font-medium">Meetings</th>
                <th className="px-5 py-2.5 text-right font-medium">Bounce rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-muted/40">
                  <td className="max-w-[240px] truncate px-5 py-3">
                    <Link
                      to="/campaigns/$campaignId"
                      params={{ campaignId: c.id }}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="secondary" className="capitalize">
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.leads}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.sent}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.delivered}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.replies}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{pct(c.replies, c.sent)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.positive}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{c.meetings}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={c.bounced && c.sent && c.bounced / c.sent > 0.03 ? "text-destructive" : ""}>
                      {pct(c.bounced, c.sent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 px-5 py-10">
          <Rocket className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">No campaign activity in this period</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Launch a sequence to start seeing sends, replies and meetings here. Widen the date
              range if your campaigns ran earlier.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/campaigns">Create a campaign</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
