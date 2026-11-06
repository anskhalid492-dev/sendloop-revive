import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { getAnalyticsSequence } from "@/lib/analytics.functions";
import { bounceRate, formatCount, formatPct, openRate, rate, replyRate } from "@/lib/analytics-model";
import type { AnalyticsFilters } from "@/lib/analytics-filters";

/**
 * Per-step performance for the selected range, with the A/B variants of each
 * step expandable underneath it. Every number comes from the same
 * de-duplicated message units as the headline totals.
 */
export function SequencePerformance({ filters }: { filters: AnalyticsFilters }) {
  const fetchSequence = useServerFn(getAnalyticsSequence);
  const [open, setOpen] = useState<number[]>([]);

  const query = useQuery({
    queryKey: analyticsKeys.sequence(
      filters.workspaceId,
      filters.from,
      filters.to,
      filters.campaignId,
      filters.accountId,
    ),
    queryFn: () =>
      fetchSequence({
        data: {
          workspaceId: filters.workspaceId ?? "",
          from: filters.from,
          to: filters.to,
          campaignId: filters.campaignId,
          accountId: filters.accountId,
        },
      }),
    enabled: !!filters.workspaceId,
    ...liveQueryOptions(),
  });

  const steps = query.data ?? [];

  return (
    <section className="surface-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Sequence performance</h2>
        <p className="text-xs text-muted-foreground">
          Step-by-step results. Expand a step to compare its variants.
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : steps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No sequence sends in this range yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Step</th>
                <th className="py-2 pr-3">Sent</th>
                <th className="py-2 pr-3">Confirmed delivered</th>
                <th className="py-2 pr-3">Open</th>
                <th className="py-2 pr-3">Reply</th>
                <th className="py-2 pr-3">Positive</th>
                <th className="py-2 pr-3">Bounce</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => {
                const expanded = open.includes(step.step);
                const hasVariants = step.variants.length > 1;
                return [
                  <tr
                    key={`step-${step.step}`}
                    className={
                      "border-t border-border/50" +
                      (hasVariants ? " cursor-pointer hover:bg-muted/40" : "")
                    }
                    onClick={
                      hasVariants
                        ? () =>
                            setOpen((prev) =>
                              prev.includes(step.step)
                                ? prev.filter((s) => s !== step.step)
                                : [...prev, step.step],
                            )
                        : undefined
                    }
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 font-medium">
                        {hasVariants ? (
                          expanded ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )
                        ) : (
                          <span className="inline-block size-3.5" />
                        )}
                        Step {step.step}
                      </div>
                      {step.name ? (
                        <div className="pl-5.5 text-xs text-muted-foreground">{step.name}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{formatCount(step.sent)}</td>
                    <td className="py-2 pr-3">{formatCount(step.delivered)}</td>
                    <td className="py-2 pr-3">{formatPct(openRate(step))}</td>
                    <td className="py-2 pr-3">{formatPct(replyRate(step))}</td>
                    <td className="py-2 pr-3">{formatCount(step.positiveReplies)}</td>
                    <td className="py-2 pr-3">{formatPct(bounceRate(step))}</td>
                  </tr>,
                  ...(expanded
                    ? step.variants.map((variant) => (
                        <tr
                          key={`variant-${step.step}-${variant.variantId ?? "base"}`}
                          className="border-t border-border/30 bg-muted/20 text-xs"
                        >
                          <td className="py-2 pr-3 pl-8 text-muted-foreground">{variant.label}</td>
                          <td className="py-2 pr-3">{formatCount(variant.sent)}</td>
                          <td className="py-2 pr-3">{formatCount(variant.delivered)}</td>
                          <td className="py-2 pr-3">{formatPct(openRate(variant))}</td>
                          <td className="py-2 pr-3">{formatPct(replyRate(variant))}</td>
                          <td className="py-2 pr-3">{formatCount(variant.positiveReplies)}</td>
                          <td className="py-2 pr-3">{formatPct(rate(variant.bounced, variant.sent))}</td>
                        </tr>
                      ))
                    : []),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
