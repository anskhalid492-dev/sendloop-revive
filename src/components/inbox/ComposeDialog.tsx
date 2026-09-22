import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  PenLine,
  Save,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/inbox/RichTextEditor";
import { composerHtmlToText, textToComposerHtml } from "@/lib/rich-text";
import { listComposeMailboxes, saveDraft, sendComposedEmail } from "@/lib/inbox.functions";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SENDER_SIGNATURE_TOKEN } from "@/lib/signature-model";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export type ComposeSeed = {
  draftId?: string | null;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  sendingAccountId?: string | null;
};

const splitEmails = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);

export function ComposeDialog({
  open,
  onOpenChange,
  workspaceId,
  seed,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  seed?: ComposeSeed | undefined;
  onSent?: (conversationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const fetchMailboxes = useServerFn(listComposeMailboxes);
  const send = useServerFn(sendComposedEmail);
  const persistDraft = useServerFn(saveDraft);

  const [accountId, setAccountId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Formatted source of truth; `body` stays the plain-text equivalent.
  const [bodyHtml, setBodyHtml] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  // Identifies this send attempt. If the request is replayed (slow network, an
  // automatic retry), the server recognises the key and delivers only once.
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID());
  const [reading, setReading] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  // Floating window chrome: the compose panel never takes over the inbox.
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showCc, setShowCc] = useState(false);

  const mailboxesQuery = useQuery({
    queryKey: ["compose-mailboxes", workspaceId],
    enabled: Boolean(workspaceId) && open,
    queryFn: () => fetchMailboxes({ data: { workspaceId: workspaceId! } }),
  });

  const mailboxes = useMemo(() => mailboxesQuery.data?.accounts ?? [], [mailboxesQuery.data]);

  useEffect(() => {
    if (!open) return;
    setTo(seed?.to ?? "");
    setCc(seed?.cc ?? "");
    setBcc(seed?.bcc ?? "");
    setSubject(seed?.subject ?? "");
    setBody(seed?.body ?? "");
    setBodyHtml(textToComposerHtml(seed?.body ?? ""));
    setDraftId(seed?.draftId ?? null);
    setAccountId(seed?.sendingAccountId ?? "");
    setAttachments([]);
    setSendKey(crypto.randomUUID());
    setLimitNotice(null);
    setMinimized(false);
    setShowCc(Boolean(seed?.cc || seed?.bcc));
  }, [open, seed]);

  const eligible = useMemo(() => mailboxes.filter((m) => m.available), [mailboxes]);
  const selected = useMemo(
    () => mailboxes.find((m) => m.id === accountId) ?? null,
    [mailboxes, accountId],
  );

  // Never leave an ineligible mailbox selected: prefer one that can still send.
  useEffect(() => {
    if (!mailboxes.length) return;
    const current = mailboxes.find((m) => m.id === accountId);
    if (current?.available) return;
    if (eligible.length) setAccountId(eligible[0]!.id);
  }, [mailboxes, eligible, accountId]);

  const attachedBytes = totalAttachmentBytes(attachments);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files);
    if (attachments.length + picked.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to one email.`);
      return;
    }
    const incoming = picked.reduce((sum, file) => sum + file.size, 0);
    if (attachedBytes + incoming > MAX_TOTAL_ATTACHMENT_BYTES) {
      toast.error("Attachments too large", { description: ATTACHMENT_LIMIT_MESSAGE });
      return;
    }
    setReading(true);
    try {
      const read = await Promise.all(picked.map(fileToOutboundAttachment));
      setAttachments((current) => [...current, ...read]);
    } catch {
      toast.error("One of those files could not be read. Please try again.");
    } finally {
      setReading(false);
    }
  };

  const sendMutation = useMutation({
    mutationFn: async () =>
      send({
        data: {
          workspaceId: workspaceId!,
          sendingAccountId: accountId,
          to: to.trim(),
          cc: splitEmails(cc),
          bcc: splitEmails(bcc),
          subject: subject.trim(),
          body: body.trim(),
          ...(bodyHtml.trim() ? { bodyHtml } : {}),
          draftId,
          attachments,
          sendKey,
        },
      }),
    onSuccess: (result) => {
      setLimitNotice(null);
      setSendKey(crypto.randomUUID());
      toast.success("Email sent");
      void queryClient.invalidateQueries({ queryKey: ["conversations", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-drafts", workspaceId] });
      onOpenChange(false);
      onSent?.(result.conversationId);
    },
    onError: (error: Error) => {
      // Keep the compose window and every field intact so the customer can
      // simply pick another mailbox and retry.
      if (isMailboxLimitError(error.message)) {
        const detail = mailboxLimitMessage(error.message);
        setLimitNotice(detail);
        toast.error("Mailbox unavailable", { description: detail });
        void mailboxesQuery.refetch();
        return;
      }
      toast.error(error.message || "The email could not be sent.");
    },
  });

  const draftMutation = useMutation({
    mutationFn: async () =>
      persistDraft({
        data: {
          ...(draftId ? { id: draftId } : {}),
          workspaceId: workspaceId!,
          sendingAccountId: accountId || null,
          to,
          cc: splitEmails(cc),
          bcc: splitEmails(bcc),
          subject,
          body,
          // Drafts keep the file list as metadata only; files are re-attached
          // when the draft is finished.
          attachments: attachments.map((file) => ({
            name: file.name,
            contentType: file.contentType,
            size: file.size,
          })),
        },
      }),
    onSuccess: (result) => {
      setDraftId(result.id);
      toast.success("Draft saved");
      void queryClient.invalidateQueries({ queryKey: ["inbox-drafts", workspaceId] });
    },
    onError: () => toast.error("Couldn’t save that draft."),
  });

  const canSend =
    Boolean(workspaceId && accountId) &&
    Boolean(selected?.available) &&
    to.trim().length > 3 &&
    Boolean(subject.trim()) &&
    Boolean(body.trim()) &&
    !reading;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="New email"
      aria-modal="false"
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg",
        "inset-x-2 bottom-2 top-2 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-4",
        minimized
          ? "sm:h-12 sm:w-[360px]"
          : expanded
            ? "sm:h-[86vh] sm:w-[min(880px,calc(100vw-2rem))]"
            : "sm:h-[560px] sm:w-[540px]",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <PenLine className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {subject.trim() || "New email"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden h-7 w-7 sm:inline-flex"
          aria-label={minimized ? "Restore compose window" : "Minimize compose window"}
          onClick={() => setMinimized((v) => !v)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden h-7 w-7 sm:inline-flex"
          aria-label={expanded ? "Shrink compose window" : "Expand compose window"}
          onClick={() => {
            setMinimized(false);
            setExpanded((v) => !v);
          }}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close compose window"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      {minimized ? null : (
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {limitNotice ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Mailbox unavailable</AlertTitle>
            <AlertDescription>{limitNotice}</AlertDescription>
          </Alert>
        ) : null}
        {mailboxes.length > 0 && eligible.length === 0 ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No mailbox available</AlertTitle>
            <AlertDescription>
              No sending mailboxes are currently available. Try again later.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="compose-from">From</Label>
            <Select value={accountId} onValueChange={(value) => { setAccountId(value); setLimitNotice(null); }}>
              <SelectTrigger id="compose-from">
                <SelectValue
                  placeholder={mailboxes.length ? "Choose a mailbox" : "No mailboxes assigned"}
                />
              </SelectTrigger>
              <SelectContent>
                {mailboxes.map((mailbox) => (
                  <SelectItem key={mailbox.id} value={mailbox.id} disabled={!mailbox.available}>
                    <span className="flex flex-col text-left">
                      <span className="font-medium">
                        {mailbox.from_name} · {mailbox.from_email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {mailbox.sentToday}/{mailbox.dailyLimit} sent today
                        {mailbox.available
                          ? ` · ${mailbox.dailyRemaining} remaining`
                          : ` · ${mailbox.reasonLabel}`}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.available
                  ? `${selected.dailyRemaining} of ${selected.dailyLimit} emails remaining today`
                  : selected.reasonLabel}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="compose-to">To</Label>
            <Input
              id="compose-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="prospect@company.com"
            />
          </div>

          {showCc ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="compose-cc">Cc</Label>
              <Input id="compose-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="compose-bcc">Bcc</Label>
              <Input id="compose-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="w-fit text-xs font-medium text-primary hover:underline"
            >
              Add Cc / Bcc
            </button>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="compose-subject">Subject</Label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="compose-body">Message</Label>
            <RichTextEditor
              id="compose-body"
              value={bodyHtml}
              onChange={(html) => {
                setBodyHtml(html);
                setBody(composerHtmlToText(html));
              }}
              minHeight={200}
              ariaLabel="Message"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="compose-files">Attachments</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reading}
                onClick={() => document.getElementById("compose-files")?.click()}
              >
                {reading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="mr-2 h-4 w-4" />
                )}
                Attach files
              </Button>
              <input
                id="compose-files"
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void onPickFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <span className="text-xs text-muted-foreground">
                Up to {MAX_ATTACHMENTS_PER_MESSAGE} files, {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}{" "}
                total
                {attachments.length ? ` · ${formatBytes(attachedBytes)} attached` : ""}
              </span>
            </div>
            {attachments.length ? (
              <ul className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-1.5 rounded border border-border/70 bg-muted/40 px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-48 truncate">{file.name}</span>
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
          </div>
        </div>

      </div>
      )}

      {minimized ? null : (
        <footer className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
          <Button
            size="sm"
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Attach files"
            disabled={reading}
            onClick={() => document.getElementById("compose-files")?.click()}
          >
            {reading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const token = `{{${SENDER_SIGNATURE_TOKEN}}}`;
              setBody((current) =>
                current.includes(token) ? current : `${current.replace(/\s+$/, "")}\n\n${token}`,
              );
              setBodyHtml((current) =>
                current.includes(token) ? current : `${current}<p>${token}</p>`,
              );
            }}
          >
            Signature
          </Button>
          <Button
            className="ml-auto"
            variant="outline"
            size="sm"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending || !workspaceId}
          >
            {draftMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Draft
          </Button>
        </footer>
      )}
    </div>
  );
}
