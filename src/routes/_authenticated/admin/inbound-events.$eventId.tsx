import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getInboundEventDetail,
  reprocessEmailEvent,
  retryEmailEvent,
} from "@/lib/ops.functions";

export const Route = createFileRoute("/_authenticated/admin/inbound-events/$eventId")({
  head: () => ({
    meta: [
      { title: "Inbound Event Detail — Sendloop Admin" },
      {
        name: "description",
        content:
          "Full inbound webhook event detail: redacted payload and headers, signature verdict, routing token lookup and linked conversation.",
      },
      { property: "og:title", content: "Inbound Event Detail — Sendloop Admin" },
      {
        property: "og:description",
        content: "Inspect one inbound webhook delivery end to end.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventDetailPage,
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[65%] break-words text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getInboundEventDetail);
  const retry = useServerFn(retryEmailEvent);
  const reprocess = useServerFn(reprocessEmailEvent);

  const detail = useQuery({
    queryKey: ["inbound-event", eventId],
    queryFn: () => fetchDetail({ data: { id: eventId } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["inbound-event", eventId] });

  const retryMutation = useMutation({
    mutationFn: () => retry({ data: { id: eventId } }),
    onSuccess: (result) => {
      toast.success(`Retry finished: ${result.status}`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reprocessMutation = useMutation({
    mutationFn: () => reprocess({ data: { id: eventId } }),
    onSuccess: (result) => {
      toast.success(`Reprocessed: ${result.status}`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detail.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading event…</p>;
  }
  if (detail.error) {
    return <p className="text-sm text-destructive">{(detail.error as Error).message}</p>;
  }

  const data = detail.data!;
  const event = data.event;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/admin/inbound-events">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All events
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {event.subject || "Inbound delivery"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {event.from_email ?? "unknown sender"} → {event.to_email ?? "—"} ·{" "}
            {when(event.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Retry
          </Button>
          <Button
            variant="ghost"
            disabled={reprocessMutation.isPending}
            onClick={() => reprocessMutation.mutate()}
          >
            <RotateCw className="mr-1 h-4 w-4" /> Reprocess
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
            <CardDescription>Processing state and idempotency.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Event id" value={<span className="font-mono text-xs">{event.id}</span>} />
            <Row label="Provider" value={event.provider} />
            <Row label="Type" value={event.event_type} />
            <Row label="Status" value={<Badge variant="outline">{event.status}</Badge>} />
            <Row
              label="Signature"
              value={
                <span>
                  <Badge variant="outline">{event.signature_status}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {event.signature_detail ?? ""}
                  </span>
                </span>
              }
            />
            <Row
              label="Idempotency key"
              value={<span className="font-mono text-xs">{event.external_id ?? "none"}</span>}
            />
            <Row label="Duplicates ignored" value={event.duplicate_count ?? 0} />
            <Row
              label="Attempts"
              value={`${event.attempts ?? 0} of ${data.maxRetries} · last ${when(event.last_retry_at)}`}
            />
            <Row label="Next automatic retry" value={when(data.nextRetryAt)} />
            <Row label="Processed at" value={when(event.processed_at)} />
            {event.error ? (
              <Row label="Error" value={<span className="text-destructive">{event.error}</span>} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Routing &amp; links</CardTitle>
            <CardDescription>Token lookup and the records this event touched.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row
              label="Routing token"
              value={<span className="font-mono text-xs">{event.routing_token ?? "none"}</span>}
            />
            <Row label="Token status" value={event.token_status ?? "—"} />
            <Row label="Failure code" value={event.failure_code ?? "—"} />
            <Row
              label="Route record"
              value={
                data.route
                  ? `${data.route.purpose} · last used ${when(data.route.last_used_at)}`
                  : "No matching route"
              }
            />
            <Row
              label="Workspace"
              value={
                <span className="font-mono text-xs">
                  {event.workspace_id ?? data.route?.workspace_id ?? "—"}
                </span>
              }
            />
            <Row
              label="Conversation"
              value={
                data.conversation ? (
                  <Link
                    to="/inbox"
                    className="font-mono text-xs text-primary hover:underline"
                    search={{ conversation: data.conversation.id } as never}
                  >
                    {data.conversation.id}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{event.conversation_id ?? "—"}</span>
                )
              }
            />
            <Row
              label="Thread"
              value={
                data.conversation
                  ? `${data.conversation.subject} · ${data.conversation.message_count} messages · ${data.conversation.status}`
                  : "—"
              }
            />
            <Row
              label="Prospect"
              value={
                data.lead
                  ? `${data.lead.email}${data.lead.company ? ` · ${data.lead.company}` : ""}`
                  : (event.lead_id ?? "—")
              }
            />
            <Row
              label="Lead id"
              value={<span className="font-mono text-xs">{event.lead_id ?? "—"}</span>}
            />
          </CardContent>
        </Card>
      </div>

      {data.headersJson ? (
        <Card>
          <CardHeader>
            <CardTitle>Headers</CardTitle>
            <CardDescription>Authorization-style values are redacted.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs">
              {data.headersJson}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Raw payload</CardTitle>
          <CardDescription>
            Stored exactly as received; secrets, tokens and signatures are redacted before display.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted p-4 text-xs">
            {data.payloadJson}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
