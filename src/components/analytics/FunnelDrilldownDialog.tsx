import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFunnelDrilldown, type FunnelStep } from "@/lib/analytics.functions";

const STEP_LABEL: Record<FunnelStep, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opens: "Opened",
  replies: "Replied",
};

/** Deduplicated events and related leads behind one funnel step. */
export function FunnelDrilldownDialog({
  step,
  workspaceId,
  from,
  to,
  campaignId,
  onOpenChange,
}: {
  step: FunnelStep | null;
  workspaceId: string;
  from: string;
  to: string;
  campaignId?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchDrilldown = useServerFn(getFunnelDrilldown);
  const query = useQuery({
    enabled: !!step,
    queryKey: ["funnel-drilldown", workspaceId, from, to, campaignId ?? null, step],
    queryFn: () =>
      fetchDrilldown({
        data: {
          workspaceId,
          from,
          to,
          step: step as FunnelStep,
          campaignId: campaignId ?? null,
          limit: 200,
        },
      }),
  });

  return (
    <Dialog open={!!step} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{step ? STEP_LABEL[step] : ""} — underlying events</DialogTitle>
          <DialogDescription>
            Deduplicated events for this workspace between{" "}
            {new Date(from).toLocaleDateString()} and {new Date(to).toLocaleDateString()}.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="text-sm text-destructive">Could not load these events.</p>
        ) : (query.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No events for this step in the range.</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.rows ?? []).map((row) => (
                  <tr key={row.key} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      {row.leadId ? (
                        <Link
                          to="/crm"
                          search={{ lead: row.leadId }}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.leadName ?? row.email}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.leadName ?? row.email}</span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {row.email}
                        {row.company ? ` · ${row.company}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.campaignName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">
                      {new Date(row.occurredAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
