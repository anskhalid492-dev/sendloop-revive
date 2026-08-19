import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Clock3, Loader2, RefreshCw, Send } from "lucide-react";
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
import { listCampaignTestDiagnostics, sendCampaignTestEmail } from "@/lib/campaigns.functions";
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

function useResolved(
  builder: CampaignBuilder,
  stepIndex: number,
  leadId: string,
  variantIndex = -1,
) {
  const step = builder.steps[stepIndex];
  const customVariables = builder.settings?.customVariables ?? [];
  const lead = useMemo<LeadLike>(() => {
    const row = builder.leads.find((l) => l.lead_id === leadId)?.lead;
    return row ? ({ ...SAMPLE, ...row } as LeadLike) : SAMPLE;
  }, [builder.leads, leadId]);

  // A/B variants are what actually gets delivered when they exist, so the
  // preview has to resolve the selected variant, not just the base copy.
  const variant = variantIndex >= 0 ? step?.variants[variantIndex] : undefined;
  const rawSubject = variant?.subject || step?.subject || "";
  const rawBody = variant?.body || step?.body || "";

  const subject = renderTemplate(resolveSpintax(rawSubject), lead, customVariables);
  const body = renderTemplate(resolveSpintax(rawBody), lead, customVariables);
  const missing = missingVariables(`${rawSubject} ${rawBody}`, lead, customVariables);
  return { step, lead, subject, body, missing, rawSubject, rawBody };
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
  const [variantIndex, setVariantIndex] = useState(-1);
  const { step, subject, body, missing } = useResolved(builder, stepIndex, leadId, variantIndex);
  const account =
    builder.accounts.find((a) => builder.settings?.sendingAccountIds.includes(a.id)) ??
    builder.accounts[0];
  const variants = step?.variants ?? [];
  const unsubscribe = builder.settings?.unsubscribeEnabled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email preview</DialogTitle>
          <DialogDescription>
            Exactly what the lead receives, with variables and spintax resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
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

            {variants.length > 0 ? (
              <div className="space-y-1.5">
                <Label>Variant</Label>
                <Select
                  value={String(variantIndex)}
                  onValueChange={(v) => setVariantIndex(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">Base copy</SelectItem>
                    {variants.map((v, i) => (
                      <SelectItem key={`${v.label}-${i}`} value={String(i)}>
                        {v.label || `Variant ${i + 1}`} ({v.weight}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
            <div className="space-y-1 border-b border-border p-4">
              <p className="text-xs text-muted-foreground">
                From {account ? `${account.from_name} <${account.from_email}>` : "your mailbox"}
              </p>
              {account?.reply_to ? (
                <p className="text-xs text-muted-foreground">Reply-to {account.reply_to}</p>
              ) : null}
              <p className="pt-1 font-semibold">{subject || "(no subject)"}</p>
            </div>
            <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed">
              {body || "(empty body)"}
              {unsubscribe ? (
                <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
                  Unsubscribe link is appended automatically at send time.
                </p>
              ) : null}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Open tracking {builder.settings?.openTracking ? "on" : "off"} · Click tracking{" "}
            {builder.settings?.clickTracking ? "on" : "off"} · Plain text only{" "}
            {builder.settings?.textOnly ? "yes" : "no"}
          </p>

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
  const [leadId, setLeadId] = useState("__sample__");
  const [variantIndex, setVariantIndex] = useState(-1);
  const { subject, body, rawSubject, rawBody, step } = useResolved(
    builder,
    stepIndex,
    leadId,
    variantIndex,
  );
  const firstSelected = builder.settings?.sendingAccountIds[0] ?? "";
  const [accountId, setAccountId] = useState(firstSelected);
  const [to, setTo] = useState("");
  const sendFn = useServerFn(sendCampaignTestEmail);
  const diagnosticsFn = useServerFn(listCampaignTestDiagnostics);
  const diagnostics = useQuery({
    queryKey: ["campaign-test-diagnostics", builder.campaignId],
    queryFn: () => diagnosticsFn({ data: { campaignId: builder.campaignId } }),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

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
          subject: rawSubject,
          body: rawBody,
          leadId: leadId === "__sample__" ? null : leadId,
        },
      }),
    onSuccess: (res) => {
      const failed = res?.failed ?? [];
      if (failed.length > 0) {
        toast.warning(
          `Provider accepted ${res.accepted} of ${res.accepted + failed.length}. ${failed[0]?.message ?? ""}`,
        );
      } else {
        toast.success("Provider accepted the test email; delivery confirmation is pending");
      }
      diagnostics.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Personalize with</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sample__">Sample lead</SelectItem>
                  {builder.leads.slice(0, 50).map((row) => (
                    <SelectItem key={row.lead_id} value={row.lead_id}>
                      {row.lead?.email ?? row.lead_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(step?.variants.length ?? 0) > 0 ? (
              <div className="space-y-1.5">
                <Label>Variant</Label>
                <Select value={String(variantIndex)} onValueChange={(value) => setVariantIndex(Number(value))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-1">Base copy</SelectItem>
                    {step?.variants.map((variant, index) => (
                      <SelectItem key={`${variant.label}-${index}`} value={String(index)}>
                        {variant.label || `Variant ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delivery diagnostics</p>
                <p className="text-xs text-muted-foreground">Provider acceptance is not final delivery.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => diagnostics.refetch()} title="Refresh diagnostics">
                <RefreshCw className={`size-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(diagnostics.data ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Send a test to capture provider and webhook diagnostics.
                </p>
              ) : (
                diagnostics.data?.map((row) => {
                  const delivered = row.webhookEventType === "delivered";
                  const failed = row.status === "rejected" || ["bounced", "complained"].includes(row.webhookEventType ?? "");
                  const Icon = delivered ? CheckCircle2 : failed ? CircleAlert : Clock3;
                  return (
                    <div key={row.id} className="rounded-md border border-border p-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.recipient_email}</p>
                          <p className="text-muted-foreground">Request {row.request_id}</p>
                        </div>
                        <Badge variant={failed ? "destructive" : delivered ? "default" : "secondary"}>
                          <Icon className="mr-1 size-3" />
                          {row.webhookEventType ?? row.status}
                        </Badge>
                      </div>
                      <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                        <p>Provider: {row.provider}</p>
                        <p className="truncate">Message ID: {row.provider_message_id ?? "Not returned"}</p>
                        <p>Webhook: {row.webhookStatus}</p>
                        <p>{new Date(row.created_at).toLocaleString()}</p>
                      </div>
                      {(row.error || row.webhookError || row.provider_response) ? (
                        <p className="mt-2 break-words rounded bg-muted p-2">
                          {row.error ?? row.webhookError ?? row.provider_response}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
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
