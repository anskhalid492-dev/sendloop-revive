import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  BrainCircuit,
  ChevronRight,
  Lightbulb,
  Loader2,
  PencilLine,
  RefreshCw,
  Sparkles,
  Target,
  Wand2,
  CheckCircle2,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  APPROACHES,
  CAMPAIGN_GOALS,
  CTA_TYPES,
  REFINEMENTS,
  briefSchema,
  controlsSchema,
  STYLES,
  TONES,
  defaultBrief,
  defaultControls,
  emptyWriterState,
  stepPurposes,
  totalSteps,
  MAX_FOLLOW_UPS,
  type OfferAdvice,
  type WriterAngle,
  type WriterBrief,
  type WriterControls,
  type WriterReview,
  type WriterState,
  type WriterStep,
  type WriterStrategy,
} from "@/lib/ai-campaign-writer-model";
import {
  generateCampaignAngles,
  generateCampaignStep,
  generateCampaignStrategy,
  getCampaignWriterState,
  improveCampaignOffer,
  reviewCampaignDraft,
  saveCampaignWriterState,
  listWriterTargetCampaigns,
  applyWriterSequenceToCampaign,
  applyWriterStepToCampaign,
} from "@/lib/ai-campaign-writer.functions";
import { aiProviderLabel } from "@/lib/ai-providers";
import { emptyStep, type CampaignBuilder, type StepDraft } from "./useCampaignBuilder";

type Failure = { ok: false; message: string; status: number };
const failed = (r: unknown): r is Failure =>
  Boolean(r) && (r as { ok?: boolean }).ok === false;

/** Saved state may omit fields — never let undefined overwrite a default. */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as Partial<T>;
}

function Card({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Sparkles;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}

export function AiCampaignWriterSidebar({
  builder,
  open,
  onOpenChange,
}: {
  builder: CampaignBuilder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const campaignId = builder.campaignId;

  const loadState = useServerFn(getCampaignWriterState);
  const persist = useServerFn(saveCampaignWriterState);
  const strategyFn = useServerFn(generateCampaignStrategy);
  const anglesFn = useServerFn(generateCampaignAngles);
  const offerFn = useServerFn(improveCampaignOffer);
  const stepFn = useServerFn(generateCampaignStep);
  const reviewFn = useServerFn(reviewCampaignDraft);
  const targetsFn = useServerFn(listWriterTargetCampaigns);
  const applySequenceFn = useServerFn(applyWriterSequenceToCampaign);
  const applyStepFn = useServerFn(applyWriterStepToCampaign);

  const [brief, setBrief] = useState<WriterBrief>(defaultBrief);
  const [controls, setControls] = useState<WriterControls>(defaultControls);
  const [strategy, setStrategy] = useState<WriterStrategy | null>(null);
  const [angles, setAngles] = useState<WriterAngle[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<string | null>(null);
  const [advice, setAdvice] = useState<OfferAdvice | null>(null);
  const [steps, setSteps] = useState<WriterStep[]>([]);
  const [review, setReview] = useState<WriterReview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [providerUsed, setProviderUsed] = useState<string | null>(null);
  /** Which connected AI the customer picked for this campaign (null = first connected). */
  const [providerChoice, setProviderChoice] = useState<string | null>(null);
  /** Which existing campaign the generated copy gets written into. */
  const [targetCampaignId, setTargetCampaignId] = useState<string>("");
  const [confirmTarget, setConfirmTarget] = useState(false);

  const query = useQuery({
    queryKey: ["ai-writer", campaignId],
    queryFn: () => loadState({ data: { campaignId: campaignId! } }),
    enabled: Boolean(campaignId) && open,
  });

  // Hydrate once per campaign from what was saved last time.
  useEffect(() => {
    const saved = query.data?.state;
    if (!saved) return;
    setBrief(briefSchema.parse(defined(saved.brief)));
    const savedControls = controlsSchema.parse(defined(saved.controls));
    const legacy = (saved.controls ?? {}) as { followUps?: number; steps?: number };
    setControls(
      legacy.followUps === undefined && typeof legacy.steps === "number"
        ? { ...savedControls, followUps: Math.max(0, Math.min(MAX_FOLLOW_UPS, legacy.steps - 1)) }
        : savedControls,
    );
    setStrategy(saved.strategy);
    setAngles(saved.angles);
    setSelectedAngle(saved.selectedAngle);
    setAdvice(saved.offerAdvice);
    setSteps(saved.steps);
    setReview(saved.review);
    setProviderUsed(saved.provider);
    setProviderChoice(saved.provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.state?.updatedAt, campaignId]);

  const targets = useQuery({
    queryKey: ["ai-writer-targets", campaignId],
    queryFn: () => targetsFn({ data: { campaignId: campaignId! } }),
    enabled: Boolean(campaignId) && open,
  });
  const targetCampaigns = targets.data?.campaigns ?? [];
  const selectedTarget = targetCampaigns.find((c) => c.id === targetCampaignId) ?? null;

  const connected = query.data?.providers ?? [];
  /** The provider actually used for the next generation. */
  const activeProvider =
    (providerChoice === "openai" || providerChoice === "anthropic" ? providerChoice : null) ??
    (connected[0]?.provider === "openai" || connected[0]?.provider === "anthropic"
      ? (connected[0]!.provider as "openai" | "anthropic")
      : null);

  const save = useMutation({
    mutationFn: async (patch: Partial<WriterState>) => {
      if (!campaignId) return null;
      const state: WriterState = {
        ...emptyWriterState(),
        brief,
        controls,
        strategy,
        angles,
        selectedAngle,
        offerAdvice: advice,
        steps,
        review,
        provider: providerUsed,
        model: query.data?.state.model ?? null,
        ...patch,
      };
      return persist({ data: { campaignId, state } });
    },
  });

  const runStrategy = useMutation({
    mutationFn: async (refinement?: string | null) => {
      const result = await strategyFn({
        data: {
          campaignId: campaignId!,
          provider: activeProvider,
          brief,
          controls,
          angle: selectedAngle,
          refinement: refinement ?? null,
        },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      setStrategy(result.strategy);
      setProviderUsed(result.provider);
      save.mutate({ strategy: result.strategy, provider: result.provider });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runAngles = useMutation({
    mutationFn: async () => {
      const result = await anglesFn({ data: { campaignId: campaignId!, provider: activeProvider, brief, controls } });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      setAngles(result.angles);
      setProviderUsed(result.provider);
      save.mutate({ angles: result.angles, provider: result.provider });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runOffer = useMutation({
    mutationFn: async () => {
      const result = await offerFn({ data: { campaignId: campaignId!, provider: activeProvider, brief, controls } });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      setAdvice(result.advice);
      setProviderUsed(result.provider);
      save.mutate({ offerAdvice: result.advice, provider: result.provider });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runReview = useMutation({
    mutationFn: async () => {
      if (!strategy || !steps.length) throw new Error("Generate the campaign first.");
      const result = await reviewFn({
        data: { campaignId: campaignId!, provider: activeProvider, brief, strategy, steps },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      setReview(result.review);
      save.mutate({ review: result.review });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Sequence generation runs one small request per step, never one giant call. */
  const runSequence = useMutation({
    mutationFn: async (refinement?: string | null) => {
      if (!strategy) throw new Error("Generate the campaign strategy first.");
      const total = totalSteps(controls);
      const purposes = stepPurposes(total);
      const produced: WriterStep[] = [];
      setProgress({ done: 0, total });
      for (let index = 0; index < total; index += 1) {
        const result = await stepFn({
          data: {
            campaignId: campaignId!,
            provider: activeProvider,
            brief,
            controls,
            strategy,
            index,
            total,
            purpose: purposes[index]!,
            previous: produced,
            refinement: refinement ?? null,
          },
        });
        if (failed(result)) throw new Error(result.message);
        produced.push(result.step);
        setSteps([...produced]);
        setProgress({ done: index + 1, total });
      }
      return produced;
    },
    onSettled: () => setProgress(null),
    onSuccess: (produced) => {
      setReview(null);
      save.mutate({ steps: produced, review: null });
      toast.success("Campaign generated. Review it, then apply it to your sequence.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const regenerateOne = useMutation({
    mutationFn: async ({ index, refinement }: { index: number; refinement?: string | null }) => {
      if (!strategy) throw new Error("Generate the campaign strategy first.");
      const result = await stepFn({
        data: {
          campaignId: campaignId!,
          brief,
          controls,
          strategy,
          index,
          total: steps.length,
          purpose: steps[index]?.purpose || stepPurposes(steps.length)[index]!,
          previous: steps.slice(0, index),
          refinement: refinement ?? null,
        },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      const next = steps.slice();
      next[result.index] = result.step;
      setSteps(next);
      save.mutate({ steps: next });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Recreate: a genuinely different version of one step, same brief and settings. */
  const recreateOne = useMutation({
    mutationFn: async (index: number) => {
      if (!strategy) throw new Error("Generate the campaign strategy first.");
      const current = steps[index];
      if (!current) throw new Error("That step no longer exists.");
      const result = await stepFn({
        data: {
          campaignId: campaignId!,
          provider: activeProvider,
          brief,
          controls,
          strategy,
          index,
          total: steps.length,
          purpose: current.purpose || stepPurposes(steps.length)[index]!,
          previous: steps.slice(0, index),
          avoid: `Subject: ${current.subject}\n\n${current.body}`,
        },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      const next = steps.slice();
      next[result.index] = result.step;
      setSteps(next);
      save.mutate({ steps: next });
      toast.success("New version written. Use it, or recreate again.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Writes the whole generated sequence into the campaign the customer picked. */
  const addToCampaign = useMutation({
    mutationFn: async () => {
      if (!targetCampaignId) throw new Error("Choose a campaign first.");
      const result = await applySequenceFn({
        data: {
          campaignId: campaignId!,
          targetCampaignId,
          painPointFallback: strategy?.painPoint ?? brief.painPoint ?? "",
          steps: steps.map((step, index) => ({
            subject: step.subject,
            body: step.body,
            waitDays: index === 0 ? 0 : step.waitDays,
          })),
        },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      setConfirmTarget(false);
      toast.success(
        `Added ${result.steps} email${result.steps > 1 ? "s" : ""} to ${result.campaignName}.` +
          (result.keptExtraSteps
            ? ` ${result.keptExtraSteps} later step(s) were kept because they already have mail.`
            : ""),
      );
      if (targetCampaignId === campaignId) void builder.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** "Use this version": replaces the copy of one step in the chosen campaign. */
  const useThisVersion = useMutation({
    mutationFn: async (index: number) => {
      if (!targetCampaignId) throw new Error("Choose a campaign first.");
      const step = steps[index];
      if (!step) throw new Error("That step no longer exists.");
      const result = await applyStepFn({
        data: {
          campaignId: campaignId!,
          targetCampaignId,
          stepOrder: index + 1,
          painPointFallback: strategy?.painPoint ?? brief.painPoint ?? "",
          step: { subject: step.subject, body: step.body, waitDays: index === 0 ? 0 : step.waitDays },
        },
      });
      if (failed(result)) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      toast.success(`Step ${result.stepOrder} updated in ${result.campaignName}.`);
      if (targetCampaignId === campaignId) void builder.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const existingContent = useMemo(
    () => builder.steps.some((s) => s.subject.trim() || s.body.trim()),
    [builder.steps],
  );

  function applyToSequence() {
    const drafts: StepDraft[] = steps.map((step, index) => {
      const base = builder.steps[index] ?? emptyStep(index, "email");
      return {
        ...base,
        key: base.key,
        stepType: "email",
        name: base.name || (index === 0 ? "Initial email" : `Follow-up #${index}`),
        subject: step.subject,
        body: step.body,
        waitDays: index === 0 ? 0 : step.waitDays,
      };
    });
    builder.updateSteps(() => drafts);
    setConfirmReplace(false);
    onOpenChange(false);
    toast.success("Applied to your sequence. Remember to save the campaign.");
  }

  const busy =
    runStrategy.isPending ||
    runAngles.isPending ||
    runOffer.isPending ||
    runSequence.isPending ||
    runReview.isPending ||
    regenerateOne.isPending ||
    recreateOne.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-primary" />
            AI Campaign Writer
          </SheetTitle>
          <SheetDescription>
            Describe what you sell and the writer builds the strategy, the messaging and a complete
            sequence you can apply to this campaign.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 pb-10">
          {connected.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Generate with</span>
              {connected.length > 1 ? (
                <Select
                  value={activeProvider ?? ""}
                  onValueChange={(value) => {
                    setProviderChoice(value);
                    save.mutate({ provider: value });
                  }}
                >
                  <SelectTrigger className="h-7 w-[190px] text-xs">
                    <SelectValue placeholder="Choose AI provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {connected.map((item) => (
                      <SelectItem key={item.provider} value={item.provider} className="text-xs">
                        {aiProviderLabel(item.provider)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="font-medium text-foreground">
                  {aiProviderLabel(activeProvider ?? connected[0]?.provider)}
                </span>
              )}
              {providerUsed && providerUsed !== activeProvider ? (
                <span>· last generated with {aiProviderLabel(providerUsed)}</span>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              Connect an AI provider key (OpenAI or Claude) in the AI settings to use the campaign
              writer.
            </p>
          )}

          <Card title="Describe your offer" icon={PencilLine}>
            <Textarea
              rows={6}
              value={brief.description}
              onChange={(e) => setBrief({ ...brief, description: e.target.value })}
              placeholder="Tell us what you sell, who it is for, the problem you solve, your main benefit, pricing if relevant, and why customers should choose you."
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The more context you provide, the better your campaign will be.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Offer / product" value={brief.offer} onChange={(v) => setBrief({ ...brief, offer: v })} />
              <Field label="Target audience" value={brief.audience} onChange={(v) => setBrief({ ...brief, audience: v })} />
              <Field label="Industry" value={brief.industry} onChange={(v) => setBrief({ ...brief, industry: v })} />
              <Field label="Job titles / roles" value={brief.roles} onChange={(v) => setBrief({ ...brief, roles: v })} />
              <Field label="Main pain point" value={brief.painPoint} onChange={(v) => setBrief({ ...brief, painPoint: v })} />
              <Field label="Desired outcome" value={brief.outcome} onChange={(v) => setBrief({ ...brief, outcome: v })} />
              <Field label="Unique differentiator" value={brief.differentiator} onChange={(v) => setBrief({ ...brief, differentiator: v })} />
              <Field label="Proof / results" value={brief.proof} onChange={(v) => setBrief({ ...brief, proof: v })} />
              <Field label="Offer / incentive" value={brief.incentive} onChange={(v) => setBrief({ ...brief, incentive: v })} />
              <Field label="Call to action" value={brief.cta} onChange={(v) => setBrief({ ...brief, cta: v })} />
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Campaign goal</Label>
                <Select value={brief.goal} onValueChange={(v) => setBrief({ ...brief, goal: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_GOALS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => runStrategy.mutate(null)} disabled={busy || !connected.length}>
                {runStrategy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Build campaign strategy
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runOffer.mutate()} disabled={busy || !connected.length}>
                <Lightbulb className="size-4" />
                Improve my offer
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runAngles.mutate()} disabled={busy || !connected.length}>
                <Target className="size-4" />
                Generate messaging angles
              </Button>
            </div>
          </Card>

          {advice ? (
            <Card title="Improve my offer" icon={Lightbulb}>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current offer</p>
                  <p className="mt-1">{advice.current}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Recommended offer</p>
                  <p className="mt-1 font-medium">{advice.recommended}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Why this is stronger</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {advice.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
                {advice.missingProof ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    No proof or results were provided, so none were invented. Adding a real result
                    would strengthen this offer.
                  </p>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setBrief({ ...brief, offer: advice.recommended })}>
                  Use recommended offer
                </Button>
              </div>
            </Card>
          ) : null}

          {angles.length ? (
            <Card title="Messaging angles" icon={Target}>
              <div className="grid gap-2">
                {angles.map((angle) => {
                  const active = selectedAngle === angle.name;
                  return (
                    <button
                      key={angle.name}
                      type="button"
                      onClick={() => {
                        setSelectedAngle(angle.name);
                        save.mutate({ selectedAngle: angle.name });
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{angle.name}</span>
                        {active ? <BadgeCheck className="size-4 text-primary" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{angle.summary}</p>
                      <p className="mt-1 text-xs text-primary">{angle.whyItWorks}</p>
                    </button>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {strategy ? (
            <Card
              title="Campaign strategy"
              icon={BrainCircuit}
              action={
                <Select onValueChange={(key) => runStrategy.mutate(REFINEMENTS.find((r) => r.key === key)?.instruction ?? null)}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="Refine strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFINEMENTS.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              <div className="space-y-1.5">
                <Line label="Campaign angle" value={strategy.angle} />
                <Line label="Value proposition" value={strategy.valueProposition} />
                <Line label="Primary pain point" value={strategy.painPoint} />
                <Line label="Recommended offer" value={strategy.offer} />
                <Line label="CTA strategy" value={strategy.ctaStrategy} />
                <Line label="Tone" value={strategy.tone} />
                <Line label="Messaging style" value={strategy.messagingStyle} />
                <Line label="Proof" value={strategy.proofStatus} />
              </div>
              {strategy.personalization.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {strategy.personalization.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[11px]">
                      {p}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <Separator className="my-4" />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tone</Label>
                  <Select value={controls.tone} onValueChange={(v) => setControls({ ...controls, tone: v as WriterControls["tone"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Style</Label>
                  <Select value={controls.style} onValueChange={(v) => setControls({ ...controls, style: v as WriterControls["style"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STYLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Approach</Label>
                  <Select value={controls.approach} onValueChange={(v) => setControls({ ...controls, approach: v as WriterControls["approach"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APPROACHES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Call to action</Label>
                  <Select value={controls.ctaType} onValueChange={(v) => setControls({ ...controls, ctaType: v as WriterControls["ctaType"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CTA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {controls.ctaType === "Custom CTA" ? (
                  <div className="sm:col-span-2">
                    <Field
                      label="Your CTA"
                      value={controls.customCta}
                      onChange={(v) => setControls({ ...controls, customCta: v })}
                      placeholder="Worth a quick look?"
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Number of follow-ups</Label>
                  <Select
                    value={String(controls.followUps)}
                    onValueChange={(v) =>
                      setControls({ ...controls, followUps: Number(v), steps: Number(v) + 1 })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: MAX_FOLLOW_UPS + 1 }, (_, n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n === 0 ? "No follow-ups" : `${n} follow-up${n > 1 ? "s" : ""}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Writes {totalSteps(controls)} email{totalSteps(controls) > 1 ? "s" : ""}: initial
                    email{controls.followUps ? ` + follow-up 1–${controls.followUps}` : ""}.
                  </p>
                </div>
              </div>

              <Button className="mt-4" size="sm" onClick={() => runSequence.mutate(null)} disabled={busy}>
                {runSequence.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Generate campaign
              </Button>
              {progress ? (
                <div className="mt-3">
                  <Progress value={(progress.done / progress.total) * 100} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Writing step {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {steps.length ? (
            <Card
              title="Your campaign"
              icon={Sparkles}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => runReview.mutate()} disabled={busy}>
                    {runReview.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Check campaign
                  </Button>
                  <Select onValueChange={(key) => runSequence.mutate(REFINEMENTS.find((r) => r.key === key)?.instruction ?? null)}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                      <SelectValue placeholder="Rewrite all" />
                    </SelectTrigger>
                    <SelectContent>
                      {REFINEMENTS.map((r) => (
                        <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            >
              {review ? (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-sm">{review.summary}</p>
                  {review.issues.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {review.issues.map((issue) => (
                        <li key={issue.label}>
                          <span className="font-medium text-foreground">{issue.label}:</span>{" "}
                          {issue.detail}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {review.issues.length ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        runSequence.mutate(
                          `Fix these problems: ${review.issues.map((i) => `${i.label} — ${i.detail}`).join("; ")}`,
                        )
                      }
                    >
                      <RefreshCw className="size-4" />
                      Improve campaign
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={index} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Step {index + 1} · {index === 0 ? "Initial email" : `wait ${step.waitDays} days`}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{step.purpose}</p>
                      </div>
                      <Select
                        onValueChange={(key) =>
                          regenerateOne.mutate({
                            index,
                            refinement: REFINEMENTS.find((r) => r.key === key)?.instruction ?? null,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 w-[150px] text-xs">
                          <SelectValue placeholder="Rewrite step" />
                        </SelectTrigger>
                        <SelectContent>
                          {REFINEMENTS.map((r) => (
                            <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      className="mt-2"
                      value={step.subject}
                      onChange={(e) => {
                        const next = steps.slice();
                        next[index] = { ...step, subject: e.target.value };
                        setSteps(next);
                      }}
                    />
                    <Textarea
                      className="mt-2"
                      rows={8}
                      value={step.body}
                      onChange={(e) => {
                        const next = steps.slice();
                        next[index] = { ...step, body: e.target.value };
                        setSteps(next);
                      }}
                      onBlur={() => save.mutate({ steps })}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || !connected.length}
                        onClick={() => recreateOne.mutate(index)}
                      >
                        {recreateOne.isPending && recreateOne.variables === index ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <RefreshCw className="size-4" />
                        )}
                        Recreate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={useThisVersion.isPending || !targetCampaignId}
                        onClick={() => useThisVersion.mutate(index)}
                      >
                        {useThisVersion.isPending && useThisVersion.variables === index ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Use this version
                      </Button>
                      {!targetCampaignId ? (
                        <span className="text-[11px] text-muted-foreground">
                          Pick a campaign below first.
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Add to an existing campaign</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={targetCampaignId} onValueChange={setTargetCampaignId}>
                    <SelectTrigger className="h-9 w-[240px] text-xs">
                      <SelectValue placeholder="Choose a campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetCampaigns.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                          disabled={!item.editable}
                          className="text-xs"
                        >
                          {item.name}
                          {item.editable ? "" : ` · ${item.status} (pause to edit)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={busy || addToCampaign.isPending || !selectedTarget?.editable}
                    onClick={() => setConfirmTarget(true)}
                  >
                    {addToCampaign.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Add to campaign
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Writes these emails into the campaign you pick — subject, body, variables and step
                  order are kept, and no duplicate campaign is created.
                </p>
              </div>

              <Button
                className="mt-4"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => (existingContent ? setConfirmReplace(true) : applyToSequence())}
              >
                Apply to this campaign's sequence
              </Button>
            </Card>
          ) : null}
        </div>
      </SheetContent>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              This campaign already has email content. Applying the generated campaign will replace
              the subject and body of these steps.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyToSequence}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmTarget} onOpenChange={setConfirmTarget}>
        <AlertDialogContent>
          <AlertDialogTitle>Add these emails to {selectedTarget?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The generated copy replaces the subject and body of that campaign's steps, in order. Any
            later step that already has mail is left alone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => addToCampaign.mutate()}>Add copy</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
