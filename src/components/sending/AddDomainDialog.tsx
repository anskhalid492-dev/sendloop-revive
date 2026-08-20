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
import { addSendingDomain } from "@/lib/domains.functions";

export function AddDomainDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const addDomain = useServerFn(addSendingDomain);
  const [domain, setDomain] = useState("");
  const [registrar, setRegistrar] = useState("");

  const mutation = useMutation({
    mutationFn: () => addDomain({ data: { domain: domain.trim(), registrar: registrar.trim() } }),
    onSuccess: async (result) => {
      toast.success("Domain added — publish the DNS records to verify it.");
      setDomain("");
      setRegistrar("");
      await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      onOpenChange(false);
      onAdded?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your domain</DialogTitle>
          <DialogDescription>
            Use a domain you own. MunchReach never sells or provides domains or mailboxes — you keep
            full ownership of your sending infrastructure.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!domain.trim()) return;
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="domain-name">Domain</Label>
            <Input
              id="domain-name"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="outreach.yourcompany.com"
              autoComplete="off"
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              A dedicated sending subdomain protects your main domain's reputation.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="domain-registrar">DNS provider (optional)</Label>
            <Input
              id="domain-registrar"
              value={registrar}
              onChange={(event) => setRegistrar(event.target.value)}
              placeholder="Cloudflare, GoDaddy, Route 53…"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || !domain.trim()}>
              {mutation.isPending ? "Adding…" : "Add domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
