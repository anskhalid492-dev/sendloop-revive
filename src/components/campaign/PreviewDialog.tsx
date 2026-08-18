import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  missingVariables,
  renderTemplate,
  resolveSpintax,
  type LeadLike,
} from "@/lib/campaign-model";
import { sendCampaignTestEmail } from "@/lib/campaigns.functions";
import type { CampaignBuilder } from "./useCampaignBuilder";

const SAMPLE: LeadLike = {
  email: "alex@acme.io",
  first_name: "Alex",
  last_name: "Rivera",
  company: "Acme",
  job_title: "Head of Sales",
  website: "acme.io",
  phone: "+1 555 0134",
  city: "Austin",
  state: "TX",
  country: "United States",
  linkedin_url: "linkedin.com/in/alexrivera",
  custom_fields: {},
};

function useResolved(builder: CampaignBuilder, stepIndex: number, leadId: string) {
  const step = builder.steps[stepIndex];
  const customVariables = builder.settings?.customVariables ?? [];
  const lead = useMemo<LeadLike>(() => {
    const row = builder.leads.find((l) => l.lead_id === leadId)?.lead;
    return row ? ({ ...SAMPLE, ...row } as LeadLike) : SAMPLE;
  }, [builder.leads, leadId]);

  const subject = step
    ? renderTemplate(resolveSpintax(step.subject), lead, customVariables)
    : "";
  const body = step ? renderTemplate(resolveSpintax(step.body), lead, customVariables) : "";
  const missing = step
    ? missingVariables(`${step.subject} ${step.body}`, lead, customVariables)
    : [];
  return { step, lead, subject, body, missing };
}


export function PreviewDialog({
  builder,
  stepIndex,
  open,
  onOpenChange,
}: {
  builder: CampaignBuilder;
  stepIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [leadId, setLeadId] = useState("__sample__");
  const { step, subject, body, missing } = useResolved(builder, stepIndex, leadId);
  const account = builder.accounts.find((a) =>
    builder.settings?.sendingAccountIds.includes(a.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email preview</DialogTitle>
          <DialogDescription>
            Exactly what the lead receives, with variables and spintax resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Preview with</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sample__">Sample lead (Alex at Acme)</SelectItem>
                {builder.leads.slice(0, 50).map((row) => (
                  <SelectItem key={row.lead_id} value={row.lead_id}>
                    {row.lead?.email ?? row.lead_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {missing.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              Missing values for:{" "}
              {missing.map((v) => (
                <Badge key={v} variant="outline" className="mr-1 font-normal">
                  {v}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="rounded-xl border border-border">
            <div className="border-b border-border p-4">
              <p className="text-xs text-muted-foreground">
                From {account ? `${account.from_name} <${account.from_email}>` : "your mailbox"}
              </p>
              <p className="mt-1 font-semibold">{subject || "(no subject)"}</p>
            </div>
            <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
              {body || "(empty body)"}
            </div>
          </div>
          {step?.stepType !== "email" ? (
            <p className="text-sm text-muted-foreground">
              This step is not an email step, so nothing is delivered to the lead.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TestSendDialog({
  builder,
  stepIndex,
  open,
  onOpenChange,
}: {
  builder: CampaignBuilder;
  stepIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { subject, body } = useResolved(builder, stepIndex, "__sample__");
  const firstSelected = builder.settings?.sendingAccountIds[0] ?? "";
  const [accountId, setAccountId] = useState(firstSelected);
  const [to, setTo] = useState("");
  const sendFn = useServerFn(sendCampaignTestEmail);

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          campaignId: builder.campaignId,
          sendingAccountId: accountId || firstSelected,
          to: to
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          subject,
          body,
        },
      }),
    onSuccess: () => {
      toast.success("Test email sent");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a test email</DialogTitle>
          <DialogDescription>
            Sends step {stepIndex + 1} through one of your managed mailboxes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Send from</Label>
            <Select value={accountId || firstSelected} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a mailbox" />
              </SelectTrigger>
              <SelectContent>
                {builder.accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.from_email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              placeholder="you@company.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate up to 5 addresses with commas.</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">{subject || "(no subject)"}</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">{body}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || !to.trim()}>
            {send.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
