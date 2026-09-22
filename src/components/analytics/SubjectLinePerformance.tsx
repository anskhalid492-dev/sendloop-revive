import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { filterPayload, type AnalyticsFilters } from "@/lib/analytics-filters";
import { formatCount, formatOpenRate, openRate } from "@/lib/analytics-model";
import { SUBJECT_MIN_SAMPLE } from "@/lib/analytics-subject";
import { getSubjectLinePerformance } from "@/lib/analytics.functions";

type SortKey = "openRate" | "sent";

/**
 * Unique-open performance per subject line, over the page's own date range and
 * filters. Rates come from the shared open-rate formula used everywhere else on
 * this page, and the subject text is shown exactly as written — personalisation
 * variables are never replaced with example values.
 */
export function SubjectLinePerformance({ filters }: { filters: AnalyticsFilters }) {
  const fetchSubjects = useServerFn(getSubjectLinePerformance);
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [sort, setSort] = useState<SortKey>("sent");

  const query = useQuery({
    queryKey: analyticsKeys.subjectLines(
      filters.workspaceId,
      filters.from,
      filters.to,
      filters.campaignId,
      filters.accountId,
    ),
    queryFn: () => fetchSubjects({ data: filterPayload(filters) }),
    enabled: !!filters.workspaceId,
    ...liveQueryOptions(),
  });

  const rows = query.data ?? [];

  const campaignOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.campaignId, row.campaignName);
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [rows]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter(
      (row) =>
        (campaign === "all" || row.campaignId === campaign) &&
        (needle === "" || row.subject.toLowerCase().includes(needle)),
    );
    return filtered.sort((a, b) => {
      if (sort === "sent") return b.sent - a.sent || a.subject.localeCompare(b.subject);
      // Small samples are ranked last so a 1-of-1 open never looks like a winner.
      if (a.lowSample !== b.lowSample) return a.lowSample ? 1 : -1;
      return openRate(b) - openRate(a) || b.sent - a.sent;
    });
  }, [rows, search, campaign, sort]);

  const SortButton = ({ value, label }: { value: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => setSort(value)}
      className={`inline-flex items-center gap-1 ${
        sort === value ? "text-foreground" : "hover:text-foreground"
      }`}
    >
      {label}
      {sort === value ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3 opacity-30" />}
    </button>
  );

  return (
    <section className="surface-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Subject line performance</h2>
        <p className="text-xs text-muted-foreground">
          Unique opens over delivered emails, per subject line in this date range.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search subject lines"
          className="h-9 sm:max-w-xs"
          aria-label="Search subject lines"
        />
        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger className="h-9 sm:w-[240px]" aria-label="Filter by campaign">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaignOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 overflow-x-auto">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : visible.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <BarChart3 className="size-5" />
            {rows.length === 0
              ? "No subject lines have been sent in this date range yet."
              : "No subject lines match this search."}
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Subject line</th>
                <th className="py-2 pr-3">Campaign</th>
                <th className="py-2 pr-3">
                  <SortButton value="sent" label="Emails sent" />
                </th>
                <th className="py-2 pr-3">Unique opens</th>
                <th className="py-2 pr-3">
                  <SortButton value="openRate" label="Open rate" />
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.key} className="border-t border-border/50 align-top">
                  <td className="max-w-[26rem] py-2 pr-3 font-medium">
                    <span className="block break-words">{row.subject}</span>
                    {row.steps.length > 0 ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        Step {row.steps.join(", ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{row.campaignName}</td>
                  <td className="py-2 pr-3">{formatCount(row.sent)}</td>
                  <td className="py-2 pr-3">
                    {row.openTracking ? formatCount(row.opens) : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {formatOpenRate(row)}
                      {row.openTracking && row.lowSample ? (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Too few to compare
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Rows with fewer than {SUBJECT_MIN_SAMPLE} delivered emails are marked as too few to
        compare, and are never ranked as winners.
      </p>
    </section>
  );
}
