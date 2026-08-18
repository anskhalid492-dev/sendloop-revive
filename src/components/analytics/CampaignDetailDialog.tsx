import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConversionFunnel } from "@/components/analytics/ConversionFunnel";
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
}: {
  row: AnalyticsCampaignRow | null;
  onOpenChange: (open: boolean) => void;
}) {
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
              ["Delivered", formatCount(row.delivered)],
              ["Unique opens", `${formatCount(row.opens)} · ${formatPct(openRate(row))}`],
              ["Unique clicks", `${formatCount(row.clicks)} · ${formatPct(clickRate(row))}`],
              ["Replies", `${formatCount(row.replies)} · ${formatPct(replyRate(row))}`],
              ["Bounced", `${formatCount(row.bounced)} · ${formatPct(bounceRate(row))}`],
              [
                "Unsubscribed",
                `${formatCount(row.unsubscribed)} · ${formatPct(unsubRate(row))}`,
              ],
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
              delivered: row.delivered,
              opens: row.opens,
              replies: row.replies,
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
