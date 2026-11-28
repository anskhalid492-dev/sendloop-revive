import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Mail, Paperclip, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { AdminShell } from "@/components/app/AdminShell";
import { BugReportsPanel } from "@/components/admin/BugReportsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { SupportStars } from "@/components/support/SupportStars";
import { SUPPORT_RATING_LABEL, SUPPORT_RATING_VALUES } from "@/lib/support-rating";
import {
  emailAdminTicketReply,
  getAdminAttachmentUrl,
  getAdminTicket,
  getSupportSatisfaction,
  listAdminTickets,
  listSupportAgents,
  replyAdminTicket,
  updateAdminTicket,
} from "@/lib/admin-support.functions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_PRIORITY_STYLE,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_STYLE,
  ticketReference,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support-model";

export const Route = createFileRoute("/_authenticated/mranuskhalid/support")({
  head: () => ({
    meta: [
      { title: "Support Tickets — MunchReach Admin" },
      {
        name: "description",
        content:
          "Triage, assign and answer customer support tickets, with internal notes that customers never see.",
      },
      { property: "og:title", content: "Support Tickets — MunchReach Admin" },
      {
        property: "og:description",
        content: "Customer ticket queue with assignment, status control and internal notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function timeOf(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Page() {
  const queryClient = useQueryClient();
  const fetchTickets = useServerFn(listAdminTickets);
  const fetchAgents = useServerFn(listSupportAgents);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [rating, setRating] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const filters = { search: search.trim() || undefined, status, category, priority, rating };
  const tickets = useQuery({
    queryKey: ["admin-tickets", filters],
    queryFn: () => fetchTickets({ data: filters }),
  });
  const agents = useQuery({ queryKey: ["support-agents"], queryFn: () => fetchAgents() });
  const fetchSatisfaction = useServerFn(getSupportSatisfaction);
  const satisfaction = useQuery({
    queryKey: ["support-satisfaction"],
    queryFn: () => fetchSatisfaction(),
  });

  const rows = tickets.data ?? [];
  const activeId = selected ?? rows[0]?.id ?? null;

  const counts = useMemo(() => {
    const open = rows.filter((t) => t.status === "open").length;
    const waiting = rows.filter((t) => t.status === "waiting_customer").length;
    const progress = rows.filter((t) => t.status === "in_progress").length;
    return { open, waiting, progress, total: rows.length };
  }, [rows]);

  const csat = satisfaction.data;

  return (
    <AdminShell
      title="Support Tickets"
      description="Every customer ticket, with assignment, status control and private internal notes"
    >
      <Tabs defaultValue="tickets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="bugs">Bugs</TabsTrigger>
        </TabsList>

        <TabsContent value="bugs" className="mt-0">
          <BugReportsPanel />
        </TabsContent>

        <TabsContent value="tickets" className="mt-0">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Tickets", value: counts.total },
            { label: "Open", value: counts.open },
            { label: "In progress", value: counts.progress },
            { label: "Waiting on customer", value: counts.waiting },
          ].map((stat) => (
            <div key={stat.label} className="surface-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        <section className="surface-card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Support satisfaction</h2>
              <p className="text-xs text-muted-foreground">
                How customers rated their support experience on resolved and closed tickets.
              </p>
            </div>
            {csat ? <SupportStars value={Math.round(csat.averageRating)} size="md" /> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Average rating</p>
              <p className="mt-1 text-2xl font-semibold">
                {csat && csat.totalRated > 0 ? `${csat.averageRating.toFixed(2)} / 5` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Rated tickets</p>
              <p className="mt-1 text-2xl font-semibold">{csat?.totalRated ?? 0}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Rating rate</p>
              <p className="mt-1 text-2xl font-semibold">{csat ? `${csat.responseRate}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">
                of {csat?.eligibleTickets ?? 0} resolved/closed tickets
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[...SUPPORT_RATING_VALUES].reverse().map((star) => {
              const pct = csat?.percentages[star] ?? 0;
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-muted-foreground">
                    {star} star · {SUPPORT_RATING_LABEL[star]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-muted-foreground">
                    {pct}% ({csat?.distribution[star] ?? 0})
                  </span>
                </div>
              );
            })}
          </div>
        </section>


        <div className="surface-card flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SUPPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SUPPORT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {SUPPORT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {SUPPORT_CATEGORY_LABEL[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {SUPPORT_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {SUPPORT_PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rating} onValueChange={setRating}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {[...SUPPORT_RATING_VALUES].reverse().map((star) => (
                <SelectItem key={star} value={String(star)}>
                  {star} {star === 1 ? "Star" : "Stars"}
                </SelectItem>
              ))}
              <SelectItem value="unrated">Not rated</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-tickets"] })}
          >
            <RefreshCcw className="mr-2 size-4" /> Refresh
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="surface-card max-h-[70vh] overflow-y-auto p-2">
            {tickets.isLoading ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading tickets…
              </p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tickets match these filters.</p>
            ) : (
              <ul className="space-y-1">
                {rows.map((ticket) => (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(ticket.id)}
                      className={cn(
                        "w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition",
                        activeId === ticket.id
                          ? "border-primary/40 bg-primary/5"
                          : "hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{ticket.subject}</span>
                        <Badge
                          variant="outline"
                          className={SUPPORT_STATUS_STYLE[ticket.status as SupportStatus]}
                        >
                          {SUPPORT_STATUS_LABEL[ticket.status as SupportStatus] ?? ticket.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {ticketReference(ticket.id)} · {ticket.customer_email ?? "unknown"} ·{" "}
                        {SUPPORT_CATEGORY_LABEL[ticket.category] ?? ticket.category}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>Updated {timeOf(ticket.last_message_at)}</span>
                        {ticket.rating ? (
                          <SupportStars value={ticket.rating} />
                        ) : (
                          <span>Not Rated</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeId ? (
            <TicketDetail ticketId={activeId} agents={agents.data ?? []} />
          ) : (
            <div className="surface-card p-6 text-sm text-muted-foreground">
              Select a ticket to see the conversation.
            </div>
          )}
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function TicketDetail({
  ticketId,
  agents,
}: {
  ticketId: string;
  agents: Array<{ id: string; email: string | null; name: string | null }>;
}) {
  const queryClient = useQueryClient();
  const fetchTicket = useServerFn(getAdminTicket);
  const reply = useServerFn(replyAdminTicket);
  const emailReply = useServerFn(emailAdminTicketReply);
  const update = useServerFn(updateAdminTicket);
  const signAttachment = useServerFn(getAdminAttachmentUrl);

  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const detail = useQuery({
    queryKey: ["admin-ticket", ticketId],
    queryFn: () => fetchTicket({ data: { id: ticketId } }),
  });

  const send = useMutation({
    mutationFn: () => reply({ data: { ticketId, body, internal } }),
    onSuccess: () => {
      setBody("");
      toast.success(internal ? "Internal note added" : "Reply sent to the customer");
      void queryClient.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailExisting = useMutation({
    mutationFn: (messageId: string) => emailReply({ data: { messageId } }),
    onSuccess: () => toast.success("Customer email requested"),
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: (input: {
      status?: SupportStatus;
      priority?: SupportPriority;
      assignedTo?: string | null;
    }) => update({ data: { ticketId, ...input } }),
    onSuccess: () => {
      toast.success("Ticket updated");
      void queryClient.invalidateQueries({ queryKey: ["admin-ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function openAttachment(path: string) {
    try {
      const { url } = await signAttachment({ data: { path } });
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (detail.isLoading) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading ticket…
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="surface-card p-6 text-sm text-destructive">
        {(detail.error as Error)?.message || "Could not load this ticket."}
      </div>
    );
  }

  const ticket = detail.data.ticket as any;
  const messages = detail.data.messages as any[];
  const customer = detail.data.customer as any;
  const workspace = detail.data.workspace as any;
  const ticketRating = (detail.data as any).rating as {
    rating: number;
    feedback: string | null;
    created_at: string;
  } | null;

  return (
    <div className="space-y-4">
      <section className="surface-card space-y-2 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Support experience rating
        </p>
        {ticketRating ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SupportStars value={ticketRating.rating} size="md" showLabel />
              <span className="text-xs text-muted-foreground">
                · submitted {timeOf(ticketRating.created_at)}
              </span>
            </div>
            {ticketRating.feedback ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {ticketRating.feedback}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No written feedback.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not Rated</p>
        )}
      </section>

      <section className="surface-card space-y-3 p-5">

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground">
              {ticket.ticket_ref ?? ticketReference(ticket.id)} · opened {timeOf(ticket.created_at)}
              {ticket.source === "munchmate" ? " · via MunchMate" : ""}
            </p>
          </div>
          <Badge variant="outline" className={SUPPORT_PRIORITY_STYLE[ticket.priority]}>
            {SUPPORT_PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
          </Badge>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Customer</p>
            <p>{customer?.full_name || ticket.contact_name || customer?.email || ticket.contact_email || "Unknown"}</p>
            <p className="text-xs text-muted-foreground">
              {customer?.email ?? ticket.contact_email}
              {!ticket.created_by && ticket.contact_email ? " (guest — reply by email)" : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Workspace</p>
            <p>{workspace?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Category</p>
            <p>{SUPPORT_CATEGORY_LABEL[ticket.category] ?? ticket.category}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={ticket.status}
              onValueChange={(value) => patch.mutate({ status: value as SupportStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUPPORT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={ticket.priority}
              onValueChange={(value) => patch.mutate({ priority: value as SupportPriority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORT_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {SUPPORT_PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select
              value={ticket.assigned_to ?? "unassigned"}
              onValueChange={(value) =>
                patch.mutate({ assignedTo: value === "unassigned" ? null : value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name || agent.email || agent.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {Array.isArray(ticket.ai_conversation) && ticket.ai_conversation.length > 0 ? (
        <details className="surface-card p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Original MunchMate conversation ({ticket.ai_conversation.length} messages)
          </summary>
          <ul className="mt-3 space-y-2">
            {(ticket.ai_conversation as Array<{ role: string; content: string; at?: string | null }>).map((m, i) => (
              <li key={i} className={cn("rounded-lg border p-3 text-sm", m.role === "assistant" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30")}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {m.role === "assistant" ? "MunchMate" : "Customer"}
                  {m.at ? ` · ${timeOf(m.at)}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="surface-card space-y-3 p-5">
        <h3 className="text-sm font-semibold">Conversation</h3>
        <ul className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "rounded-lg border p-3 text-sm",
                message.is_internal
                  ? "border-amber-500/40 bg-amber-500/5"
                  : message.author_role === "support"
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-muted/30",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {message.author_role === "support" ? "Support" : "Customer"}
                </span>
                <span>{timeOf(message.created_at)}</span>
                {message.is_internal ? (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Lock className="size-3" /> Internal note
                  </span>
                ) : null}
                {message.author_role === "support" && !message.is_internal ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-2 text-xs"
                    disabled={emailExisting.isPending}
                    onClick={() => emailExisting.mutate(message.id)}
                  >
                    <Mail className="mr-1 size-3.5" /> Email reply
                  </Button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap">{message.body}</p>
              {message.attachment_path ? (
                <button
                  type="button"
                  onClick={() => openAttachment(message.attachment_path)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  <Paperclip className="size-3" /> {message.attachment_name ?? "Attachment"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder={internal ? "Internal note — customers never see this" : "Reply to the customer…"}
          />
          {!internal ? (
            <p className="text-xs text-muted-foreground">
              Also emails the customer through your Support ticket reply email, when enabled.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Internal note (hidden from the customer)
            </label>
            <Button
              onClick={() => send.mutate()}
              disabled={send.isPending || body.trim().length < 2}
            >
              {send.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {internal ? "Add note" : "Send reply"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
