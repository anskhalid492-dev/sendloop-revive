import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Paperclip, Send, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  // Identifies this send attempt. If the request is replayed (slow network, an
  // automatic retry), the server recognises the key and delivers only once.
  const [sendKey, setSendKey] = useState(() => crypto.randomUUID());
  const [reading, setReading] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

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
    setDraftId(seed?.draftId ?? null);
    setAccountId(seed?.sendingAccountId ?? "");
    setAttachments([]);
    setSendKey(crypto.randomUUID());
    setLimitNotice(null);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New email</DialogTitle>
          <DialogDescription>
            Sends from one of your managed mailboxes and starts a tracked conversation.
          </DialogDescription>
        </DialogHeader>

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
            <Textarea
              id="compose-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
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

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => draftMutation.mutate()}
            disabled={draftMutation.isPending || !workspaceId}
          >
            {draftMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save draft
          </Button>
          <Button onClick={() => sendMutation.mutate()} disabled={!canSend || sendMutation.isPending}>
            {sendMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
