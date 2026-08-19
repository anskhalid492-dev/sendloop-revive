import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  closeSupportTicket,
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  replyToSupportTicket,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support — Sendloop" },
      { name: "description", content: "Open and track support requests with the Sendloop team." },
      { property: "og:title", content: "Support — Sendloop" },
      { property: "og:description", content: "Open and track Sendloop support requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_customer: "Waiting for you",
  resolved: "Resolved",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "resolved" ? "outline" : "secondary"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function SupportPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const fetchTickets = useServerFn(listSupportTickets);
  const createFn = useServerFn(createSupportTicket);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");

  const tickets = useQuery({ queryKey: ["support-tickets"], queryFn: () => fetchTickets() });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          subject,
          category: category as "general",
          priority: priority as "normal",
          body,
          workspaceId: workspace?.id ?? null,
        },
      }),
    onSuccess: (res) => {
      toast.success("Support request submitted");
      setOpen(false);
      setSubject("");
      setBody("");
      setActiveId(res.id);
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Support"
      description="Open a request and track its status"
      actions={
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" /> New request
        </Button>
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/help-center" className="surface-card block p-5 transition hover:border-primary/40">
            <BookOpen className="size-5 text-primary" />
            <h3 className="mt-3 font-semibold">Help center</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Guides for campaigns, leads, deliverability and reporting.
            </p>
          </Link>
          <div className="surface-card p-5">
            <MessageCircle className="size-5 text-primary" />
            <h3 className="mt-3 font-semibold">Response times</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              We reply to requests within one business day.
            </p>
          </div>
        </div>

        <section className="surface-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Your requests</h2>
          </div>
          {tickets.isLoading ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Loading…</p>
          ) : (tickets.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              No support requests yet. Open one and we'll pick it up.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {(tickets.data ?? []).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category} · {t.priority} priority · updated{" "}
                        {new Date(t.last_message_at).toLocaleString()}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New support request</DialogTitle>
            <DialogDescription>Tell us what's happening and we'll get back to you.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="deliverability">Deliverability</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">How can we help?</Label>
              <Textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || subject.trim().length < 4 || body.trim().length < 10}
            >
              {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TicketDialog ticketId={activeId} onClose={() => setActiveId(null)} />
    </AppShell>
  );
}

function TicketDialog({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fetchTicket = useServerFn(getSupportTicket);
  const replyFn = useServerFn(replyToSupportTicket);
  const closeFn = useServerFn(closeSupportTicket);
  const [reply, setReply] = useState("");

  const thread = useQuery({
    queryKey: ["support-ticket", ticketId],
    enabled: Boolean(ticketId),
    queryFn: () => fetchTicket({ data: { id: ticketId! } }),
  });

  const send = useMutation({
    mutationFn: () => replyFn({ data: { ticketId: ticketId!, body: reply } }),
    onSuccess: () => {
      setReply("");
      void queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: () => closeFn({ data: { ticketId: ticketId! } }),
    onSuccess: () => {
      toast.success("Marked as resolved");
      void queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(ticketId)} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{thread.data?.ticket.subject ?? "Support request"}</DialogTitle>
          <DialogDescription>
            {thread.data ? (
              <span className="inline-flex items-center gap-2">
                <StatusBadge status={thread.data.ticket.status} />
                <span>
                  opened {new Date(thread.data.ticket.created_at).toLocaleDateString()}
                </span>
              </span>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(thread.data?.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 text-sm ${
                m.author_role === "customer" ? "border-border" : "border-primary/30 bg-primary/5"
              }`}
            >
              <p className="text-xs text-muted-foreground">
                {m.author_role === "customer" ? "You" : "Sendloop support"} ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="reply">Reply</Label>
            <Textarea id="reply" rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          {thread.data && thread.data.ticket.status !== "resolved" ? (
            <Button variant="outline" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
              Mark resolved
            </Button>
          ) : null}
          <Button onClick={() => send.mutate()} disabled={send.isPending || reply.trim().length < 2}>
            {send.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Send reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
