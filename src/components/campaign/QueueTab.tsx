import { useMemo, useState } from "react";
import type { SendFailureDescription } from "@/lib/delivery-lifecycle";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Inbox,
  Loader2,
  MailCheck,
  RotateCcw,
  Search,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MESSAGE_STATUSES,
  listCampaignQueue,
  updateQueueMessages,
  type MessageStatus,
  type QueueMessage,
} from "@/lib/queue.functions";
import {
  REPLY_SENTIMENTS,
  REPLY_SENTIMENT_LABELS,
  type ReplySentiment,
} from "@/lib/reply-model";
import { deleteReply, recordReply } from "@/lib/replies.functions";
import { explainBounce, type BounceExplanation } from "@/lib/bounce-reason";
import { processCampaignQueue } from "@/lib/dispatch.functions";
import { cn } from "@/lib/utils";
import type { CampaignBuilder } from "./useCampaignBuilder";


/**
 * A message is a bounce when the provider said so, or when it was cancelled
 * because this recipient bounced earlier in the sequence. The reason text is
 * turned into a short label by the shared `@/lib/bounce-reason` helper.
 */
function failureOf(m: QueueMessage): SendFailureDescription | null {
  return ((m as unknown as { failure?: SendFailureDescription | null }).failure ?? null);
}

function bounceOf(m: QueueMessage): BounceExplanation | null {
  const isBounce = Boolean(m.bounced_at) || m.cancelled_reason === "recipient_bounced";
  if (!isBounce) return null;
  return explainBounce(m.bounce_reason);
}

const STATUS_STYLES: Record<MessageStatus | "bounced" | "unsubscribed", string> = {
  pending: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  processing: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  sent: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  // Failed = internal send failures only; bounces are their own chip below.
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  bounced: "bg-destructive/10 text-destructive border-destructive/20",
  unsubscribed: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function QueueTab({ builder }: { builder: CampaignBuilder }) {
  const queryClient = useQueryClient();
  const fetchQueue = useServerFn(listCampaignQueue);
  const updateFn = useServerFn(updateQueueMessages);
  const dispatchFn = useServerFn(processCampaignQueue);
  const replyFn = useServerFn(recordReply);
  const deleteReplyFn = useServerFn(deleteReply);


  const [status, setStatus] = useState<MessageStatus | "bounced" | "unsubscribed" | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<QueueMessage | null>(null);
  const [replyFor, setReplyFor] = useState<QueueMessage | null>(null);
  const [replyForm, setReplyForm] = useState({
    fromEmail: "",
    subject: "",
    body: "",
    receivedAt: "",
    sentiment: "positive" as ReplySentiment,
  });

  const queueQuery = useQuery({
    queryKey: ["campaign-queue", builder.campaignId, status, search],
    queryFn: () =>
      fetchQueue({
        data: {
          campaignId: builder.campaignId,
          status: status === "bounced" || status === "unsubscribed" ? null : status,
          bounced: status === "bounced" ? true : undefined,
          unsubscribed: status === "unsubscribed" ? true : undefined,
          search: search || undefined,
          limit: 200,
        },
      }),
  });

  const messages = useMemo(() => queueQuery.data?.messages ?? [], [queueQuery.data]);
  const counts = queueQuery.data?.counts;
  const byMailbox = queueQuery.data?.byMailbox ?? [];
  const replies = queueQuery.data?.replies ?? [];
  const repliesByMessage = queueQuery.data?.repliesByMessage ?? {};
  const mailboxById = useMemo(
    () => new Map((queueQuery.data?.accounts ?? []).map((a) => [a.id, a] as const)),
    [queueQuery.data],
  );
  const mailboxLabel = (id: string | null) =>
    id ? (mailboxById.get(id)?.label ?? "Unknown mailbox") : "Unassigned";
  const mailboxEmail = (id: string | null) => (id ? (mailboxById.get(id)?.from_email ?? "") : "");

  const openReply = (message: QueueMessage) => {
    setReplyFor(message);
    setReplyForm({
      fromEmail: message.to_email,
      subject: `Re: ${message.subject}`,
      body: "",
      receivedAt: "",
      sentiment: "positive",
    });
  };

  const saveReply = useMutation({
    mutationFn: () =>
      replyFn({
        data: {
          messageId: replyFor!.id,
          fromEmail: replyForm.fromEmail.trim() || undefined,
          subject: replyForm.subject.trim() || undefined,
          body: replyForm.body.trim() || undefined,
          receivedAt: replyForm.receivedAt
            ? new Date(replyForm.receivedAt).toISOString()
            : undefined,
          sentiment: replyForm.sentiment,
        },
      }),
    onSuccess: async (result) => {
      setReplyFor(null);
      toast.success(
        result.stoppedSequence
          ? "Reply saved — remaining follow-ups stopped"
          : "Reply saved to the lead",
      );
      await queryClient.invalidateQueries({ queryKey: ["campaign-queue", builder.campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["lead-detail"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeReply = useMutation({
    mutationFn: (id: string) => deleteReplyFn({ data: { id } }),
    onSuccess: async () => {
      toast.success("Reply removed");
      await queryClient.invalidateQueries({ queryKey: ["campaign-queue", builder.campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["lead-detail"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const act = useMutation({
    mutationFn: (action: "cancel" | "requeue" | "delete") =>
      updateFn({ data: { ids: selected, action } }),
    onSuccess: async () => {
      setSelected([]);
      toast.success("Queue updated");
      await queryClient.invalidateQueries({ queryKey: ["campaign-queue", builder.campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispatch = useMutation({
    mutationFn: (force: boolean) =>
      dispatchFn({ data: { campaignId: builder.campaignId, limit: 25, force } }),
    onSuccess: async (result) => {
      if (result.sent) toast.success(`Sent ${result.sent} email${result.sent === 1 ? "" : "s"}`);
      else if (result.failed) toast.error(result.errors[0] ?? "Sending failed");
      else if (result.skipped) toast.message("Nothing sent — mailboxes are paused or at their cap.");
      else toast.message("No messages are due right now.");
      await queryClient.invalidateQueries({ queryKey: ["campaign-queue", builder.campaignId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allSelected = messages.length > 0 && selected.length === messages.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-9">
        {([...MESSAGE_STATUSES, "bounced", "unsubscribed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(status === s ? null : s)}
            className={cn(
              "surface-card px-4 py-3 text-left transition hover:border-primary/40",
              status === s && "border-primary ring-1 ring-primary/30",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {s}
            </p>
            <p className="text-xl font-semibold tabular-nums">{counts?.[s] ?? 0}</p>
          </button>
        ))}
        <div className="surface-card px-4 py-3 text-left" title="Interrupted or timed-out sends whose outcome is unknown. Never resent automatically.">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            held for review
          </p>
          <p className="text-xl font-semibold tabular-nums">{(counts as { unknown?: number } | undefined)?.unknown ?? 0}</p>
        </div>
      </div>

      {byMailbox.length ? (
        <section className="surface-card p-4">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Send log by mailbox</h3>
            <span className="text-xs text-muted-foreground">
              {byMailbox.length} mailbox{byMailbox.length === 1 ? "" : "es"} in rotation
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byMailbox.map((m) => (
              <div key={m.accountId} className="rounded-lg border border-border p-3">
                <p className="truncate text-sm font-medium">{m.label}</p>
                <p className="truncate text-xs text-muted-foreground">{m.fromEmail}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">{m.total}</span>{" "}
                  queued · <span className="tabular-nums">{m.sent}</span> sent
                  {m.failed ? (
                    <>
                      {" "}
                      · <span className="tabular-nums text-destructive">{m.failed}</span> failed
                    </>
                  ) : null}
                  {m.bounced ? (
                    <>
                      {" "}
                      · <span className="tabular-nums text-destructive">{m.bounced}</span> bounced
                    </>
                  ) : null}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface-card p-4">
        <div className="flex items-center gap-2">
          <MailCheck className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Replies</h3>
          <span className="text-xs text-muted-foreground">
            {replies.length} tracked repl{replies.length === 1 ? "y" : "ies"}
          </span>
        </div>
        {replies.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No replies logged yet. Open a sent message and choose “Log reply” to record one — it is
            saved to the lead with its date and email address.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {replies.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.from_email}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.subject ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {REPLY_SENTIMENT_LABELS[r.sentiment] ?? r.sentiment}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{when(r.received_at)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove reply"
                    onClick={() => removeReply.mutate(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>



      <div className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient email…"
              className="pl-9"
            />
          </div>
          <Button
            size="sm"
            onClick={() => dispatch.mutate(false)}
            disabled={dispatch.isPending}
          >
            {dispatch.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            Send due now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => dispatch.mutate(true)}
            disabled={dispatch.isPending}
          >
            Send next batch
          </Button>
          <span className="text-xs text-muted-foreground">
            Active campaigns also send and queue follow-ups automatically.
          </span>
          {status ? (
            <Button variant="ghost" size="sm" onClick={() => setStatus(null)}>
              Clear filter
            </Button>
          ) : null}

          {selected.length ? (
            <>
              <span className="text-sm text-muted-foreground">{selected.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => act.mutate("requeue")}>
                <RotateCcw className="mr-1.5 size-4" /> Requeue
              </Button>
              <Button size="sm" variant="outline" onClick={() => act.mutate("cancel")}>
                <XCircle className="mr-1.5 size-4" /> Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={() => act.mutate("delete")}>
                <Trash2 className="mr-1.5 size-4" /> Remove
              </Button>
            </>
          ) : null}
        </div>

        {queueQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No messages in the queue yet. Launch the campaign to schedule the first email for each
            lead.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => setSelected(v ? messages.map((m) => m.id) : [])}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2">Recipient</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sent from</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Reply</th>
                  <th className="px-3 py-2">Delivery ID</th>

                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr
                    key={m.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    onClick={() => setDetail(m)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.includes(m.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) =>
                            v ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                          )
                        }
                        aria-label={`Select ${m.to_email}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{m.to_email}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.subject}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">#{m.step_order}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={bounceOf(m) ? STATUS_STYLES.bounced : STATUS_STYLES[m.status]}
                      >
                        {bounceOf(m) ? "bounced" : m.status}
                      </Badge>
                      {!bounceOf(m) && m.status === "failed" && failureOf(m) ? (
                        <p className="mt-0.5 max-w-[16rem] text-xs text-muted-foreground">
                          {failureOf(m)!.category === "outcome_unknown" ? "Held for review" : failureOf(m)!.label}
                          {failureOf(m)!.code ? ` · ${failureOf(m)!.code}` : ""}
                        </p>
                      ) : null}
                      {bounceOf(m) ? (
                        <p className="mt-0.5 max-w-[16rem] text-xs text-destructive">
                          {bounceOf(m)!.label}
                          {bounceOf(m)!.code ? ` · ${bounceOf(m)!.code}` : ""}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <p className="truncate text-xs font-medium">
                        {mailboxLabel(m.sending_account_id)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {mailboxEmail(m.sending_account_id)}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {when(m.scheduled_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{when(m.sent_at)}</td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {repliesByMessage[m.id] ? (
                        <div>
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20"
                          >
                            replied
                          </Badge>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {when(repliesByMessage[m.id]!.received_at)}
                          </p>
                        </div>
                      ) : m.status === "sent" ? (
                        <Button size="sm" variant="outline" onClick={() => openReply(m)}>
                          <MailCheck className="mr-1.5 size-4" /> Log reply
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {m.provider_message_id ?? "—"}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message details</DialogTitle>
            <DialogDescription>{detail?.to_email}</DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Status" value={detail.status} />
                <Detail label="Step" value={`#${detail.step_order}`} />
                <Detail label="Scheduled" value={when(detail.scheduled_at)} />
                <Detail label="Sent" value={when(detail.sent_at)} />
                <Detail label="Sent from" value={mailboxLabel(detail.sending_account_id)} />
                <Detail label="Mailbox address" value={mailboxEmail(detail.sending_account_id) || "—"} />
                <Detail label="Sending infrastructure" value="MunchReach" />
                <Detail label="Attempts" value={String(detail.attempts)} />
                <Detail label="Delivery ID" value={detail.provider_message_id ?? "—"} />
                <Detail
                  label="Reply received"
                  value={
                    repliesByMessage[detail.id]
                      ? `${when(repliesByMessage[detail.id]!.received_at)} · ${repliesByMessage[detail.id]!.from_email}`
                      : "—"
                  }
                />
              </div>
              {detail.status === "sent" && !repliesByMessage[detail.id] ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openReply(detail);
                    setDetail(null);
                  }}
                >
                  <MailCheck className="mr-1.5 size-4" /> Log reply
                </Button>
              ) : null}
              {bounceOf(detail) ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                    Why this bounced
                  </p>
                  <p className="mt-1 text-sm font-medium text-destructive">
                    {bounceOf(detail)!.label}
                    {bounceOf(detail)!.code ? ` · code ${bounceOf(detail)!.code}` : ""}
                  </p>
                  {bounceOf(detail)!.detail ? (
                    <p className="mt-1 text-xs text-destructive/90">{bounceOf(detail)!.detail}</p>
                  ) : (
                    <p className="mt-1 text-xs text-destructive/90">
                      The receiving server did not give a reason.
                    </p>
                  )}
                  {detail.bounced_at ? (
                    <p className="mt-1 text-xs text-destructive/80">
                      Recorded {when(detail.bounced_at)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {failureOf(detail) && !bounceOf(detail) ? (
                <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="font-medium">{failureOf(detail)!.label}</p>
                  {failureOf(detail)!.code ? <p className="mt-1">Server code: {failureOf(detail)!.code}</p> : null}
                </div>
              ) : null}
              {detail.last_error && !bounceOf(detail) ? (
                <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  {detail.last_error}
                </p>
              ) : null}
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Subject
                </p>
                <p className="font-medium">{detail.subject}</p>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">
                {detail.body}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(replyFor)} onOpenChange={(open) => !open && setReplyFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log a reply</DialogTitle>
            <DialogDescription>
              Saved to the lead’s detail panel with the date and email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reply-from">Reply from</Label>
              <Input
                id="reply-from"
                type="email"
                value={replyForm.fromEmail}
                onChange={(e) => setReplyForm((f) => ({ ...f, fromEmail: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reply-date">Received</Label>
                <Input
                  id="reply-date"
                  type="datetime-local"
                  value={replyForm.receivedAt}
                  onChange={(e) => setReplyForm((f) => ({ ...f, receivedAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sentiment</Label>
                <Select
                  value={replyForm.sentiment}
                  onValueChange={(v) =>
                    setReplyForm((f) => ({ ...f, sentiment: v as ReplySentiment }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPLY_SENTIMENTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {REPLY_SENTIMENT_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-subject">Subject</Label>
              <Input
                id="reply-subject"
                value={replyForm.subject}
                onChange={(e) => setReplyForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-body">Message</Label>
              <Textarea
                id="reply-body"
                rows={5}
                value={replyForm.body}
                placeholder="Paste what the lead wrote back…"
                onChange={(e) => setReplyForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!replyForm.fromEmail.trim() || saveReply.isPending}
              onClick={() => saveReply.mutate()}
            >
              {saveReply.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="break-all font-mono text-xs">{value}</p>
    </div>
  );
}
