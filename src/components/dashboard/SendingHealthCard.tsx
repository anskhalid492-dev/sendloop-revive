import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type SendingHealth = {
  total: number;
  healthy: number;
  warming: number;
  attention: number;
  issues: number;
  domainsTotal: number;
  domainsReady: number;
  dailyCapacity: number;
  sentToday: number;
  overallHealth: number;
};

/** Infrastructure readiness. Provider vendors are never surfaced here. */
export function SendingHealthCard({
  health,
  loading,
}: {
  health: SendingHealth | null;
  loading: boolean;
}) {
  const usage =
    health && health.dailyCapacity > 0
      ? Math.min(100, Math.round((health.sentToday / health.dailyCapacity) * 100))
      : 0;

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Sending health</h3>
          <p className="text-xs text-muted-foreground">Mailboxes, domains and daily capacity.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
          <Link to="/email-accounts">
            Manage <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : health && health.total > 0 ? (
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-4 border-primary/20 text-lg font-semibold tabular-nums">
              {health.overallHealth}
            </div>
            <div className="text-sm">
              <p className="font-medium">Overall deliverability score</p>
              <p className="text-muted-foreground">
                {health.healthy} of {health.total} mailboxes in good standing
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Healthy", value: health.healthy },
              { label: "Warming up", value: health.warming },
              { label: "Needs attention", value: health.attention },
              { label: "Paused or erroring", value: health.issues },
              { label: "Domains ready", value: `${health.domainsReady}/${health.domainsTotal}` },
              { label: "Sent today", value: health.sentToday.toLocaleString() },
            ].map((row) => (
              <div key={row.label} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{row.value}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Daily capacity used</span>
              <span className="tabular-nums">
                {health.sentToday.toLocaleString()} / {health.dailyCapacity.toLocaleString()}
              </span>
            </div>
            <Progress value={usage} className="h-2" />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start gap-3 px-5 py-10">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">No sending mailboxes connected</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a mailbox and verify your domain to start sending safely.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/email-accounts">Connect a mailbox</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
