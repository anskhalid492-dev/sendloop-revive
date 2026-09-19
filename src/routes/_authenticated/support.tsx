import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  ChartNoAxesCombined,
  CircleHelp,
  CreditCard,
  Flame,
  Globe2,
  Inbox,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/useWorkspace";
import { cn } from "@/lib/utils";
import {
  closeSupportTicket,
  createSupportTicket,
  getSupportAttachmentUrl,
  getSupportTicket,
  listSupportTickets,
  reopenSupportTicket,
  replyToSupportTicket,
  type SupportTicket,
} from "@/lib/support.functions";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_PRIORITY_STYLE,
  SUPPORT_STATUS_LABEL,
  SUPPORT_STATUS_STYLE,
  ticketReference,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support-model";
import { HELP_ARTICLES, searchArticles, type HelpArticle } from "@/lib/help-center";
import {
  SUPPORT_GUIDE_GROUPS,
  SUPPORT_START_HERE,
  resolveSupportArticles,
} from "@/lib/support-guide-config";
import { uploadSupportAttachment, type UploadedAttachment } from "@/lib/support-upload";
import { SupportRatingCard } from "@/components/support/SupportRatingCard";
import { isRateableStatus, type SupportTicketRating } from "@/lib/support-rating";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support center — MunchReach" },
      {
        name: "description",
        content:
          "Search the MunchReach help center, open a support request and follow your tickets end to end.",
      },
      { property: "og:title", content: "Support center — MunchReach" },
      {
        property: "og:description",
        content: "Help articles, support tickets and replies from the MunchReach team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: string }) {
  const key = (status as SupportStatus) in SUPPORT_STATUS_LABEL ? (status as SupportStatus) : "open";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        SUPPORT_STATUS_STYLE[key],
      )}
    >
      {SUPPORT_STATUS_LABEL[key]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        SUPPORT_PRIORITY_STYLE[priority] ?? SUPPORT_PRIORITY_STYLE["normal"],
      )}
    >
      {SUPPORT_PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

function AttachmentLink({ path, name }: { path: string; name: string }) {
  const sign = useServerFn(getSupportAttachmentUrl);
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground hover:bg-muted"
      onClick={async () => {
        setLoading(true);
        try {
          const { url } = await sign({ data: { path } });
          if (url) window.open(url, "_blank", "noopener");
          else toast.error("Attachment is no longer available");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not open attachment");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
      {name}
    </button>
  );
}

function AttachmentPicker({
  attachment,
  onChange,
  disabled,
}: {
  attachment: UploadedAttachment | null;
  onChange: (value: UploadedAttachment | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setUploading(true);
          try {
            onChange(await uploadSupportAttachment(file));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed");
          } finally {
            setUploading(false);
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="mr-1.5 h-3.5 w-3.5" />
        )}
        Attach file
      </Button>
      {attachment ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
          {attachment.name}
          <button type="button" onClick={() => onChange(null)} aria-label="Remove attachment">
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Up to 10 MB</span>
      )}
    </div>
  );
}

function SupportPage() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const fetchTickets = useServerFn(listSupportTickets);
  const [tab, setTab] = useState("help");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const ticketsQuery = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => fetchTickets(),
  });
  const tickets = ticketsQuery.data?.tickets ?? [];
  const unread = ticketsQuery.data?.unread ?? 0;

  return (
    <AppShell
      title="Support"
      description="Help articles, support requests and replies from the MunchReach team"
    >
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Need a hand?</p>
            <p className="text-sm text-muted-foreground">
              Search the help center or open a request — we reply inside your dashboard.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New request
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="help">
              <BookOpen className="mr-1.5 h-4 w-4" />
              Help center
            </TabsTrigger>
            <TabsTrigger value="tickets">
              <MessageCircle className="mr-1.5 h-4 w-4" />
              My tickets
              {unread > 0 ? (
                <Badge className="ml-2" variant="destructive">
                  {unread}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="help" className="mt-4">
            <HelpCenter onContact={() => setCreateOpen(true)} />
          </TabsContent>

          <TabsContent value="tickets" className="mt-4">
            {activeId ? (
              <TicketThread id={activeId} onBack={() => setActiveId(null)} />
            ) : (
              <TicketList
                tickets={tickets}
                loading={ticketsQuery.isLoading}
                onOpen={setActiveId}
                onCreate={() => setCreateOpen(true)}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspace?.id ?? null}
        onCreated={async (id) => {
          await queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
          setTab("tickets");
          setActiveId(id);
        }}
      />
    </AppShell>
  );
}

function HelpCenter({ onContact }: { onContact: () => void }) {
  const [query, setQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const searching = query.trim().length > 0;
  const results = useMemo(() => searchArticles(query, "all"), [query]);
  const startHere = useMemo(() => resolveSupportArticles(SUPPORT_START_HERE), []);

  const categoryIcons: Record<string, typeof BookOpen> = {
    "getting-started": BookOpen,
    campaigns: Send,
    leads: Users,
    "email-accounts": Mail,
    ai: Bot,
    sending: Send,
    inbox: Inbox,
    warmup: Flame,
    domains: Globe2,
    analytics: ChartNoAxesCombined,
    billing: CreditCard,
    troubleshooting: CircleHelp,
  };

  function ArticleLink({ article }: { article: HelpArticle }) {
    return (
      <Link
        to="/help-center/$slug"
        params={{ slug: article.slug }}
        className="group flex min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
      >
        <span className="min-w-0 truncate">{article.title}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the complete Help Center"
            aria-label="Search the complete Help Center"
            className="h-12 pl-11 pr-10"
          />
          {query ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 size-9 -translate-y-1/2"
              onClick={() => setQuery("")}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Popular searches:</span>
          {["CSV import", "domain verification", "campaign not sending", "mailbox error", "warmup", "replies", "AI personalization", "billing"].map((term) => (
            <Button key={term} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setQuery(term)}>
              {term}
            </Button>
          ))}
        </div>
      </div>

      {searching ? (
        results.length === 0 ? (
          <div className="surface-card space-y-3 p-8 text-center">
            <p className="text-sm font-medium">No article matches “{query}”.</p>
            <p className="text-sm text-muted-foreground">
              Try a shorter search, or open a support request and we'll take a look.
            </p>
            <Button onClick={onContact}>Contact support</Button>
          </div>
        ) : (
          <section aria-labelledby="search-results-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="search-results-heading" className="text-sm font-semibold uppercase text-muted-foreground">Search results</h2>
              <span className="text-xs text-muted-foreground">{results.length} {results.length === 1 ? "guide" : "guides"}</span>
            </div>
            <div className="surface-card divide-y divide-border/60 p-2">
              {results.map((article) => (
                <Link
                  key={article.slug}
                  to="/help-center/$slug"
                  params={{ slug: article.slug }}
                  className="group flex items-start justify-between gap-4 rounded-md px-3 py-3 transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{article.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{article.description}</span>
                  </span>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>
        )
      ) : (
        <>
          <section aria-labelledby="start-here-heading">
            <h2 id="start-here-heading" className="text-sm font-semibold uppercase text-muted-foreground">Start here</h2>
            <div className="surface-card mt-3 grid overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
              {startHere.map((article, index) => (
                <Link
                  key={article.slug}
                  to="/help-center/$slug"
                  params={{ slug: article.slug }}
                  className="group flex min-w-0 items-center gap-3 border-b border-border/60 p-4 transition-colors hover:bg-muted sm:border-r"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{article.title}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          <section aria-labelledby="popular-guides-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="popular-guides-heading" className="text-sm font-semibold uppercase text-muted-foreground">Popular guides</h2>
                <p className="mt-1 text-sm text-muted-foreground">Practical answers for the work you do most often.</p>
              </div>
              <span className="text-xs text-muted-foreground">{HELP_ARTICLES.length} guides</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {SUPPORT_GUIDE_GROUPS.map((group) => {
                const Icon = categoryIcons[group.slug] ?? BookOpen;
                const all = resolveSupportArticles(group.articles);
                const featured = all.slice(0, 5);
                const expanded = expandedCategory === group.slug;
                const articles = expanded ? all : featured;
                return (
                  <div key={group.slug} className="surface-card flex min-h-64 flex-col p-4">
                    <div className="flex items-center gap-3 border-b border-border/60 pb-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold">{group.label}</h3>
                        <p className="text-xs text-muted-foreground">{all.length} guides</p>
                      </div>
                    </div>
                    <div className="flex-1 py-2">
                      {articles.map((article) => <ArticleLink key={article.slug} article={article} />)}
                    </div>
                    {all.length > featured.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start px-2 text-primary"
                        onClick={() => setExpandedCategory(expanded ? null : group.slug)}
                      >
                        {expanded ? "Show popular" : "View all"} <ArrowRight className={cn("ml-1 size-3.5", expanded && "rotate-90")} />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">Still stuck after checking the guides?</p>
        <Button variant="outline" onClick={onContact}>Contact support</Button>
      </div>
    </div>
  );
}

function TicketList({
  tickets,
  loading,
  onOpen,
  onCreate,
}: {
  tickets: SupportTicket[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  if (loading) {
    return (
      <div className="surface-card flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your requests…
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="surface-card space-y-3 p-10 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">No support requests yet</p>
        <p className="text-sm text-muted-foreground">
          When you open a request it appears here with the full conversation history.
        </p>
        <Button onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New request
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-card divide-y divide-border/60">
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          type="button"
          onClick={() => onOpen(ticket.id)}
          className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{ticket.subject}</p>
              {ticket.unread > 0 ? (
                <Badge variant="destructive">{ticket.unread} new</Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ticketReference(ticket.id)} ·{" "}
              {SUPPORT_CATEGORY_LABEL[ticket.category] ?? ticket.category} · opened{" "}
              {formatDate(ticket.created_at)} · updated {formatDate(ticket.last_message_at)}
            </p>
          </div>
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </button>
      ))}
    </div>
  );
}

function TicketThread({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const fetchTicket = useServerFn(getSupportTicket);
  const replyFn = useServerFn(replyToSupportTicket);
  const closeFn = useServerFn(closeSupportTicket);
  const reopenFn = useServerFn(reopenSupportTicket);

  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);

  const query = useQuery({
    queryKey: ["support-ticket", id],
    queryFn: () => fetchTicket({ data: { id } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["support-ticket", id] }),
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };

  const reply = useMutation({
    mutationFn: () => replyFn({ data: { ticketId: id, body, attachment } }),
    onSuccess: async () => {
      setBody("");
      setAttachment(null);
      toast.success("Reply sent");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setState = useMutation({
    mutationFn: (action: "close" | "reopen") =>
      action === "close" ? closeFn({ data: { ticketId: id } }) : reopenFn({ data: { ticketId: id } }),
    onSuccess: async () => {
      toast.success("Ticket updated");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) {
    return (
      <div className="surface-card flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="surface-card space-y-3 p-8 text-center">
        <p className="text-sm font-medium">We couldn't load this request.</p>
        <Button variant="outline" onClick={onBack}>
          Back to tickets
        </Button>
      </div>
    );
  }

  const { ticket, messages } = query.data;
  const rating = (query.data as { rating?: SupportTicketRating | null }).rating ?? null;
  const closed = ticket.status === "closed";
  const rateable = isRateableStatus(ticket.status);


  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          All tickets
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{ticket.subject}</h2>
            <p className="text-xs text-muted-foreground">
              {ticketReference(ticket.id)} ·{" "}
              {SUPPORT_CATEGORY_LABEL[ticket.category] ?? ticket.category} · created{" "}
              {formatDate(ticket.created_at)} · last update {formatDate(ticket.last_message_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
            <Button
              size="sm"
              variant="outline"
              disabled={setState.isPending}
              onClick={() => setState.mutate(closed ? "reopen" : "close")}
            >
              {closed ? "Reopen" : "Close ticket"}
            </Button>
          </div>
        </div>
      </div>

      <div className="surface-card space-y-3 p-4">
        {messages.map((message) => {
          const mine = message.author_role === "customer";
          return (
            <div
              key={message.id}
              className={cn(
                "rounded-xl border p-3 text-sm",
                mine ? "border-border/60 bg-muted/40" : "border-primary/20 bg-primary/5",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {mine ? "You" : "MunchReach Support"}
                </span>
                <span>{formatDate(message.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{message.body}</p>
              {message.attachment_path ? (
                <AttachmentLink
                  path={message.attachment_path}
                  name={message.attachment_name ?? "Attachment"}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {rateable ? <SupportRatingCard ticketId={ticket.id} rating={rating} /> : null}

      {closed ? (
        <div className="surface-card p-4 text-sm text-muted-foreground">
          This ticket is closed. Reopen it or start a new request to continue.
        </div>

      ) : (
        <div className="surface-card space-y-3 p-4">
          <Label htmlFor="support-reply">Reply</Label>
          <Textarea
            id="support-reply"
            rows={4}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add more detail for the support team…"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AttachmentPicker attachment={attachment} onChange={setAttachment} />
            <Button
              disabled={body.trim().length < 2 || reply.isPending}
              onClick={() => reply.mutate()}
            >
              {reply.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Send reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateTicketDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  workspaceId: string | null;
  onCreated: (id: string) => void;
}) {
  const createFn = useServerFn(createSupportTicket);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCategory>("account");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<UploadedAttachment | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { subject, category, priority, body, workspaceId, attachment },
      }),
    onSuccess: (result: { id: string }) => {
      toast.success("Support request created");
      setSubject("");
      setBody("");
      setAttachment(null);
      setCategory("account");
      setPriority("normal");
      onOpenChange(false);
      onCreated(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New support request</DialogTitle>
          <DialogDescription>
            Tell us what's happening. You'll get replies here and in your notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Short summary of the issue"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SUPPORT_CATEGORY_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as SupportPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {SUPPORT_PRIORITY_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-body">Message</Label>
            <Textarea
              id="ticket-body"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What happened, what you expected, and any error messages."
            />
          </div>

          <AttachmentPicker attachment={attachment} onChange={setAttachment} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={subject.trim().length < 4 || body.trim().length < 10 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
