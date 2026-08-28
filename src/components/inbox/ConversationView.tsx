import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Clock,
  Loader2,
  Mail,
  MailOpen,
  PanelRightClose,
  PanelRightOpen,
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
  const [showProspect, setShowProspect] = useState(true);
  const [customSnooze, setCustomSnooze] = useState("");

  const conversation = data?.conversation;
  const messages = data?.messages ?? [];

  useEffect(() => {
    if (!conversation) return;
    const base = conversation.subject.replace(/^(\s*re\s*:\s*)+/i, "");
    setSubject(`Re: ${base}`);
    setBody("");
    setCc("");
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
        toast.error("Mailbox limit reached", {
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
    <div className="flex h-full min-h-0 w-full flex-col xl:flex-row">
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">


        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3">
          {onBack ? (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to list">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{conversation.subject}</h2>
            <p className="truncate text-xs text-muted-foreground">{conversation.prospect_email}</p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="hidden xl:inline-flex"
            aria-label={showProspect ? "Hide prospect panel" : "Show prospect panel"}
            title={showProspect ? "Full-width message view" : "Show prospect details"}
            onClick={() => setShowProspect((v) => !v)}
          >
            {showProspect ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>

          <Select
            value={conversation.status}
            onValueChange={(value) => mutate.mutate({ status: value })}
          >
            <SelectTrigger className="h-8 w-[170px]" aria-label="Conversation status">
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
              <Button variant="outline" size="sm">
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
              <Button variant="outline" size="sm">
                <Clock className="mr-2 h-3.5 w-3.5" /> Snooze
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
                  onClick={() =>
                    mutate.mutate({ snoozedUntil: new Date(customSnooze).toISOString() })
                  }
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate.mutate({ archived: !conversation.archived })}
          >
            {conversation.archived ? (
              <>
                <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Unarchive
              </>
            ) : (
              <>
                <Archive className="mr-2 h-3.5 w-3.5" /> Archive
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={conversation.unread ? "Mark read" : "Mark unread"}
            onClick={() => mutate.mutate({ unread: !conversation.unread })}
          >
            {conversation.unread ? (
              <MailOpen className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
          </Button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
          <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {conversation.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              #{tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() =>
                  mutate.mutate({ tags: conversation.tags.filter((t) => t !== tag) })
                }
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
            className="h-7 w-28 border-dashed text-xs"
            aria-label="Add tag"
          />
        </div>

        <div className="min-h-[8rem] flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          {timeline.map((entry) =>
            entry.kind === "message" ? (
              <article
                key={entry.m.id}
                className={cn(
                  "rounded-xl border p-3",
                  entry.m.direction === "inbound"
                    ? "border-border bg-card"
                    : "border-primary/20 bg-primary/5",
                )}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                    {initialsOf(entry.m.from_name, entry.m.from_email)}
                  </span>
                  <span className="font-medium text-foreground">{entry.m.from_email}</span>
                  <span>→ {entry.m.to_email}</span>
                  <span className="ml-auto">{new Date(entry.m.occurred_at).toLocaleString()}</span>
                </div>
                <h4 className="mt-2 text-sm font-medium">{entry.m.subject}</h4>
                <p className="mt-1 max-w-[80ch] whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {entry.m.body}
                </p>
                {entry.m.attachments?.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {entry.m.attachments.map((file) => (
                      <li key={file.name}>
                        <Badge variant="outline" className="gap-1">
                          <Paperclip className="h-3 w-3" /> {file.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
                  <span>{entry.m.direction === "inbound" ? "Prospect reply" : "Sent"}</span>
                  {entry.m.opened_at ? (
                    <span>Opened {new Date(entry.m.opened_at).toLocaleString()}</span>
                  ) : null}
                  {entry.m.clicked_at ? (
                    <span>Clicked {new Date(entry.m.clicked_at).toLocaleString()}</span>
                  ) : null}
                </div>
              </article>
            ) : (
              <article
                key={entry.n.id}
                className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3"
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

        <Tabs defaultValue="reply" className="max-h-[55%] shrink-0 overflow-y-auto border-t border-border px-4 py-3 sm:px-6 lg:px-8">
          <TabsList>
            <TabsTrigger value="reply">Reply</TabsTrigger>
            <TabsTrigger value="note">Internal note</TabsTrigger>
          </TabsList>

          <TabsContent value="reply" className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Subject"
                className="flex-1 min-w-[220px]"
                aria-label="Reply subject"
              />
              <Input
                value={cc}
                onChange={(event) => setCc(event.target.value)}
                placeholder="Cc (reply all)"
                className="w-48"
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
                <SelectTrigger className="w-44" aria-label="Insert saved template">
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={attachmentName}
                onChange={(event) => setAttachmentName(event.target.value)}
                placeholder="Attachment name"
                className="w-40"
                aria-label="Attachment name"
              />
              <Input
                value={attachmentUrl}
                onChange={(event) => setAttachmentUrl(event.target.value)}
                placeholder="Attachment link"
                className="w-56"
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

          <TabsContent value="note" className="mt-3 space-y-2">
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
      </div>

      </ResizablePanel>

      {showProspect ? <ResizableHandle withHandle className="hidden xl:flex" /> : null}

      <ResizablePanel
        id="prospect"
        defaultSize="30"
        minSize="18"
        maxSize="45"
        className={showProspect ? "" : "hidden"}
      >
      <div className="h-full w-full min-w-0 overflow-y-auto border-t border-border xl:border-l xl:border-t-0">
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
      </div>
      </ResizablePanel>
    </ResizablePanelGroup>
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
