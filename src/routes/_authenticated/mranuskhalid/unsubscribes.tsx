import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailMinus, MousePointerClick, RefreshCw, ListX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUnsubscribeReport } from "@/lib/unsubscribes.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/unsubscribes")({
  head: () => ({
    meta: [
      { title: "Unsubscribes — MunchReach Admin" },
      {
        name: "description",
        content:
          "Unsubscribes per campaign with the source they came from: one-click, List-Unsubscribe header, or the link in the email body.",
      },
      { property: "og:title", content: "Unsubscribes — MunchReach Admin" },
      {
        property: "og:description",
        content: "Track unsubscribes per campaign and by source across MunchReach workspaces.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnsubscribesPage,
});

const RANGES = [7, 30, 90, 365];

const SOURCE_LABEL: Record<string, string> = {
  one_click: "One-click",
  list_unsubscribe: "List-Unsubscribe",
  email_link: "Email link",
};

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function UnsubscribesPage() {
  const [days, setDays] = useState(30);
  const fetchReport = useServerFn(getUnsubscribeReport);

  const query = useQuery({
    queryKey: ["admin", "unsubscribes", days],
    queryFn: () => fetchReport({ data: { days } }),
  });

  const report = query.data;
  const totals = report?.totals;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unsubscribes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How many recipients opted out of each campaign, and how they did it. One-click comes
            from the RFC 8058 POST a mail client sends, List-Unsubscribe from the header link, and
            Email link from the unsubscribe link inside the message body.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={days === r ? "default" : "outline"}
              onClick={() => setDays(r)}
            >
              {r}d
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => query.refetch()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total unsubscribes", value: totals?.total, icon: MailMinus },
          { label: "One-click", value: totals?.oneClick, icon: MousePointerClick },
          { label: "List-Unsubscribe", value: totals?.listUnsubscribe, icon: ListX },
          { label: "Email link", value: totals?.emailLink, icon: MousePointerClick },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-semibold">{card.value ?? 0}</p>
              </div>
              <card.icon className="size-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By campaign</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !report?.campaigns.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              No unsubscribes recorded in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Campaign</th>
                    <th className="px-4 py-2 font-medium">Workspace</th>
                    <th className="px-4 py-2 font-medium">One-click</th>
                    <th className="px-4 py-2 font-medium">List-Unsubscribe</th>
                    <th className="px-4 py-2 font-medium">Email link</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">Last</th>
                  </tr>
                </thead>
                <tbody>
                  {report.campaigns.map((row) => (
                    <tr key={row.campaignId ?? "unknown"} className="border-t border-border/60">
                      <td className="px-4 py-2 font-medium">{row.campaignName}</td>
                      <td className="px-4 py-2 text-muted-foreground">{row.workspaceName}</td>
                      <td className="px-4 py-2">{row.oneClick}</td>
                      <td className="px-4 py-2">{row.listUnsubscribe}</td>
                      <td className="px-4 py-2">{row.emailLink}</td>
                      <td className="px-4 py-2 font-semibold">{row.total}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {fmt(row.lastUnsubscribedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent unsubscribes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!report?.events.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {report.events.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{event.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.campaignName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">
                      {SOURCE_LABEL[event.source] ?? event.source}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmt(event.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
