import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
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
  AI_VARIABLE_TOKEN,
  type AiPersonalizationCoverageLead,
  missingVariables,
  renderEmailForLead,
  senderExtras,
  variableResolutionReport,
  type LeadLike,
} from "@/lib/campaign-model";
import {
  getAiPersonalizationCoverage,
  getLeadPersonalization,
  previewAiPersonalization,
} from "@/lib/ai-personalization.functions";
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

/**
 * The AI snippet shown in a preview is the stored one for that lead, so the
 * preview matches the email that actually goes out.
 */
function useAiSnippet(builder: CampaignBuilder, leadId: string, usesAi: boolean) {
  const fetchStored = useServerFn(getLeadPersonalization);
  const generateFn = useServerFn(previewAiPersonalization);
  const realLead = leadId !== "__sample__";

  const stored = useQuery({
    queryKey: ["ai-personalization", builder.campaignId, leadId],
    queryFn: () => fetchStored({ data: { campaignId: builder.campaignId, leadId } }),
    enabled: usesAi && realLead,
  });

  const generate = useMutation({
    mutationFn: () =>
      generateFn({ data: { campaignId: builder.campaignId, leadId, save: true } }),
    onSuccess: async (res) => {
      if (res.ok) {
        toast.success("Personalization generated");
        await stored.refetch();
      } else {
        toast.error(res.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sampleSnippet = "Loved what your team is building at Acme.";
  const content = realLead ? (stored.data?.content ?? null) : sampleSnippet;

  return {
    content,
    quality: realLead ? (stored.data?.quality ?? null) : "complete",
    dataUsed: realLead ? (stored.data?.dataUsed ?? []) : ["First name", "Company"],
    loading: stored.isLoading,
    canGenerate: realLead,
    generate,
  };
}

function useResolved(
  builder: CampaignBuilder,
  stepIndex: number,
  leadId: string,
  variantIndex = -1,
  aiSnippet?: string | null,
  previewLead?: AiPersonalizationCoverageLead | null,
) {
  const step = builder.steps[stepIndex];
  const customVariables = builder.settings?.customVariables ?? [];
  const lead = useMemo<LeadLike>(() => {
    const row = builder.leads.find((l) => l.lead_id === leadId)?.lead;
    const serverLead = previewLead?.id === leadId ? previewLead : null;
    return row
      ? ({ ...SAMPLE, ...row } as LeadLike)
      : serverLead
        ? ({ ...SAMPLE, ...serverLead } as LeadLike)
        : SAMPLE;
  }, [builder.leads, leadId, previewLead]);

  // A/B variants are what actually gets delivered when they exist, so the
  // preview has to resolve the selected variant, not just the base copy.
  const variant = variantIndex >= 0 ? step?.variants[variantIndex] : undefined;
  const rawSubject = variant?.subject || step?.subject || "";
  const rawBody = variant?.body || step?.body || "";

  // Preview signs off with the mailbox the campaign actually sends from.
  const sending = builder.campaign?.sending_account_ids ?? [];
  const account =
    builder.accounts.find((a) => sending.includes(a.id)) ?? builder.accounts[0] ?? null;
  const extras = {
    ...senderExtras(account as never),
    ...(aiSnippet ? { [AI_VARIABLE_TOKEN]: aiSnippet } : {}),
  };
  // One resolver for preview, test send and real delivery.
  const { subject, body } = renderEmailForLead(
    { subject: rawSubject, body: rawBody },
    lead,
    { customVariables, extras },
  );
  const missing = missingVariables(`${rawSubject} ${rawBody}`, lead, customVariables);
  return { step, lead, subject, body, missing, rawSubject, rawBody, extras };
}

const SOURCE_LABEL: Record<string, string> = {
  lead: "Lead data",
  ai: "AI personalization",
  fallback: "Inline fallback",
  custom_default: "Custom default",
  system: "Filled at send time",
  missing: "No value for this lead",
  unknown: "Unknown variable",
};

/** Shows exactly where each template variable resolved from for this lead. */
function VariableReport({
  rawSubject,
  rawBody,
  builder,
  leadId,
  extras,
}: {
  rawSubject: string;
  rawBody: string;
  builder: CampaignBuilder;
  leadId: string;
  extras: Record<string, string>;
}) {
  const lead = useMemo<LeadLike>(() => {
    const row = builder.leads.find((l) => l.lead_id === leadId)?.lead;
    return row ? ({ ...SAMPLE, ...row } as LeadLike) : SAMPLE;
  }, [builder.leads, leadId]);

  const report = variableResolutionReport(
    rawSubject,
    rawBody,
    lead,
    builder.settings?.customVariables ?? [],
    extras,
  );
  if (report.length === 0) return null;
  const isUnresolved = (source: string) => source === "missing" || source === "unknown";
  const unresolved = report.filter((r) => isUnresolved(r.source));

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${unresolved.length ? "border-amber-500/30 bg-amber-500/10" : "border-border"}`}
    >
      <p className="font-medium">
        {unresolved.length
          ? `${unresolved.length} variable${unresolved.length === 1 ? "" : "s"} could not be resolved`
          : "All variables resolved"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {report.map((r) => (
          <li key={r.token} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="font-mono font-normal">
              {`{{${r.token}}}`}
            </Badge>
            <span className="text-muted-foreground">{r.where.join(" + ")}</span>
            <span
              className={
                isUnresolved(r.source) ? "font-medium text-amber-600" : "text-muted-foreground"
              }
            >
              {SOURCE_LABEL[r.source] ?? r.source}
            </span>
            {r.value ? <span className="truncate text-foreground">&ldquo;{r.value}&rdquo;</span> : null}
          </li>
        ))}
      </ul>
      {unresolved.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Unresolved variables send as empty text. Add a fallback like {"{{"}first_name | there{"}}"} or fill
          the missing lead fields.
        </p>
      ) : null}
    </div>
  );
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
  const rawStep = builder.steps[stepIndex];
  const usesAi = `${rawStep?.subject ?? ""} ${rawStep?.body ?? ""}`.includes(AI_VARIABLE_TOKEN);
  const fetchAiCoverage = useServerFn(getAiPersonalizationCoverage);
  const aiCoverage = useQuery({
    queryKey: ["ai-personalization-coverage", builder.campaignId],
    queryFn: () => fetchAiCoverage({ data: { campaignId: builder.campaignId } }),
    enabled: open && usesAi,
  });

  useEffect(() => {
    if (!usesAi || leadId !== "__sample__" || !aiCoverage.data?.sampleLeadId) return;
    setLeadId(aiCoverage.data.sampleLeadId);
  }, [usesAi, leadId, aiCoverage.data?.sampleLeadId]);

  const ai = useAiSnippet(builder, leadId, usesAi);
  const { step, subject, body, rawSubject, rawBody, extras } = useResolved(
    builder,
    stepIndex,
    leadId,
    variantIndex,
    ai.content,
    aiCoverage.data?.sampleLead ?? null,
  );

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
                  {aiCoverage.data?.sampleLeadId &&
                  !builder.leads.some((row) => row.lead_id === aiCoverage.data?.sampleLeadId) ? (
                    <SelectItem value={aiCoverage.data.sampleLeadId}>
                      {aiCoverage.data.sampleLead?.email ?? "Personalized campaign lead"}
                    </SelectItem>
                  ) : null}
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

          <VariableReport
            rawSubject={rawSubject}
            rawBody={rawBody}
            builder={builder}
            leadId={leadId}
            extras={extras}
          />

          {usesAi ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 font-medium">
                  <Sparkles className="size-4 text-primary" /> AI personalization
                  {ai.quality && ai.quality !== "complete" ? (
                    <Badge variant="secondary" className="capitalize">
                      {ai.quality === "limited" ? "Limited data" : "Fallback"}
                    </Badge>
                  ) : null}
                </p>
                {ai.canGenerate ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ai.generate.mutate()}
                    disabled={ai.generate.isPending}
                  >
                    {ai.generate.isPending ? (
                      <Loader2 className="mr-2 size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 size-3.5" />
                    )}
                    {ai.content ? "Regenerate" : "Generate"}
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 text-muted-foreground">
                {ai.loading
                  ? "Loading…"
                  : (ai.content ??
                    "Not generated for this lead yet — the campaign fallback text is used until it is.")}
              </p>
              {ai.dataUsed.length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Based on: {ai.dataUsed.join(", ")}
                </p>
              ) : null}
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
          `MunchReach accepted ${res.accepted} of ${res.accepted + failed.length}. ${failed[0]?.message ?? ""}`,
        );
      } else {
        toast.success("MunchReach accepted the test email; delivery confirmation is pending");
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
                <p className="text-xs text-muted-foreground">Acceptance is not the same as final delivery.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => diagnostics.refetch()} title="Refresh diagnostics">
                <RefreshCw className={`size-4 ${diagnostics.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {(diagnostics.data ?? []).length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Send a test to capture delivery diagnostics.
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
                        <p>Sending infrastructure: MunchReach</p>
                        <p className="truncate">Delivery ID: {row.provider_message_id ?? "Pending"}</p>
                        <p>Delivery status: {row.webhookStatus}</p>
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
