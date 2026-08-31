/**
 * Admin → Webhooks. Real webhook activity across billing, referral and
 * integration endpoints. Payloads are only shown for events whose signature
 * was verified at receipt; retry replays a stored event through the existing
 * idempotent billing pipeline.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminGetWebhookEvent,
  adminListWebhookActivity,
  adminRetryWebhookEvent,
} from "@/lib/admin-platform.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/webhooks")({
  head: () => ({
    meta: [
      { title: "Webhooks — MunchReach Admin" },
      {
        name: "description",
        content: "Monitor verified webhook deliveries, processing results and retries.",
      },
      { property: "og:title", content: "Webhooks — MunchReach Admin" },
      { property: "og:description", content: "Webhook delivery and processing monitor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminWebhooksPage,
});

const SOURCES = ["all", "billing", "referral", "integration"] as const;

function AdminWebhooksPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(adminListWebhookActivity);
  const detail = useServerFn(adminGetWebhookEvent);
  const retry = useServerFn(adminRetryWebhookEvent);

  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ source: "billing" | "referral" | "integration"; id: string } | null>(
    null,
  );

  const events = useQuery({
    queryKey: ["admin", "webhooks", source, search],
    queryFn: () => list({ data: { source, search } }),
  });

  const event = useQuery({
    queryKey: ["admin", "webhook", selected?.source, selected?.id],
    queryFn: () => detail({ data: selected! }),
    enabled: Boolean(selected),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => retry({ data: { id } }),
    onSuccess: () => {
      toast.success("Event replayed through the idempotent pipeline");
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = events.data ?? [];

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Only signature-verified events are processed. Retries reuse the stored payload and the
            existing idempotency keys, so an event is never applied twice.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SOURCES.map((s) => (
            <Button key={s} size="sm" variant={source === s ? "default" : "outline"} onClick={() => setSource(s)}>
              {s}
            </Button>
          ))}
          <Input
            className="h-9 w-56"
            placeholder="Search provider, event, error"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Processed</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  Loading webhook activity…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  No webhook events recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.source}-${row.id}`}>
                  <TableCell>
                    <div className="font-medium">{row.provider}</div>
                    <div className="text-xs uppercase text-muted-foreground">{row.source}</div>
                  </TableCell>
                  <TableCell className="text-sm">{row.event}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                    {row.signatureOk === false ? (
                      <div className="text-xs text-destructive">signature rejected</div>
                    ) : null}
                    {row.error ? (
                      <div className="max-w-[240px] truncate text-xs text-destructive">{row.error}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.receivedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.processedAt ? new Date(row.processedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>{row.retryCount}</TableCell>
                  <TableCell className="text-xs uppercase">{row.environment}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected({ source: row.source, id: row.id })}
                      >
                        View
                      </Button>
                      {row.canRetry ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(row.id)}
                        >
                          <RefreshCcw className="size-4" />
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Webhook event</SheetTitle>
            <SheetDescription>Processing result and stored payload.</SheetDescription>
          </SheetHeader>
          {event.data ? (
            <div className="space-y-4 p-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Provider" value={event.data.provider} />
                <Field label="Event" value={event.data.event} />
                <Field label="Event id" value={event.data.eventId} />
                <Field label="Environment" value={event.data.environment} />
                <Field label="Status" value={event.data.status} />
                <Field
                  label="Signature"
                  value={
                    event.data.signatureOk === null
                      ? "n/a"
                      : event.data.signatureOk
                        ? "verified"
                        : "rejected"
                  }
                />
                <Field label="Received" value={new Date(event.data.receivedAt).toLocaleString()} />
                <Field
                  label="Processed"
                  value={event.data.processedAt ? new Date(event.data.processedAt).toLocaleString() : "—"}
                />
                <Field label="Retries" value={String(event.data.retryCount)} />
                <Field label="HTTP status" value={event.data.httpStatus ? String(event.data.httpStatus) : "—"} />
              </dl>
              {event.data.error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {event.data.error}
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Payload</p>
                <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(event.data.payload, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Loading event…</p>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="break-all font-medium">{value}</dd>
    </div>
  );
}
