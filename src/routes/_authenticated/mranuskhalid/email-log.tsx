import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Search, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getTransactionalEmail,
  listTransactionalEmails,
  resendTransactionalEmail,
} from "@/lib/transactional-email.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/email-log")({
  head: () => ({
    meta: [
      { title: "System Email Log — MunchReach Admin" },
      {
        name: "description",
        content:
          "Delivery log for every MunchReach system email: recipient, status, retries, provider response and resend controls.",
      },
      { property: "og:title", content: "System Email Log — MunchReach Admin" },
      { property: "og:description", content: "Track delivery of every MunchReach system email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmailLogPage,
});

const STATUSES = ["all", "queued", "retrying", "sending", "sent", "delivered", "failed", "outcome_unknown", "bounced", "complained"];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["sent", "delivered"].includes(status)) return "default";
  if (["failed", "outcome_unknown", "bounced", "complained"].includes(status)) return "destructive";
  if (["queued", "retrying", "sending"].includes(status)) return "secondary";
  return "outline";
}

function EmailLogPage() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listTransactionalEmails);
  const fetchOne = useServerFn(getTransactionalEmail);
  const resendFn = useServerFn(resendTransactionalEmail);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "email-log", status, search],
    queryFn: () => fetchList({ data: search ? { status, search, limit: 200 } : { status, limit: 200 } }),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "email-log", "detail", openId],
    queryFn: () => fetchOne({ data: { id: openId! } }),
    enabled: !!openId,
  });

  const resend = useMutation({
    mutationFn: (id: string) => resendFn({ data: { id } }),
    onSuccess: (res) => {
      toast[res.ok ? "success" : "message"](res.ok ? "Email resent" : "Re-queued for delivery");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = listQuery.data?.stats ?? {};
  const emails = listQuery.data?.emails ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detail = detailQuery.data as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Email Log</h1>
          <p className="text-sm text-muted-foreground">
            Every system email MunchReach queued, sent, retried or failed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/mranuskhalid/system-emails">Templates</Link>
          </Button>
          <Button variant="outline" onClick={() => listQuery.refetch()}>
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {["sent", "delivered", "queued", "retrying", "failed"].map((key) => (
          <Card key={key}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{key} (7d)</p>
              <p className="text-2xl font-semibold">{stats[key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading log…
            </div>
          ) : (
            <div className="divide-y">
              {emails.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-56 flex-1">
                    <p className="font-medium">{row.to_email}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.subject}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{row.event_key}</p>
                  </div>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  {row.test_mode ? <Badge variant="outline">test</Badge> : null}
                  <span className="w-20 text-xs text-muted-foreground">
                    {row.attempts}/{row.max_attempts}
                  </span>
                  <span className="w-40 text-xs text-muted-foreground">
                    {new Date(row.sent_at ?? row.queued_at).toLocaleString()}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(row.id)}>
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resend.mutate(row.id)}
                      disabled={resend.isPending}
                    >
                      <Send className="mr-1 size-3" /> Resend
                    </Button>
                  </div>
                </div>
              ))}
              {emails.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No emails match these filters.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!openId} onOpenChange={(open) => (open ? null : setOpenId(null))}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email details</DialogTitle>
            <DialogDescription className="font-mono text-xs">{detail?.event_key}</DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading || !detail ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <Info label="Recipient" value={detail.to_email} />
                <Info label="Status" value={detail.status} />
                <Info label="Subject" value={detail.subject} />
                <Info label="Sending infrastructure" value={detail.provider ?? "—"} />
                <Info label="Message ID" value={detail.provider_message_id ?? "—"} />
                <Info label="Attempts" value={`${detail.attempts}/${detail.max_attempts}`} />
                <Info label="Queued" value={new Date(detail.queued_at).toLocaleString()} />
                <Info label="Sent" value={detail.sent_at ? new Date(detail.sent_at).toLocaleString() : "—"} />
              </dl>
              {detail.error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <p className="font-medium">Provider error (internal)</p>
                  <p className="font-mono">{detail.error}</p>
                </div>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Variables</p>
                <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(detail.variables, null, 2)}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Rendered email</p>
                <iframe
                  title="Sent email"
                  srcDoc={detail.html ?? ""}
                  sandbox=""
                  className="h-72 w-full rounded border bg-white"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
