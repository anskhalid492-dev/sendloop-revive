import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Inbox, Link2, Loader2, RefreshCcw, RotateCcw, RotateCw, Wrench } from "lucide-react";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MxChecker } from "@/components/admin/MxChecker";
import { WebhookStatus } from "@/components/admin/WebhookStatus";
import {
  getRoutingFailures,
  listEmailEvents,
  listUnmatchedEmails,
  repairEventConversationLink,
  reprocessEmailEvent,
  retryEmailEvent,
  retryUnmatchedEmail,
  runReconciliation,
} from "@/lib/ops.functions";


export const Route = createFileRoute("/_authenticated/admin/inbound-events")({
  head: () => ({
    meta: [
      { title: "Inbound Events — MunchReach Admin" },
      {
        name: "description",
        content:
          "Every inbound webhook delivery with signature, idempotency and routing status, plus retry and reprocess controls.",
      },
      { property: "og:title", content: "Inbound Events — MunchReach Admin" },
      {
        property: "og:description",
        content: "Audit, retry and reprocess inbound email webhook deliveries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminInboundEventsPage,
});

const STATUS_TONE: Record<string, string> = {
  processed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  pending: "bg-muted text-muted-foreground border-border",
  retrying: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  ignored: "bg-muted text-muted-foreground border-border",
};

const SIGNATURE_TONE: Record<string, string> = {
  valid: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  invalid: "bg-destructive/10 text-destructive border-destructive/20",
  missing: "bg-destructive/10 text-destructive border-destructive/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  unverified: "bg-muted text-muted-foreground border-border",
};

const ISSUE_LABEL: Record<string, string> = {
  dangling_conversation: "Dangling conversation",
  missing_link: "Missing link",
  no_conversation: "No conversation",
  unprocessed: "Never processed",
  thread_mismatch: "Thread mismatch",
};

const ISSUE_TONE: Record<string, string> = {
  missing_link: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  thread_mismatch: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  dangling_conversation: "bg-destructive/10 text-destructive border-destructive/20",
  no_conversation: "bg-destructive/10 text-destructive border-destructive/20",
  unprocessed: "bg-destructive/10 text-destructive border-destructive/20",
};

const TOKEN_LABEL: Record<string, string> = {
  matched: "Matched",
  invalid: "Invalid token",
  none: "No token",
  unmatched: "Unmatched thread",
};

/** Jumps straight to the exact unified inbox conversation for a row. */
function InboxThreadLink({ conversationId }: { conversationId: string | null | undefined }) {
  if (!conversationId) {
    return <span className="text-[11px] text-muted-foreground">No thread</span>;
  }
  return (
    <Link
      to="/inbox"
      search={{ conversation: conversationId }}
      className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
    >
      <Inbox className="h-3 w-3" /> Open inbox thread
    </Link>
  );
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function AdminInboundEventsPage() {
  const queryClient = useQueryClient();
  const fetchEvents = useServerFn(listEmailEvents);
  const fetchFailures = useServerFn(getRoutingFailures);
  const retry = useServerFn(retryEmailEvent);
  const reprocess = useServerFn(reprocessEmailEvent);
  const reconcile = useServerFn(runReconciliation);
  const repairLink = useServerFn(repairEventConversationLink);
  const fetchUnmatched = useServerFn(listUnmatchedEmails);
  const retryUnmatched = useServerFn(retryUnmatchedEmail);

  const unmatchedQuery = useQuery({
    queryKey: ["unmatched-inbound"],
    queryFn: () => fetchUnmatched({}),
  });
  const retryUnmatchedMutation = useMutation({
    mutationFn: (id: string) => retryUnmatched({ data: { id } }),
    onSuccess: (result: { status: string }) => {
      toast[result.status === "unmatched" ? "error" : "success"](
        result.status === "unmatched"
          ? "Still no matching mailbox for this reply."
          : "Reply moved into the unified inbox.",
      );
      void queryClient.invalidateQueries({ queryKey: ["unmatched-inbound"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const [status, setStatus] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [signature, setSignature] = useState("all");
  const [tokenStatus, setTokenStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const filters = { status, eventType, signature, tokenStatus, from, to, search };

  const eventsQuery = useQuery({
    queryKey: ["inbound-events", filters],
    queryFn: () =>
      fetchEvents({
        data: {
          status: status as never,
          eventType,
          signature: signature as never,
          tokenStatus: tokenStatus as never,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(search ? { search } : {}),
          limit: 200,
        },
      }),
  });

  const reconciliation = useQuery({
    queryKey: ["inbound-reconciliation"],
    queryFn: () => reconcile({}),
  });

  const repairMutation = useMutation({
    mutationFn: (id: string) => repairLink({ data: { id } }),
    onSuccess: () => {
      toast.success("Event relinked to its conversation");
      void queryClient.invalidateQueries({ queryKey: ["inbound-reconciliation"] });
      void queryClient.invalidateQueries({ queryKey: ["inbound-events"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function exportCsv() {
    const rows = eventsQuery.data?.events ?? [];
    if (!rows.length) {
      toast.error("Nothing to export with the current filters.");
      return;
    }
    const columns = [
      "id",
      "created_at",
      "provider",
      "event_type",
      "status",
      "signature_status",
      "token_status",
      "routing_token",
      "failure_code",
      "attempts",
      "duplicate_count",
      "from_email",
      "to_email",
      "subject",
      "message_id",
      "external_id",
      "workspace_id",
      "conversation_id",
      "lead_id",
      "error",
    ];
    const escape = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const csv = [
      columns.join(","),
      ...rows.map((row: any) => columns.map((c) => escape(row[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `munchreach-inbound-events-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const failuresQuery = useQuery({
    queryKey: ["routing-failures"],
    queryFn: () => fetchFailures(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbound-events"] });
    void queryClient.invalidateQueries({ queryKey: ["routing-failures"] });
    void queryClient.invalidateQueries({ queryKey: ["email-events"] });
  };

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`Retry finished: ${result.status}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => reprocess({ data: { id } }),
    onSuccess: (result) => {
      toast.success(`Reprocessed: ${result.status}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = retryMutation.isPending || reprocessMutation.isPending;
  const events = eventsQuery.data?.events ?? [];
  const failures = failuresQuery.data?.failures ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inbound events</h1>
        <p className="text-sm text-muted-foreground">
          Every webhook delivery MunchReach received, with signature verification, idempotency state
          and routing outcome.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <WebhookStatus />
        <MxChecker />
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">All events</TabsTrigger>
          <TabsTrigger value="routing">
            Routing failures{failures.length ? ` (${failures.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched inbox
            {unmatchedQuery.data?.rows.length ? ` (${unmatchedQuery.data.rows.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>

        </TabsList>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Webhook deliveries</CardTitle>
                <CardDescription>
                  Duplicates are counted, not reprocessed — every handler is idempotent.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search email, subject, token, message id"
                  className="h-9 w-64"
                />
                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  label="Status"
                  options={["all", "pending", "processed", "failed", "retrying", "ignored"]}
                />
                <FilterSelect
                  value={eventType}
                  onChange={setEventType}
                  label="Type"
                  options={["all", "inbound", "delivered", "bounced", "complained", "unsubscribed"]}
                />
                <FilterSelect
                  value={signature}
                  onChange={setSignature}
                  label="Signature"
                  options={["all", "valid", "invalid", "missing", "failed", "unverified"]}
                />
                <FilterSelect
                  value={tokenStatus}
                  onChange={setTokenStatus}
                  label="Token"
                  options={["all", "matched", "invalid", "none", "unmatched"]}
                />
                <Input
                  type="date"
                  className="h-9 w-36"
                  aria-label="From date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
                <Input
                  type="date"
                  className="h-9 w-36"
                  aria-label="To date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <Download className="mr-1 h-3.5 w-3.5" /> CSV
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh events"
                  onClick={() => void eventsQuery.refetch()}
                >
                  <RefreshCcw
                    className={eventsQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                  />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Signature</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Idempotency</TableHead>
                    <TableHead>Thread</TableHead>
                    <TableHead className="text-right">Retries</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        Loading events…
                      </TableCell>
                    </TableRow>
                  ) : events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-sm text-muted-foreground">
                        No webhook deliveries recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    events.map((event: any) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {when(event.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">{event.event_type}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-xs">
                          {event.from_email ?? "—"} → {event.to_email ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={SIGNATURE_TONE[event.signature_status ?? "unverified"]}
                            title={event.signature_detail ?? undefined}
                          >
                            {event.signature_status ?? "unverified"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_TONE[event.status]}>
                            {event.status}
                          </Badge>
                          {event.error ? (
                            <p className="mt-1 max-w-[220px] truncate text-[11px] text-destructive">
                              {event.error}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          {event.external_id ? (
                            <span className="font-mono">{event.external_id.slice(0, 18)}</span>
                          ) : (
                            <span className="text-muted-foreground">no key</span>
                          )}
                          <div className="text-[11px] text-muted-foreground">
                            {event.duplicate_count > 0
                              ? `${event.duplicate_count} duplicate${event.duplicate_count > 1 ? "s" : ""} ignored`
                              : "first delivery"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <InboxThreadLink conversationId={event.conversation_id} />
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {event.attempts ?? 0}
                          <div className="text-[11px] text-muted-foreground">
                            {event.last_retry_at ? when(event.last_retry_at) : "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild size="sm" variant="ghost">
                              <Link
                                to="/admin/inbound-events/$eventId"
                                params={{ eventId: event.id }}
                              >
                                Details
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => retryMutation.mutate(event.id)}
                            >
                              {retryMutation.isPending &&
                              retryMutation.variables === event.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              )}
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => reprocessMutation.mutate(event.id)}
                            >
                              <RotateCw className="mr-1 h-3.5 w-3.5" />
                              Reprocess
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routing" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Unmatched or invalid routing tokens</CardTitle>
                <CardDescription>
                  Replies that could not be attached to a workspace thread, why they failed, and
                  whether retrying is safe.
                </CardDescription>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Refresh routing failures"
                onClick={() => void failuresQuery.refetch()}
              >
                <RefreshCcw
                  className={failuresQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {failuresQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading failures…</p>
              ) : failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No routing failures — every inbound reply matched a tracked thread.
                </p>
              ) : (
                failures.map((failure: any) => (
                  <div key={failure.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                        {TOKEN_LABEL[failure.token_status] ?? failure.token_status}
                      </Badge>
                      {failure.failure_code ? (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {failure.failure_code}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {when(failure.created_at)}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {failure.attempts ?? 0} retries
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">{failure.from_email ?? "unknown sender"}</span>{" "}
                      → {failure.to_email ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Subject: {failure.subject ?? "—"} · Token:{" "}
                      <span className="font-mono">{failure.routing_token ?? "none"}</span>{" "}
                      {failure.routing_token
                        ? failure.tokenKnown
                          ? "(known route)"
                          : "(unknown route)"
                        : ""}
                    </p>
                    {failure.error ? (
                      <p className="mt-1 text-xs text-destructive">{failure.error}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">{failure.guidance}</p>
                    <div className="mt-2">
                      <InboxThreadLink conversationId={failure.conversation_id} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant={failure.retryable ? "default" : "outline"}
                        disabled={busy}
                        onClick={() => retryMutation.mutate(failure.id)}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        {failure.retryable ? "Retry safely" : "Retry anyway"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => reprocessMutation.mutate(failure.id)}
                      >
                        <RotateCw className="mr-1 h-3.5 w-3.5" />
                        Reprocess
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Event ↔ inbox reconciliation</CardTitle>
                <CardDescription>
                  {reconciliation.data
                    ? `${reconciliation.data.linked} of ${reconciliation.data.scanned} inbound events are linked to a live thread — ${reconciliation.data.mismatched} need attention.`
                    : "Maps every inbound webhook event onto its unified inbox thread and reports the gaps."}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void reconciliation.refetch()}
                disabled={reconciliation.isFetching}
              >
                {reconciliation.isFetching ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                )}
                Run job
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {reconciliation.isLoading ? (
                <p className="text-sm text-muted-foreground">Reconciling…</p>
              ) : (reconciliation.data?.mismatches.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No mismatches — every inbound event maps to a conversation in the unified inbox.
                </p>
              ) : (
                reconciliation.data?.mismatches.map((row) => (
                  <div key={row.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={ISSUE_TONE[row.issue] ?? ""}>
                        {ISSUE_LABEL[row.issue] ?? row.issue}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{when(row.created_at)}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {row.conversation_id ? (
                          <span className="font-mono">{row.conversation_id.slice(0, 8)}</span>
                        ) : (
                          "no conversation"
                        )}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{row.from_email ?? "unknown sender"}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.subject ?? "—"} · {row.detail}
                    </p>
                    <div className="mt-2">
                      <InboxThreadLink conversationId={row.conversation_id} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/admin/inbound-events/$eventId" params={{ eventId: row.id }}>
                          Details
                        </Link>
                      </Button>
                      {row.fixable ? (
                        <Button
                          size="sm"
                          disabled={repairMutation.isPending}
                          onClick={() => repairMutation.mutate(row.id)}
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" /> Relink thread
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => retryMutation.mutate(row.id)}
                        >
                          <Wrench className="mr-1 h-3.5 w-3.5" /> Retry event
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-36" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option === "all" ? `All ${label.toLowerCase()}` : option[0]!.toUpperCase() + option.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
