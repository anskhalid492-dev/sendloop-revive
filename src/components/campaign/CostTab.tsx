import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { getCampaignCost } from "@/lib/cost.functions";
import type { CampaignBuilder } from "./useCampaignBuilder";

function money(cents: number, digits = 2) {
  return `$${(cents / 100).toFixed(digits)}`;
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function CostTab({ builder }: { builder: CampaignBuilder }) {
  const fetchCost = useServerFn(getCampaignCost);
  const costQuery = useQuery({
    queryKey: ["campaign-cost", builder.campaignId],
    queryFn: () => fetchCost({ data: { campaignId: builder.campaignId } }),
  });

  if (costQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Calculating campaign cost…
      </div>
    );
  }
  if (costQuery.error || !costQuery.data) {
    return (
      <p className="py-12 text-sm text-destructive">
        {(costQuery.error as Error)?.message ?? "Could not load campaign cost."}
      </p>
    );
  }

  const cost = costQuery.data;
  const perSend = cost.costPerSendCents;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cost per send"
          value={perSend > 0 ? money(perSend, 4) : "—"}
          sub={
            cost.mailboxes
              ? `Blended across ${cost.mailboxes} mailbox${cost.mailboxes === 1 ? "" : "es"}`
              : "Select sending accounts to price this campaign"
          }
        />
        <Kpi
          label="Total spent"
          value={money(cost.totalSpentCents)}
          sub={`${cost.sentCount.toLocaleString()} emails sent`}
        />
        <Kpi
          label="Spent last 30 days"
          value={money(cost.spentLast30dCents)}
          sub={`${cost.sentLast30d.toLocaleString()} emails sent`}
        />
        <Kpi
          label="Estimated next 30 days"
          value={money(cost.projectedCost30dCents)}
          sub={`${cost.projectedSends30d.toLocaleString()} sends projected`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-card p-5">
          <h3 className="font-semibold">Spend to date</h3>
          <p className="text-sm text-muted-foreground">
            Based on the rate of the sending infrastructure behind this campaign.
          </p>
          <div className="mt-3">
            <Row label="Emails sent" value={cost.sentCount.toLocaleString()} />
            <Row label="Cost per send" value={perSend > 0 ? money(perSend, 4) : "—"} />
            <Row label="Cost per 1,000 sends" value={money(perSend * 1000)} />
            <Row label="Total spent" value={money(cost.totalSpentCents)} />
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="font-semibold">Next 30 days</h3>
          <p className="text-sm text-muted-foreground">
            Queued mail plus the follow-ups still owed to in-flight leads, paced by your daily cap.
          </p>
          <div className="mt-3">
            <Row label="Already queued" value={cost.queuedCount.toLocaleString()} />
            <Row label="Follow-ups still to send" value={cost.projectedFollowUps.toLocaleString()} />
            <Row
              label="Daily cap"
              value={cost.dailyCap ? `${cost.dailyCap.toLocaleString()} / day` : "No cap"}
            />
            <Row label="Emails per lead" value={String(cost.stepsPerLead)} />
            <Row label="Projected sends" value={cost.projectedSends30d.toLocaleString()} />
            <Row label="Estimated cost" value={money(cost.projectedCost30dCents)} />
          </div>
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Estimates assume the campaign keeps running at its current pace. Actual cost follows the
        emails MunchReach sends on your behalf.
      </p>
    </div>
  );
}
