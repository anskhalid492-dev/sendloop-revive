import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

import { ConversionFunnel, type FunnelStepKey } from "@/components/analytics/ConversionFunnel";
import { FunnelDrilldownDialog } from "@/components/analytics/FunnelDrilldownDialog";
import {
  bounceRate,
  clickRate,
  formatCount,
  formatPct,
  openRate,
  replyRate,
  unsubRate,
  type AnalyticsCampaignRow,
} from "@/lib/analytics-model";

/** Read-only breakdown for one campaign inside the selected range. */
export function CampaignDetailDialog({
  row,
  onOpenChange,
  workspaceId,
  from,
  to,
  accountId,
}: {
  row: AnalyticsCampaignRow | null;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  from: string;
  to: string;
  accountId?: string | null;
}) {
  const [step, setStep] = useState<FunnelStepKey | null>(null);
  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row?.name ?? "Campaign"}</DialogTitle>
          <DialogDescription>
            Performance for the selected time range, from real delivery and reply events.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Sent", formatCount(row.sent)],
              ["Confirmed delivered", formatCount(row.delivered)],
              [
                "Unique opens",
                row.openTracking === false
                  ? "Disabled"
                  : `${formatCount(row.opens)} · ${formatPct(openRate(row))}`,
              ],
              ["Unique clicks", `${formatCount(row.clicks)} · ${formatPct(clickRate(row))}`],
              ["Replies", `${formatCount(row.replies)} · ${formatPct(replyRate(row))}`],
              ["Positive replies", formatCount(row.positiveReplies)],
              ["Not interested", formatCount(row.negativeReplies ?? 0)],
              ["Away / auto-replies", formatCount(row.outOfOfficeReplies ?? 0)],
              ["Bounced", `${formatCount(row.bounced)} · ${formatPct(bounceRate(row))}`],
              [
                "Unsubscribed",
                `${formatCount(row.unsubscribed)} · ${formatPct(unsubRate(row))}`,
              ],
              ["Complaints", formatCount(row.complained)],
              ["Failed", formatCount(row.failed)],
              ["Held for review", formatCount(row.held ?? 0)],
              ["Status", row.status],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {row ? (
          <ConversionFunnel
            className="mt-1"
            title="Conversion funnel"
            data={{
              sent: row.sent,
              delivered: null,
              opens: row.opens,
              replies: row.replies,
            }}
            onStepClick={workspaceId ? (s) => setStep(s) : undefined}
          />
        ) : null}

        {row && workspaceId ? (
          <FunnelDrilldownDialog
            step={step}
            workspaceId={workspaceId}
            from={from}
            to={to}
            campaignId={row.campaignId}
            accountId={accountId ?? null}
            onOpenChange={(open) => {
              if (!open) setStep(null);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
