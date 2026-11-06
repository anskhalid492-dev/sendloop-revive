import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  Clock,
  Download,
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
  X,

} from "lucide-react";
import { toast } from "sonner";

import { isMailboxLimitError, mailboxLimitMessage } from "@/lib/mailbox-capacity";
import {
  ATTACHMENT_LIMIT_MESSAGE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_TOTAL_ATTACHMENT_BYTES,
  fileToOutboundAttachment,
  formatBytes,
  totalAttachmentBytes,
  type OutboundAttachment,
} from "@/lib/mail-attachments";

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
  getAttachmentDownloadUrl,
  getConversation,
  sendConversationReply,
  updateConversation,
} from "@/lib/inbox.functions";
import { renderEmailForLead, senderExtras } from "@/lib/campaign-model";
import { listTemplates } from "@/lib/templates.functions";
import { ProspectPanel } from "@/components/inbox/ProspectPanel";
import { replyPreview, splitReplyBody } from "@/lib/email-body";
import { RichTextEditor } from "@/components/inbox/RichTextEditor";
import { AiReplyButton } from "@/components/inbox/AiReplyButton";
import { composerHtmlToText, sanitizeComposerHtml, textToComposerHtml } from "@/lib/rich-text";
import { sanitizeInboundHtml } from "@/lib/inbound-html";
import { cn } from "@/lib/utils";
import { REPLY_SOURCE_LABELS, REPLY_SOURCE_STYLES } from "@/lib/reply-source";

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
  /** Formatted copy when the message was written with the rich composer. */
  html?: string | null;
  occurred_at: string;
  opened_at?: string | null;
  clicked_at?: string | null;
  attachments?:
    | { name: string; url?: string; size?: number; contentType?: string; path?: string }[]
    | null;
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
  const renderedHtml = useMemo(
    () =>
      message.html
        ? outbound
          ? sanitizeComposerHtml(message.html)
          : sanitizeInboundHtml(message.html)
        : "",
    [message.html, outbound],
  );

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
              {replyPreview(message.body)}
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

          {renderedHtml ? (
            // Formatted message: document scaffolding (DOCTYPE, head, Outlook
            // comments) is removed and the body sanitized to the email allow-list.
            <div
              className="mt-3 max-w-[76ch] break-words text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : parts.reply ? (
            <div className="mt-3 max-w-[76ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
              {parts.reply}
            </div>
          ) : null}

          {parts.signature ? (
            <p className="mt-2 max-w-[76ch] text-xs italic text-muted-foreground">
              {parts.signature}
            </p>
          ) : null}

          {parts.quoted ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowQuoted((v) => !v)}
                className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                aria-expanded={showQuoted}
              >
                {showQuoted ? "Hide quoted text" : "Show quoted text"}
              </button>
              {showQuoted ? (
                <div className="mt-2 max-w-[76ch] whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-[13px] leading-6 text-muted-foreground">
                  {parts.quoted}
                </div>
              ) : null}
            </div>
          ) : null}

          {!message.html && !parts.reply && !parts.signature && !parts.quoted ? (
            <p className="mt-3 text-sm text-muted-foreground">No message content.</p>
          ) : null}

          {message.attachments?.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {message.attachments.map((file) => (
                <li key={file.name}>
                  <AttachmentChip messageId={message.id} file={file} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}


/**
 * One attachment on a message. Files with a kept copy (or a provider link) can
 * be downloaded; older messages that only stored the file's details say so
 * instead of offering a link that cannot work.
 */
function AttachmentChip({
  messageId,
  file,
}: {
  messageId: string;
  file: { name: string; url?: string; size?: number; path?: string };
}) {
  const requestUrl = useServerFn(getAttachmentDownloadUrl);
  const [busy, setBusy] = useState(false);
  const downloadable = Boolean(file.path || file.url);

  const open = async () => {
    if (!downloadable || busy) return;
    setBusy(true);
    try {
      const result = await requestUrl({ data: { messageId, name: file.name } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be downloaded.");
    } finally {
      setBusy(false);
    }
  };

  const label = file.size ? `${file.name} · ${formatBytes(file.size)}` : file.name;

  if (!downloadable) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-muted-foreground"
        title="This file was sent before attachment copies were kept, so it can no longer be downloaded."
      >
        <Paperclip className="h-3 w-3" /> {label}
      </Badge>
    );
  }

  return (
    <button type="button" onClick={open} disabled={busy} className="cursor-pointer">
      <Badge variant="outline" className="gap-1 hover:bg-accent">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        {label}
      </Badge>
    </button>
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
  // Formatted source of truth for the composer; `body` stays the plain-text
  // equivalent the existing send pipeline has always used.
  const [bodyHtml, setBodyHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [cc, setCc] = useState("");
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  // Identifies this send attempt so a replayed request can never send twice.
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID());
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
    setBodyHtml("");
    setCc("");
    setAttachments([]);
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

  // A status change is a CRM change, so the pipeline, contact list and lead
  // views are refreshed from the confirmed server state, never optimistically.
  const statusMutate = useMutation({
    mutationFn: (status: string) => update({ data: { id: conversationId, status } as never }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["crm-contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-contact"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      onChanged();
    },
    onError: () => toast.error("Couldn’t update lead status. Please try again."),
  });

  const onPickReplyFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files);
    if (attachments.length + picked.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to one reply.`);
      return;
    }
    const total =
      totalAttachmentBytes(attachments) + picked.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      toast.error("Attachments too large", { description: ATTACHMENT_LIMIT_MESSAGE });
      return;
    }
    setReadingFiles(true);
    try {
      const read = await Promise.all(picked.map(fileToOutboundAttachment));
      setAttachments((current) => [...current, ...read]);
    } catch {
      toast.error("One of those files could not be read. Please try again.");
    } finally {
      setReadingFiles(false);
    }
  };

  const reply = useMutation({
    mutationFn: () =>
      sendReply({
        data: {
          conversationId,
          subject,
          body,
          ...(bodyHtml.trim() ? { bodyHtml } : {}),
          cc: cc
            .split(/[,;\s]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          attachments,
          sendKey,
        },
      }),
    onSuccess: () => {
      toast.success("Reply sent");
      setBody("");
      setBodyHtml("");
      setAttachments([]);
      setSendKey(crypto.randomUUID());
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
          <div className="flex min-w-0 items-center gap-2">
            {data.replySource ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                  REPLY_SOURCE_STYLES[data.replySource],
                )}
              >
                {REPLY_SOURCE_LABELS[data.replySource]}
              </span>
            ) : null}
            <h2 className="truncate text-sm font-semibold">{conversation.subject}</h2>
          </div>
          <p className="truncate text-xs text-muted-foreground">{conversation.prospect_email}</p>
        </div>

        <Select
          value={conversation.status}
          disabled={statusMutate.isPending}
          onValueChange={(value) => statusMutate.mutate(value)}
        >
          <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label="Conversation status">
            {statusMutate.isPending ? (
              <span className="text-muted-foreground">Updating…</span>
            ) : (
              <SelectValue />
            )}
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
                      setBodyHtml(textToComposerHtml(personalized.body));
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
                <RichTextEditor
                  value={bodyHtml}
                  onChange={(html) => {
                    setBodyHtml(html);
                    setBody(composerHtmlToText(html));
                  }}
                  minHeight={120}
                  placeholder="Write your reply…"
                  ariaLabel="Reply body"
                />
                {attachments.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {attachments.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-1.5 rounded border border-border/70 bg-muted/40 px-2 py-1 text-xs"
                      >
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-40 truncate">{file.name}</span>
                        <span className="text-muted-foreground">{formatBytes(file.size ?? 0)}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setAttachments((current) => current.filter((_, at) => at !== index))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={readingFiles}
                    onClick={() => document.getElementById("reply-files")?.click()}
                  >
                    {readingFiles ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Paperclip className="mr-2 h-3.5 w-3.5" />
                    )}
                    Attach files
                  </Button>
                  <input
                    id="reply-files"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void onPickReplyFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <AiReplyButton
                    conversationId={conversationId}
                    currentDraft={body}
                    onDraft={(text) => {
                      setBody(text);
                      setBodyHtml(textToComposerHtml(text));
                    }}
                  />
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBody("");
                        setBodyHtml("");
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      disabled={!body.trim() || !subject.trim() || reply.isPending || readingFiles}
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
