import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Textarea } from "@/components/ui/textarea";
import { requestEmailAccounts } from "@/lib/sending.functions";

export function RequestAccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const submitFn = useServerFn(requestEmailAccounts);
  const [quantity, setQuantity] = useState("1");
  const [domain, setDomain] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          quantity: Math.min(100, Math.max(1, Number(quantity) || 1)),
          preferredDomain: domain.trim() || undefined,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Request sent — your account manager will assign the accounts shortly.");
      setQuantity("1");
      setDomain("");
      setNote("");
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["email-account-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Need more sending accounts?</DialogTitle>
          <DialogDescription>
            Sendloop manages your sending infrastructure. Request additional sending accounts and
            we&apos;ll assign them to your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="request-quantity">Number of accounts</Label>
            <Input
              id="request-quantity"
              type="number"
              min={1}
              max={100}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-domain">Preferred domain or name (optional)</Label>
            <Input
              id="request-domain"
              placeholder="outreach.yourcompany.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-note">Note (optional)</Label>
            <Textarea
              id="request-note"
              rows={3}
              placeholder="Anything we should know about this request?"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Request Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
