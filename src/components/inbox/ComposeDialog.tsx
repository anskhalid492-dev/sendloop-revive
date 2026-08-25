import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, Save } from "lucide-react";
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
        },
      }),
    onSuccess: (result) => {
      setLimitNotice(null);
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
        toast.error("Mailbox limit reached", { description: detail });
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
          attachments: [],
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
    Boolean(body.trim());

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
            <AlertTitle>Mailbox limit reached</AlertTitle>
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
