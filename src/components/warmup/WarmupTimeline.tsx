import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, ListTree, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getWarmupTimeline, type WarmupTimelineMessage } from "@/lib/warmup.functions";
import { PLACEMENT_LABEL, type WarmupPlacement } from "@/lib/warmup-model";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "all", label: "All messages" },
  { value: "pending", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "bounced", label: "Bounced" },
  { value: "replied", label: "Replied" },
  { value: "failed", label: "Failed" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  sent: "bg-primary/10 text-primary",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  replied: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bounced: "bg-destructive/10 text-destructive",
  failed: "bg-destructive/10 text-destructive",
};

const EVENT_DOT: Record<string, string> = {
  queued: "bg-muted-foreground",
  sent: "bg-primary",
  delivered: "bg-emerald-500",
  placement: "bg-sky-500",
  inbox: "bg-emerald-500",
  spam: "bg-amber-500",
  reply: "bg-emerald-500",
  replied: "bg-emerald-500",
  bounce: "bg-destructive",
  bounced: "bg-destructive",
  complaint: "bg-destructive",
  failed: "bg-destructive",
};

function dotFor(type: string) {
  const key = Object.keys(EVENT_DOT).find((k) => type.toLowerCase().includes(k));
  return key ? EVENT_DOT[key] : "bg-muted-foreground";
}

function stamp(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleString();
}

function Row({ message }: { message: WarmupTimelineMessage }) {
  const [open, setOpen] = useState(false);
  const placement = message.placement
    ? (PLACEMENT_LABEL[message.placement as WarmupPlacement] ?? message.placement)
    : "Not available";

  const lifecycle = [
    { label: "Queued", at: message.created_at },
    { label: "Scheduled", at: message.scheduled_at },
    { label: "Sent", at: message.processed_at },
    { label: "Received", at: message.received_at },
    { label: "Placement checked", at: message.placement_checked_at },
  ].filter((step) => Boolean(step.at));

  return (
    <Fragment>
      <tr className="border-b border-border/50 align-top hover:bg-muted/40">
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-start gap-2 text-left"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium">{message.subject}</span>
              <span className="block text-xs text-muted-foreground">
                {message.from_email} → {message.to_email}
              </span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5">
          <Badge
            variant="secondary"
            className={cn("font-normal capitalize", STATUS_STYLE[message.status] ?? "")}
          >
            {message.status}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-sm">{placement}</td>
        <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
          {message.events.length}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground">
          {stamp(message.processed_at ?? message.created_at)}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={5} className="px-3 py-4">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Message lifecycle
                </p>
                <ol className="mt-2 space-y-2">
                  {lifecycle.map((step) => (
                    <li key={step.label} className="flex items-center gap-2 text-sm">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span className="font-medium">{step.label}</span>
                      <span className="text-xs text-muted-foreground">{stamp(step.at)}</span>
                    </li>
                  ))}
                </ol>
                <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <dt className="font-medium">Attempts</dt>
                    <dd>{message.attempts}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-medium">Message reference</dt>
                    <dd className="truncate font-mono">
                      {message.provider_message_id ?? "Not available"}
                    </dd>
                  </div>
                  {message.error ? (
                    <div className="flex gap-2 text-destructive">
                      <dt className="font-medium">Error</dt>
                      <dd>{message.error}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Delivery, bounce &amp; reply log
                </p>
                {message.events.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No events recorded for this message yet.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2 border-l border-border pl-4">
                    {message.events.map((event) => (
                      <li key={event.id} className="relative text-sm">
                        <span
                          className={cn(
                            "absolute -left-[21px] top-1.5 size-2 rounded-full",
                            dotFor(event.type),
                          )}
                        />
                        <p className="font-medium capitalize">{event.type.replace(/_/g, " ")}</p>
                        {event.detail ? (
                          <p className="text-xs text-muted-foreground">{event.detail}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">{stamp(event.occurred_at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function WarmupTimeline({ accountId }: { accountId?: string | undefined }) {
  const fetchTimeline = useServerFn(getWarmupTimeline);
  const [status, setStatus] = useState("all");

  const query = useQuery({
    queryKey: ["warmup-timeline", accountId ?? "all", status],
    queryFn: () =>
      fetchTimeline({
        data: {
          status: status as "all",
          limit: 50,
          ...(accountId ? { accountId } : {}),
        },
      }),
  });

  const messages = query.data?.messages ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ListTree className="size-4 text-primary" /> Warmup run timeline
          </h2>
          <p className="text-xs text-muted-foreground">
            Every warmup message with its own delivery, placement, bounce and reply log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : messages.length === 0 ? (
        <div className="surface-card p-10 text-center">
          <h3 className="text-sm font-semibold">No warmup messages yet</h3>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Once warmup is enabled the engine queues real messages here — each one traceable through
            send, delivery, placement, bounce and reply.
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Message</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Placement</th>
                <th className="px-3 py-2.5 text-right font-medium">Events</th>
                <th className="px-3 py-2.5 text-right font-medium">Last update</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <Row key={message.id} message={message} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
