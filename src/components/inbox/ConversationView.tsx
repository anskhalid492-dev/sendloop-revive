import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Send,
  Tag as TagIcon,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { isMailboxLimitError, mailboxLimitMessage } from "@/lib/mailbox-capacity";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_LABELS,
  initialsOf,
} from "@/lib/inbox-model";
import {
  addConversationNote,
  deleteConversationNote,
  getConversation,
  sendConversationReply,
  updateConversation,
} from "@/lib/inbox.functions";
import { renderEmailForLead, senderExtras } from "@/lib/campaign-model";
import { listTemplates } from "@/lib/templates.functions";
import { ProspectPanel } from "@/components/inbox/ProspectPanel";
import { replyPreview, splitReplyBody } from "@/lib/email-body";
import { cn } from "@/lib/utils";

function snoozeOptions() {
  const now = new Date();
  const laterToday = new Date(now);
  laterToday.setHours(now.getHours() + 4, 0, 0, 0);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  return [
    { label: "Later today", value: laterToday.toISOString() },
    { label: "Tomorrow", value: tomorrow.toISOString() },
    { label: "Next week", value: nextWeek.toISOString() },
  ];
}

type ThreadMessage = {
  id: string;
  direction: string;
  from_name?: string | null;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  occurred_at: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  attachments?: { name: string; url?: string }[] | null;
};

/**
 * A single email in the thread. The body shown here is the stored message
 * record (the exact sent/received copy) — nothing is re-rendered from a
 * campaign template.
 */
function MessageRow({
  message,
  defaultExpanded,
}: {
  message: ThreadMessage;
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const [showDetails, setShowDetails] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const outbound = message.direction !== "inbound";
  const parts = useMemo(() => splitReplyBody(message.body), [message.body]);

  return (
    <article className="border-b border-border/60 py-4 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 text-left"
        aria-expanded={open}
      >
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            outbound ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
          )}
        >
          {initialsOf(message.from_name ?? null, message.from_email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">
              {message.from_name || message.from_email}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {message.from_email}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {new Date(message.occurred_at).toLocaleString()}
            </span>
          </span>
          {open ? (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              to {message.to_email}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {message.body}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="mt-3 pl-12">
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
          {showDetails ? (
            <dl className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Subject:</span> {message.subject}
              </div>
              <div>
                <span className="font-medium text-foreground">From:</span> {message.from_email}
              </div>
              <div>
                <span className="font-medium text-foreground">To:</span> {message.to_email}
              </div>
              <div>
                {outbound ? "Sent" : "Prospect reply"}
                {message.opened_at
                  ? ` · Opened ${new Date(message.opened_at).toLocaleString()}`
                  : ""}
                {message.clicked_at
                  ? ` · Clicked ${new Date(message.clicked_at).toLocaleString()}`
                  : ""}
              </div>
            </dl>
          ) : null}

          <div className="mt-3 max-w-[76ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
            {message.body}
          </div>

          {message.attachments?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {message.attachments.map((file) => (
                <li key={file.name}>
                  <Badge variant="outline" className="gap-1">
                    <Paperclip className="h-3 w-3" /> {file.name}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ConversationView({
  conversationId,
  workspaceId,
  members,
  onBack,
  onChanged,
}: {
  conversationId: string;
  workspaceId: string;
  members: { id: string; name: string }[];
  onBack?: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchConversation = useServerFn(getConversation);
  const fetchTemplates = useServerFn(listTemplates);
  const update = useServerFn(updateConversation);
  const sendReply = useServerFn(sendConversationReply);
  const addNote = useServerFn(addConversationNote);
  const removeNote = useServerFn(deleteConversationNote);

  const queryKey = ["conversation", conversationId];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchConversation({ data: { id: conversationId } }),
  });

  const { data: templateData } = useQuery({
    queryKey: ["templates", workspaceId],
    queryFn: () => fetchTemplates({ data: { workspaceId } }),
  });
  const templates = templateData?.templates ?? [];

  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState("");

  const conversation = data?.conversation;
  const messages = (data?.messages ?? []) as ThreadMessage[];

  useEffect(() => {
    if (!conversation) return;
    const base = conversation.subject.replace(/^(\s*re\s*:\s*)+/i, "");
    setSubject(`Re: ${base}`);
    setBody("");
    setCc("");
    setComposerOpen(false);
  }, [conversation?.id]);

  // Opening a conversation marks it read, and that must survive a refresh.
  useEffect(() => {
    if (!conversation?.unread) return;
    void update({ data: { id: conversation.id, unread: false } }).then(() => {
      void queryClient.invalidateQueries({ queryKey });
      onChanged();
    });
  }, [conversation?.id, conversation?.unread]);

  const mutate = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      update({ data: { id: conversationId, ...patch } as never }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      onChanged();
    },
    onError: () => toast.error("That change couldn’t be saved. Please try again."),
  });

  const reply = useMutation({
    mutationFn: () =>
      sendReply({
        data: {
          conversationId,
          subject,
          body,
          cc: cc
            .split(/[,;\s]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          attachments:
            attachmentName && attachmentUrl ? [{ name: attachmentName, url: attachmentUrl }] : [],
        },
      }),
    onSuccess: () => {
      toast.success("Reply sent");
      setBody("");
      setAttachmentName("");
      setAttachmentUrl("");
      void queryClient.invalidateQueries({ queryKey });
      onChanged();
    },
    onError: (error: Error) => {
      // Draft body is intentionally preserved on a mailbox-capacity block.
      if (isMailboxLimitError(error.message)) {
        toast.error("Mailbox unavailable", {
          description: mailboxLimitMessage(error.message),
        });
        return;
      }
      toast.error(error.message || "The reply couldn’t be sent. Please try again.");
    },
  });

  const noteMutation = useMutation({
    mutationFn: (value: string) =>
      addNote({ data: { conversationId, body: value, mentions: mentionIds(value, members) } }),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error("The note couldn’t be saved."),
  });

  const timeline = useMemo(() => {
    const notes = (data?.notes ?? []).map((n) => ({ kind: "note" as const, at: n.created_at, n }));
    const mails = messages.map((m) => ({ kind: "message" as const, at: m.occurred_at, m }));
    return [...mails, ...notes].sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [data?.notes, messages]);

  const lastMessageId = messages.length ? messages[messages.length - 1]!.id : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading conversation…
      </div>
    );
  }
  if (isError || !conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">We couldn’t open this conversation.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {onBack ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
            aria-label="Back to list"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{conversation.subject}</h2>
          <p className="truncate text-xs text-muted-foreground">{conversation.prospect_email}</p>
        </div>

        <Select
          value={conversation.status}
          onValueChange={(value) => mutate.mutate({ status: value })}
        >
          <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label="Conversation status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONVERSATION_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="hidden shrink-0 sm:inline-flex">
              <UserPlus className="mr-2 h-3.5 w-3.5" />
              {conversation.assignee_name ?? "Assign"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Assign conversation</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => mutate.mutate({ assignedTo: data.me })}>
              Assign to me
            </DropdownMenuItem>
            {members
              .filter((m) => m.id !== data.me)
              .map((member) => (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => mutate.mutate({ assignedTo: member.id })}
                >
                  {member.name}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => mutate.mutate({ assignedTo: null })}>
              Unassign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Snooze conversation"
            >
              <Clock className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {snoozeOptions().map((option) => (
              <DropdownMenuItem
                key={option.label}
                onClick={() => mutate.mutate({ snoozedUntil: option.value })}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="p-2">
              <Input
                type="datetime-local"
                value={customSnooze}
                onChange={(event) => setCustomSnooze(event.target.value)}
                aria-label="Custom snooze time"
              />
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={!customSnooze}
                onClick={() => mutate.mutate({ snoozedUntil: new Date(customSnooze).toISOString() })}
              >
                Snooze until
              </Button>
            </div>
            {conversation.snoozed_until ? (
              <DropdownMenuItem onClick={() => mutate.mutate({ snoozedUntil: null })}>
                Unsnooze
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => mutate.mutate({ archived: !conversation.archived })}>
              {conversation.archived ? (
                <>
                  <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-3.5 w-3.5" /> Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => mutate.mutate({ unread: !conversation.unread })}>
              {conversation.unread ? (
                <>
                  <MailOpen className="mr-2 h-3.5 w-3.5" /> Mark read
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-3.5 w-3.5" /> Mark unread
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="sm:hidden" onClick={() => mutate.mutate({ assignedTo: data.me })}>
              <UserPlus className="mr-2 h-3.5 w-3.5" /> Assign to me
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setContactOpen(true)}>
              <Info className="mr-2 h-3.5 w-3.5" /> Contact info
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setContactOpen(true)}
        >
          <Info className="mr-2 h-3.5 w-3.5" />
          <span className="hidden md:inline">Contact info</span>
        </Button>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-1.5">
        <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {conversation.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => mutate.mutate({ tags: conversation.tags.filter((t) => t !== tag) })}
            >
              ×
            </button>
          </Badge>
        ))}
        <Input
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !tagDraft.trim()) return;
            event.preventDefault();
            mutate.mutate({ tags: [...new Set([...conversation.tags, tagDraft.trim()])] });
            setTagDraft("");
          }}
          placeholder="Add tag"
          className="h-6 w-24 border-dashed text-xs"
          aria-label="Add tag"
        />
      </div>

      {/* Only the thread scrolls; header, tags and composer stay put. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-2 sm:px-8">
          {timeline.map((entry) =>
            entry.kind === "message" ? (
              <MessageRow
                key={entry.m.id}
                message={entry.m}
                defaultExpanded={entry.m.id === lastMessageId || entry.m.direction === "inbound"}
              />
            ) : (
              <article
                key={entry.n.id}
                className="my-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-3"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Internal note</Badge>
                  <span>{entry.n.author_name ?? "Teammate"}</span>
                  <span className="ml-auto">{new Date(entry.n.created_at).toLocaleString()}</span>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() =>
                      removeNote({ data: { id: entry.n.id } })
                        .then(() => queryClient.invalidateQueries({ queryKey }))
                        .catch(() => toast.error("The note couldn’t be deleted."))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{entry.n.body}</p>
              </article>
            ),
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-2 sm:px-8">
          {composerOpen ? (
            <Tabs defaultValue="reply" className="max-h-[46vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <TabsList className="h-8">
                  <TabsTrigger value="reply">Reply</TabsTrigger>
                  <TabsTrigger value="note">Internal note</TabsTrigger>
                </TabsList>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setComposerOpen(false)}
                >
                  Close
                </Button>
              </div>

              <TabsContent value="reply" className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject"
                    className="h-8 min-w-[220px] flex-1"
                    aria-label="Reply subject"
                  />
                  <Input
                    value={cc}
                    onChange={(event) => setCc(event.target.value)}
                    placeholder="Cc (reply all)"
                    className="h-8 w-44"
                    aria-label="Cc recipients"
                  />
                  <Select
                    onValueChange={(value) => {
                      const template = templates.find((t) => t.id === value);
                      if (!template) return;
                      // Same renderer as Campaigns/Sequences: lead variables (and
                      // their fallbacks) resolve immediately against the open lead,
                      // so the composer never shows a raw {{token}}.
                      const personalized = renderEmailForLead(
                        { subject: template.subject, body: template.body },
                        (data?.lead ?? { email: conversation.prospect_email }) as never,
                        { extras: senderExtras(data?.account ?? null) },
                      );
                      setSubject(personalized.subject);
                      setBody(personalized.body);
                    }}
                  >
                    <SelectTrigger className="h-8 w-40" aria-label="Insert saved template">
                      <SelectValue placeholder="Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  rows={5}
                  placeholder="Write your reply…"
                  aria-label="Reply body"
                />
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <Input
                    value={attachmentName}
                    onChange={(event) => setAttachmentName(event.target.value)}
                    placeholder="Attachment name"
                    className="h-8 w-36"
                    aria-label="Attachment name"
                  />
                  <Input
                    value={attachmentUrl}
                    onChange={(event) => setAttachmentUrl(event.target.value)}
                    placeholder="Attachment link"
                    className="h-8 w-48"
                    aria-label="Attachment link"
                  />
                  <span className="text-xs text-muted-foreground">
                    Sending from {data.account?.from_email ?? "your assigned mailbox"}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setBody("")}>
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      disabled={!body.trim() || !subject.trim() || reply.isPending}
                      onClick={() => reply.mutate()}
                    >
                      {reply.isPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-3.5 w-3.5" />
                      )}
                      Send reply
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="note" className="mt-2 space-y-2 pb-2">
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Private note for your team. Use @name to mention a teammate."
                  aria-label="Internal note"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!note.trim() || noteMutation.isPending}
                    onClick={() => noteMutation.mutate(note)}
                  >
                    {noteMutation.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save note
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="flex-1 rounded-full border border-border px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60"
              >
                Reply to {conversation.prospect_email}…
              </button>
              <Button size="sm" variant="outline" onClick={() => setComposerOpen(true)}>
                <Send className="mr-2 h-3.5 w-3.5" /> Reply
              </Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={contactOpen} onOpenChange={setContactOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>Contact info</SheetTitle>
          </SheetHeader>
          <ProspectPanel
            lead={data.lead as never}
            prospectEmail={conversation.prospect_email}
            status={conversation.status}
            tags={conversation.tags}
            campaignName={data.campaign?.name ?? null}
            accountEmail={data.account?.from_email ?? null}
            assigneeName={conversation.assignee_name}
            events={data.events as never}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function mentionIds(text: string, members: { id: string; name: string }[]): string[] {
  const mentioned = new Set<string>();
  for (const member of members) {
    const handle = member.name.split(" ")[0]?.toLowerCase();
    if (handle && new RegExp(`@${handle}\\b`, "i").test(text)) mentioned.add(member.id);
  }
  return [...mentioned];
}

export { CONVERSATION_STATUS_LABELS };
