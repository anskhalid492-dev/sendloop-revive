import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SendingDomain } from "@/lib/domains-model";
import { connectMailbox } from "@/lib/mailboxes.functions";

/**
 * Connects a mailbox on a domain the customer owns. Sending infrastructure is
 * managed by Sendloop, so there is deliberately no provider picker and no
 * credential fields here — that configuration is admin-side only.
 */
export function ConnectMailboxDialog({
  open,
  onOpenChange,
  domains,
  defaultDomainId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: SendingDomain[];
  defaultDomainId?: string | null;
}) {
  const queryClient = useQueryClient();
  const connect = useServerFn(connectMailbox);

  const verifiedDomains = useMemo(
    () => domains.filter((domain) => domain.dns_status === "verified"),
    [domains],
  );

  const [domainId, setDomainId] = useState("");
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [dailyLimit, setDailyLimit] = useState("50");
  const [hourlyLimit, setHourlyLimit] = useState("20");
  const [enableWarmup, setEnableWarmup] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDomainId(defaultDomainId ?? verifiedDomains[0]?.id ?? "");
  }, [open, defaultDomainId, verifiedDomains]);

  const selectedDomain = verifiedDomains.find((domain) => domain.id === domainId);

  const mutation = useMutation({
    mutationFn: () =>
      connect({
        data: {
          domainId,
          email: `${localPart.trim()}@${selectedDomain?.domain ?? ""}`.toLowerCase(),
          displayName: displayName.trim(),
          replyTo: replyTo.trim(),
          dailyLimit: Number(dailyLimit) || 50,
          hourlyLimit: Number(hourlyLimit) || 20,
          enableWarmup,
          warmupDailyTarget: 20,
        },
      }),
    onSuccess: async () => {
      toast.success("Mailbox connected.");
      setLocalPart("");
      setDisplayName("");
      setReplyTo("");
      await queryClient.invalidateQueries({ queryKey: ["email-accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["sending-domains"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ready =
    Boolean(domainId) && localPart.trim().length > 0 && displayName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect your email account</DialogTitle>
          <DialogDescription>
            Connect a mailbox on a domain you own. Sendloop handles the sending infrastructure for
            you — there is nothing to configure and no keys to paste.
          </DialogDescription>
        </DialogHeader>

        {verifiedDomains.length === 0 ? (
          <p className="rounded-lg border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
            Add a domain and verify its DNS records first. Mailboxes can only be connected on a
            verified domain.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready) mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Verified domain</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a domain" />
                </SelectTrigger>
                <SelectContent>
                  {verifiedDomains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mailbox-local">Mailbox address</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="mailbox-local"
                    value={localPart}
                    onChange={(event) => setLocalPart(event.target.value)}
                    placeholder="hello"
                    autoComplete="off"
                    required
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    @{selectedDomain?.domain ?? "domain"}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mailbox-name">Sender name</Label>
                <Input
                  id="mailbox-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Jane from Acme"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mailbox-replyto">Reply-to (optional)</Label>
              <Input
                id="mailbox-replyto"
                type="email"
                value={replyTo}
                onChange={(event) => setReplyTo(event.target.value)}
                placeholder="jane@yourcompany.com"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mailbox-daily">Daily limit</Label>
                <Input
                  id="mailbox-daily"
                  type="number"
                  min={1}
                  max={2000}
                  value={dailyLimit}
                  onChange={(event) => setDailyLimit(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mailbox-hourly">Hourly limit</Label>
                <Input
                  id="mailbox-hourly"
                  type="number"
                  min={1}
                  max={500}
                  value={hourlyLimit}
                  onChange={(event) => setHourlyLimit(event.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/70 p-3">
              <div>
                <p className="text-sm font-medium">Start warmup</p>
                <p className="text-xs text-muted-foreground">
                  Ramp volume gradually before running full campaigns.
                </p>
              </div>
              <Switch checked={enableWarmup} onCheckedChange={setEnableWarmup} />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!ready || mutation.isPending}>
                {mutation.isPending ? "Connecting…" : "Connect mailbox"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
