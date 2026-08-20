import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, Download, Loader2, RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAdminNotifications } from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Alert Audit Log — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every signature-failure and retry-threshold alert MunchReach sent, with destination, delivery status and error details.",
      },
      { property: "og:title", content: "Alert Audit Log — MunchReach Admin" },
      {
        property: "og:description",
        content: "Audit admin alert deliveries by channel, destination and status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminNotificationsPage,
});

const KIND_LABEL: Record<string, string> = {
  signature_failure: "Signature failure",
  retry_threshold: "Retry threshold",
  retry_exhausted: "Retries exhausted",
};

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

type AlertDetail = {
  workspaceId?: string | null;
  workspaceName?: string | null;
  conversationId?: string | null;
  conversationSubject?: string | null;
  prospectEmail?: string | null;
  token?: string | null;
  tokenStatus?: string | null;
};

/** Small preview of the target (workspace, prospect, subject, thread) before opening the inbox. */
function AlertContext({ detail }: { detail: unknown }) {
  const d = (detail ?? {}) as AlertDetail;
  const hasAny = d.workspaceId || d.conversationId || d.prospectEmail || d.token;
  if (!hasAny) return <span className="text-muted-foreground">No routing context</span>;

  return (
    <div className="max-w-[280px] space-y-1 rounded-md border border-border bg-muted/40 p-2">
      <p className="truncate text-xs font-medium">
        {d.workspaceName ?? (d.workspaceId ? `Workspace ${d.workspaceId.slice(0, 8)}` : "Workspace unknown")}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        Prospect: {d.prospectEmail ?? "unknown"}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        Subject: {d.conversationSubject ?? "—"}
      </p>
      <p className="truncate font-mono text-[11px] text-muted-foreground">
        Thread: {d.conversationId ? d.conversationId.slice(0, 8) : d.token ? `token ${d.token.slice(0, 8)}… (${d.tokenStatus ?? "unknown"})` : "none"}
      </p>
      {d.conversationId ? (
        <Link
          to="/inbox"
          search={{ conversation: d.conversationId }}
          className="text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Open inbox thread
        </Link>
      ) : null}
    </div>
  );
}


function AdminNotificationsPage() {
  const [kind, setKind] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const fetchRows = useServerFn(listAdminNotifications);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-notifications", kind, channel, status, search],
    queryFn: () =>
      fetchRows({
        data: {
          kind: kind as never,
          channel: channel as never,
          status: status as never,
          search: search || undefined,
          limit: 200,
        },
      }),
  });

  const rows = data ?? [];

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.status === "sent") acc.sent += 1;
        if (r.status === "failed") acc.failed += 1;
        if (r.status === "skipped") acc.skipped += 1;
        return acc;
      },
      { total: 0, sent: 0, failed: 0, skipped: 0 },
    );
  }, [rows]);

  function exportCsv() {
    const header = [
      "sent_at",
      "kind",
      "title",
      "channel",
      "destination",
      "status",
      "response_code",
      "duration_ms",
      "error",
    ];
    const body = rows.map((r) =>
      [
        r.created_at,
        r.kind,
        r.title,
        r.channel,
        r.destination,
        r.status,
        r.response_code ?? "",
        r.duration_ms ?? "",
        r.error ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sendloop-alert-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <BellRing className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">Alert audit log</h1>
            <p className="truncate text-sm text-muted-foreground">
              Signature-failure and retry-threshold alerts, per destination.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {isFetching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" />
            CSV
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Alerts logged", value: counts.total },
          { label: "Delivered", value: counts.sent },
          { label: "Failed", value: counts.failed },
          { label: "Skipped", value: counts.skipped },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            Each row is one alert delivery attempt to one destination.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              placeholder="Search title, destination or error"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue placeholder="Alert type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All alert types</SelectItem>
                <SelectItem value="signature_failure">Signature failure</SelectItem>
                <SelectItem value="retry_threshold">Retry threshold</SelectItem>
                <SelectItem value="retry_exhausted">Retries exhausted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Alert</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Context</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No alerts have been sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <p className="text-sm font-medium">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {KIND_LABEL[r.kind] ?? r.kind}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{r.channel}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">
                        {r.destination}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground"}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {r.response_code ? `HTTP ${r.response_code}` : "—"}
                        {r.duration_ms ? ` · ${r.duration_ms}ms` : ""}
                      </TableCell>
                      <TableCell className="max-w-[240px] text-xs">
                        <AlertContext detail={r.detail} />
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {r.error ? <span className="line-clamp-2">{r.error}</span> : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
