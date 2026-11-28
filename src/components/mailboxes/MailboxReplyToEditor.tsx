import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mailboxReplyToSchema } from "@/lib/mailbox-reply-to";
import { setWorkspaceMailboxReplyTo, type WorkspaceMailboxRow } from "@/lib/workspace-mailboxes.functions";

export function MailboxReplyToEditor({ row }: { row: WorkspaceMailboxRow }) {
  const queryClient = useQueryClient();
  const runSave = useServerFn(setWorkspaceMailboxReplyTo);
  const [value, setValue] = useState(row.replyTo ?? "");
  const [saved, setSaved] = useState(row.replyTo ?? "");
  const [unconnected, setUnconnected] = useState(false);
  useEffect(() => {
    setValue(row.replyTo ?? "");
    setSaved(row.replyTo ?? "");
    setUnconnected(false);
  }, [row.id, row.replyTo]);
  const validation = mailboxReplyToSchema.safeParse(value);
  const save = useMutation({
    mutationFn: () => runSave({ data: { id: row.id, replyTo: mailboxReplyToSchema.parse(value) } }),
    onSuccess: result => {
      setSaved(result.replyTo ?? "");
      setValue(result.replyTo ?? "");
      setUnconnected(!result.receivingMailboxConnected);
      toast.success("Reply-To saved.");
      void queryClient.invalidateQueries({ queryKey: ["workspace-mailboxes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="min-w-0 space-y-2">
      <Label htmlFor={`reply-to-${row.id}`} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reply-To email</Label>
      <div className="flex min-w-0 gap-2">
        <Input id={`reply-to-${row.id}`} type="email" className="min-w-0" value={value}
          onChange={event => setValue(event.target.value)} placeholder={row.email} maxLength={254}
          disabled={!row.sendingAccountId || save.isPending} aria-invalid={!validation.success}
          aria-describedby={`reply-to-note-${row.id}`} />
        <Button variant="outline" onClick={() => save.mutate()}
          disabled={!row.sendingAccountId || save.isPending || !validation.success || validation.data === saved}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </div>
      {value && !validation.success ? <p className="text-xs text-destructive">Enter one valid email address.</p> : null}
      <p id={`reply-to-note-${row.id}`} className="text-xs text-muted-foreground break-words">
        Leave blank to receive replies at this mailbox. Connect the Reply-To mailbox in this workspace to track replies in Unibox and campaign statistics.
      </p>
      {unconnected ? <p className="text-xs text-warning">Replies go to this address, but won’t be tracked until its mailbox is connected and active here.</p> : null}
    </section>
  );
}