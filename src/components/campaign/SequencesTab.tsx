import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  BrainCircuit,
  Copy,
  Eye,
  GitBranch,
  Mail,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Webhook,
} from "lucide-react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AI_VARIABLE_TOKEN,
  LEAD_VARIABLES,
  STEP_TYPE_LABELS,
  VARIABLE_GROUPS,
  auditVariables,
  normalizeVariableToken,
  spintaxVariationCount,
  type LeadLike,
  type StepType,
} from "@/lib/campaign-model";

import { insertAtSelection, variableSnippet } from "@/lib/campaign-editor";
import { emptyStep, type CampaignBuilder, type StepDraft } from "./useCampaignBuilder";
import { AiPersonalizationSidebar } from "./AiPersonalizationSidebar";
import { AiCampaignWriterSidebar } from "./AiCampaignWriterSidebar";
import { SpintaxBuilder } from "./SpintaxBuilder";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getAiPersonalizationCoverage } from "@/lib/ai-personalization.functions";
import { listTemplates } from "@/lib/templates.functions";

const STEP_ICONS: Record<StepType, typeof Mail> = {
  email: Mail,
  wait: ArrowDown,
  condition: GitBranch,
  task: Sparkles,
  crm: Braces,
  webhook: Webhook,
  stop: Trash2,
};

const CONDITION_TYPES = [
  "replied",
  "not_replied",
  "opened",
  "not_opened",
  "clicked",
  "not_clicked",
  "positive_reply",
  "out_of_office",
  "tag_exists",
  "custom_field",
] as const;

export function SequencesTab({
  builder,
  onPreview,
  onTest,
}: {
  builder: CampaignBuilder;
  onPreview: (stepIndex: number) => void;
  onTest: (stepIndex: number) => void;
}) {
  const { steps, updateSteps, leads, settings, patchSettings } = builder;
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [newVarLabel, setNewVarLabel] = useState("");
  const [newVarToken, setNewVarToken] = useState("");
  const [newVarDefault, setNewVarDefault] = useState("");
  const [tokenEdited, setTokenEdited] = useState(false);

  const customVariables = settings?.customVariables ?? [];

  const createVariable = () => {
    const token = normalizeVariableToken(newVarToken || newVarLabel);
    const label = newVarLabel.trim() || token;
    if (!token) return;
    if (
      LEAD_VARIABLES.some((v) => v.token === token) ||
      customVariables.some((v) => v.token === token)
    ) {
      setVariableDialogOpen(false);
      insertToken(token);
      return;
    }
    patchSettings({
      customVariables: [...customVariables, { token, label, defaultValue: newVarDefault.trim() }],
    });
    setVariableDialogOpen(false);
    setNewVarLabel("");
    setNewVarToken("");
    setNewVarDefault("");
    setTokenEdited(false);
    insertToken(token);
  };

  const removeVariable = (token: string) =>
    patchSettings({ customVariables: customVariables.filter((v) => v.token !== token) });

  useEffect(() => {
    if (activeIndex > steps.length - 1) setActiveIndex(Math.max(0, steps.length - 1));
  }, [steps.length, activeIndex]);

  const step = steps[activeIndex];
  const customFields = [
    ...new Set(
      leads.flatMap((l) => Object.keys((l.lead?.custom_fields as Record<string, string>) ?? {})),
    ),
  ];

  const { workspace } = useWorkspace();
  const fetchTemplates = useServerFn(listTemplates);
  const fetchAiCoverage = useServerFn(getAiPersonalizationCoverage);
  const templatesQuery = useQuery({
    queryKey: ["templates", workspace?.id ?? null],
    queryFn: () => fetchTemplates({ data: { workspaceId: workspace?.id ?? null } }),
  });
  const templateGroups = useMemo(() => {
    const groups = new Map<string, Array<{ id: string; name: string; subject: string; body: string }>>();
    for (const t of templatesQuery.data?.templates ?? []) {
      const list = groups.get(t.category) ?? [];
      list.push({ id: t.id, name: t.name, subject: t.subject, body: t.body });
      groups.set(t.category, list);
    }
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  }, [templatesQuery.data]);


  const patchStep = (patch: Partial<StepDraft>) =>
    updateSteps((prev) => prev.map((s, i) => (i === activeIndex ? { ...s, ...patch } : s)));

  const patchConfig = (patch: Record<string, string | number | boolean | null>) =>
    updateSteps((prev) =>
      prev.map((s, i) => (i === activeIndex ? { ...s, config: { ...s.config, ...patch } } : s)),
    );

  const addStep = (type: StepType) =>
    updateSteps((prev) => [...prev, emptyStep(prev.length, type)]);

  const move = (from: number, to: number) =>
    updateSteps((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  // Variable insertion targets the field the customer was last editing and the
  // exact caret/selection it had. The selection is captured on every
  // click/keystroke because opening the Variables menu takes focus away from
  // the field, which otherwise loses the caret.
  type EditorField = "subject" | "body";
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [spintaxTarget, setSpintaxTarget] = useState<{
    stepKey: string; variantIndex: number; field: EditorField;
    start: number; end: number; selectedText: string;
  } | null>(null);
  const restoreSpintaxRef = useRef<(() => void) | null>(null);
  const selectionRef = useRef<{ field: EditorField; start: number; end: number }>({
    field: "body",
    start: 0,
    end: 0,
  });

  const rememberSelection = useCallback((field: EditorField) => {
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    selectionRef.current = { field, start, end };
  }, []);

  const selectionHandlers = (field: EditorField) => ({
    onFocus: () => rememberSelection(field),
    onClick: () => rememberSelection(field),
    onKeyUp: () => rememberSelection(field),
    onSelect: () => rememberSelection(field),
    onMouseUp: () => rememberSelection(field),
  });

  const insertSnippet = (snippet: string, bodyOnly = false) => {
    if (!step) return;
    let sel = selectionRef.current;
    if (bodyOnly && sel.field !== "body") {
      sel = { field: "body", start: editingBody.length, end: editingBody.length };
    }
    const { field } = sel;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const current = field === "subject" ? editingSubject : editingBody;
    const { value: next, caret } = insertAtSelection(current, sel, snippet);
    selectionRef.current = { field, start: caret, end: caret };
    if (field === "subject") setSubject(next);
    else setBody(next);
    // Restore focus and the caret after the controlled value rerenders so the
    // customer can keep typing exactly where the snippet landed.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };
  const insertToken = (token: string) => insertSnippet(variableSnippet(token));

  const openSpintax = () => {
    if (!step) return;
    const selection = { ...selectionRef.current };
    const current = selection.field === "subject" ? editingSubject : editingBody;
    const el = selection.field === "subject" ? subjectRef.current : bodyRef.current;
    restoreSpintaxRef.current = () => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(selection.start, selection.end);
    };
    setSpintaxTarget({ ...selection, stepKey: step.key, variantIndex: activeVariant ? variantIndex : -1,
      selectedText: current.slice(selection.start, selection.end) });
  };

  const insertBuiltSpintax = (syntax: string) => {
    const target = spintaxTarget;
    if (!target) return;
    const targetStep = steps.find((item) => item.key === target.stepKey);
    if (!targetStep) { setSpintaxTarget(null); return; }
    const targetVariant = target.variantIndex >= 0 ? targetStep.variants[target.variantIndex] : null;
    if (target.variantIndex >= 0 && !targetVariant) { setSpintaxTarget(null); return; }
    const current = (targetVariant ?? targetStep)[target.field];
    const { value, caret } = insertAtSelection(current, target, syntax);
    updateSteps((prev) => prev.map((item) => item.key !== target.stepKey ? item : target.variantIndex >= 0
      ? { ...item, variants: item.variants.map((variant, index) => index === target.variantIndex ? { ...variant, [target.field]: value } : variant) }
      : { ...item, [target.field]: value }));
    selectionRef.current = { field: target.field, start: caret, end: caret };
    const el = target.field === "subject" ? subjectRef.current : bodyRef.current;
    restoreSpintaxRef.current = () => { if (el) { el.focus(); el.setSelectionRange(caret, caret); } };
    setSpintaxTarget(null);
    requestAnimationFrame(() => restoreSpintaxRef.current?.());
  };

  const activeVariant = step?.variants[variantIndex];
  const editingSubject = activeVariant ? activeVariant.subject : (step?.subject ?? "");
  const editingBody = activeVariant ? activeVariant.body : (step?.body ?? "");
  const usesAiPersonalization = `${editingSubject} ${editingBody}`.includes(AI_VARIABLE_TOKEN);
  const aiCoverageQuery = useQuery({
    queryKey: ["ai-personalization-coverage", builder.campaignId],
    queryFn: () => fetchAiCoverage({ data: { campaignId: builder.campaignId } }),
    enabled: usesAiPersonalization,
    refetchInterval: usesAiPersonalization ? 15_000 : false,
  });

  const leadRows = useMemo(
    () => leads.map((l) => l.lead).filter(Boolean) as unknown as LeadLike[],
    [leads],
  );
  const variableChecks = useMemo(
    () => {
      const auditOptions: Parameters<typeof auditVariables>[1] = {
        leads: leadRows,
        customVariables,
        customFieldKeys: customFields,
      };
      if (aiCoverageQuery.data) {
        auditOptions.aiPersonalization = {
          total: aiCoverageQuery.data.total,
          personalized: aiCoverageQuery.data.personalized,
        };
      }
      return auditVariables(`${editingSubject} ${editingBody}`, auditOptions);
    },
    [editingSubject, editingBody, leadRows, customVariables, customFields, aiCoverageQuery.data],
  );

  const variableTitle = (check: (typeof variableChecks)[number]) => {
    if (check.token === AI_VARIABLE_TOKEN) {
      if (aiCoverageQuery.isLoading) return "Checking stored AI personalization…";
      if (check.total === 0) return "No campaign leads selected";
      if (check.status === "ok") return `AI personalization ready for all ${check.total} leads`;
      if (check.status === "partial") {
        return `AI personalization missing for ${check.total - check.filled} of ${check.total} leads`;
      }
      return "AI personalization hasn't been generated yet";
    }
    return check.status === "ok"
      ? "Available for every selected lead"
      : check.status === "partial"
        ? `Missing for ${check.total - check.filled} of ${check.total} leads — add a fallback like {{${check.token} | there}}`
        : check.status === "empty"
          ? "Empty for every selected lead"
          : "Not a known lead field or custom variable";
  };

  const variableCopy = (check: (typeof variableChecks)[number]) => {
    if (check.token === AI_VARIABLE_TOKEN) {
      if (aiCoverageQuery.isLoading) return "AI personalization (checking stored personalization)";
      if (check.total === 0) return "AI personalization (no campaign leads)";
      if (check.status === "ok") return "AI personalization ready for all leads";
      if (check.status === "partial") {
        const missing = check.total - check.filled;
        return `AI personalization missing for ${missing} lead${missing === 1 ? "" : "s"}`;
      }
      return "AI personalization hasn't been generated yet";
    }
    return `${check.label}${
      check.status === "partial"
        ? ` (${check.filled}/${check.total} leads)`
        : check.status === "empty"
          ? " (empty for all leads)"
          : check.status === "unknown"
            ? " (unknown variable)"
            : ""
    }`;
  };



  const setSubject = (value: string) => {
    if (!step) return;
    if (activeVariant) {
      patchStep({
        variants: step.variants.map((v, i) => (i === variantIndex ? { ...v, subject: value } : v)),
      });
    } else {
      patchStep({ subject: value });
    }
  };
  const setBody = (value: string) => {
    if (!step) return;
    if (activeVariant) {
      patchStep({
        variants: step.variants.map((v, i) => (i === variantIndex ? { ...v, body: value } : v)),
      });
    } else {
      patchStep({ body: value });
    }
  };

  return (
    <div className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">

      {/* Step rail */}
      <aside className="surface-card h-fit p-3">
        <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sequence
        </p>
        <ol className="space-y-1">
          {steps.map((s, index) => {
            const Icon = STEP_ICONS[s.stepType];
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    setVariantIndex(0);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                    index === activeIndex
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {index + 1}. {s.name || STEP_TYPE_LABELS[s.stepType]}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {STEP_TYPE_LABELS[s.stepType]}
                      {index > 0 ? ` · ${s.waitDays}d ${s.waitHours}h` : ""}
                      {s.variants.length ? ` · ${s.variants.length + 1} variants` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="mt-3 w-full">
              <Plus className="mr-1.5 size-3.5" /> Add step
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Step type</DropdownMenuLabel>
            {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map((type) => (
              <DropdownMenuItem key={type} onSelect={() => addStep(type)}>
                {STEP_TYPE_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>

      {/* Editor */}
      <section className="surface-card min-h-96 p-5">
        {!step ? (
          <p className="text-sm text-muted-foreground">Add a step to start building the sequence.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Step {activeIndex + 1}</Badge>
                <Input
                  aria-label="Step name"
                  className="h-8 w-56"
                  value={step.name}
                  onChange={(e) => patchStep({ name: e.target.value })}
                  placeholder={STEP_TYPE_LABELS[step.stepType]}
                />
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Move step up" onClick={() => move(activeIndex, activeIndex - 1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move step down" onClick={() => move(activeIndex, activeIndex + 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Duplicate step"
                  onClick={() =>
                    updateSteps((prev) => [
                      ...prev.slice(0, activeIndex + 1),
                      { ...step, key: `${step.key}-copy-${Date.now()}`, name: `${step.name} copy` },
                      ...prev.slice(activeIndex + 1),
                    ])
                  }
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete step"
                  disabled={steps.length <= 1}
                  onClick={() => updateSteps((prev) => prev.filter((_, i) => i !== activeIndex))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {step.stepType === "email" ? (
              <>
                {step.variants.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {["A", ...step.variants.map((v) => v.label)].map((label, i) => (
                      <button
                        key={label + i}
                        type="button"
                        onClick={() => setVariantIndex(i - 1)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs",
                          variantIndex === i - 1
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        Variant {label}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAiSidebarOpen(true)}
                    className="text-primary"
                  >
                    <Sparkles className="mr-1.5 size-3.5" /> AI Personalization
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setWriterOpen(true)}
                    className="text-primary"
                  >
                    <BrainCircuit className="mr-1.5 size-3.5" /> AI Campaign Writer
                  </Button>
                  <DropdownMenu>

                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Braces className="mr-1.5 size-3.5" /> Variables
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-auto">
                      {VARIABLE_GROUPS.map((group) => (
                        <div key={group.group}>
                          <DropdownMenuLabel>{group.group}</DropdownMenuLabel>
                          {group.variables.map((v) => (
                            <DropdownMenuItem key={v.token} onSelect={() => insertToken(v.token)}>
                              {v.label}
                              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                {`{{${v.token}}}`}
                              </span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </div>
                      ))}
                      {customVariables.length ? (
                        <>
                          <DropdownMenuLabel>Your variables</DropdownMenuLabel>
                          {customVariables.map((v) => (
                            <DropdownMenuItem key={v.token} onSelect={() => insertToken(v.token)}>
                              {v.label}
                              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                {`{{${v.token}}}`}
                              </span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      {customFields.length ? (
                        <>
                          <DropdownMenuLabel>Custom fields</DropdownMenuLabel>
                          {customFields.map((field) => (
                            <DropdownMenuItem key={field} onSelect={() => insertToken(field)}>
                              {field}
                              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                {`{{${field}}}`}
                              </span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem onSelect={() => setVariableDialogOpen(true)}>
                        <Plus className="mr-1.5 size-3.5" /> Create new variable
                      </DropdownMenuItem>

                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Templates
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-auto">
                      {templateGroups.length === 0 ? (
                        <DropdownMenuLabel>No templates yet</DropdownMenuLabel>
                      ) : null}
                      {templateGroups.map((group) => (
                        <div key={group.category}>
                          <DropdownMenuLabel>{group.category}</DropdownMenuLabel>
                          {group.items.map((tpl) => (
                            <DropdownMenuItem
                              key={tpl.id}
                              onSelect={() => {
                                setSubject(tpl.subject);
                                setBody(tpl.body);
                              }}
                            >
                              {tpl.name}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={openSpintax}
                  >
                    Spintax
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertSnippet("Unsubscribe: {{unsubscribe_link}}", true)}
                  >
                    Unsubscribe
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onPreview(activeIndex)}>
                    <Eye className="mr-1.5 size-3.5" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onTest(activeIndex)}>
                    <Send className="mr-1.5 size-3.5" /> Send test
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="step-subject">Subject</Label>
                  <Input
                    id="step-subject"
                    ref={subjectRef}
                    value={editingSubject}
                    placeholder="Quick question about {{company | your team}}"
                    onChange={(e) => {
                      setSubject(e.target.value);
                      rememberSelection("subject");
                    }}
                    {...selectionHandlers("subject")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="step-body">Body</Label>
                  <Textarea
                    id="step-body"
                    ref={bodyRef}
                    rows={14}
                    className="font-mono text-sm"
                    value={editingBody}
                    placeholder={"Hi {{first_name | there}},\n\n"}
                    onChange={(e) => {
                      setBody(e.target.value);
                      rememberSelection("body");
                    }}
                    {...selectionHandlers("body")}
                  />
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <span>{spintaxVariationCount(editingBody)} spintax variation(s)</span>
                    {variableChecks.length ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {variableChecks.map((check) => (
                          <span
                            key={check.token}
                            className={cn(
                              "inline-flex items-center gap-1",
                              check.status === "ok" && "text-emerald-700 dark:text-emerald-400",
                              check.status === "partial" && "text-amber-700 dark:text-amber-400",
                              (check.status === "empty" || check.status === "unknown") &&
                                "text-destructive",
                            )}
                            title={variableTitle(check)}
                          >
                            {check.status === "ok" ? (
                              <Check className="size-3" />
                            ) : (
                              <AlertTriangle className="size-3" />
                            )}
                            {variableCopy(check)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="ml-3">No variables used yet</span>
                    )}
                  </div>

                </div>
              </>
            ) : step.stepType === "condition" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select
                    value={String(step.config["condition_type"] ?? "replied")}
                    onValueChange={(v) => patchConfig({ condition_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>If true</Label>
                    <Select
                      value={String(step.config["on_true"] ?? "stop")}
                      onValueChange={(v) => patchConfig({ on_true: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stop">Stop the sequence</SelectItem>
                        <SelectItem value="continue">Continue to next step</SelectItem>
                        <SelectItem value="skip">Skip the next step</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>If false</Label>
                    <Select
                      value={String(step.config["on_false"] ?? "continue")}
                      onValueChange={(v) => patchConfig({ on_false: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="continue">Continue to next step</SelectItem>
                        <SelectItem value="stop">Stop the sequence</SelectItem>
                        <SelectItem value="skip">Skip the next step</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ) : step.stepType === "webhook" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="hook-url">Webhook URL</Label>
                  <Input
                    id="hook-url"
                    value={String(step.config["url"] ?? "")}
                    placeholder="https://example.com/hooks/munchreach"
                    onChange={(e) => patchConfig({ url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select
                    value={String(step.config["method"] ?? "POST")}
                    onValueChange={(v) => patchConfig({ method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["POST", "PUT", "PATCH"].map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hook-payload">Payload</Label>
                  <Textarea
                    id="hook-payload"
                    rows={8}
                    className="font-mono text-xs"
                    value={String(step.config["payload"] ?? '{\n  "email": "{{email}}"\n}')}
                    onChange={(e) => patchConfig({ payload: e.target.value })}
                  />
                </div>
              </div>
            ) : step.stepType === "crm" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CRM action</Label>
                  <Select
                    value={String(step.config["crm_action"] ?? "set_stage")}
                    onValueChange={(v) => patchConfig({ crm_action: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="set_stage">Change stage</SelectItem>
                      <SelectItem value="add_tag">Add tag</SelectItem>
                      <SelectItem value="remove_tag">Remove tag</SelectItem>
                      <SelectItem value="assign_owner">Assign owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crm-value">Value</Label>
                  <Input
                    id="crm-value"
                    value={String(step.config["value"] ?? "")}
                    placeholder="Interested"
                    onChange={(e) => patchConfig({ value: e.target.value })}
                  />
                </div>
              </div>
            ) : step.stepType === "task" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-title">Task</Label>
                  <Input
                    id="task-title"
                    value={String(step.config["title"] ?? "")}
                    placeholder="Call the prospect"
                    onChange={(e) => patchConfig({ title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-due">Due in (business days)</Label>
                  <Input
                    id="task-due"
                    type="number"
                    min={0}
                    max={30}
                    value={Number(step.config["due_days"] ?? 1)}
                    onChange={(e) => patchConfig({ due_days: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {STEP_TYPE_LABELS[step.stepType]} step — configure the delay on the right.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Step settings */}
      <aside className="surface-card h-fit space-y-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step settings
        </p>
        {step ? (
          <>
            {activeIndex > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs">Wait before this step</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    aria-label="Wait days"
                    type="number"
                    min={0}
                    max={90}
                    value={step.waitDays}
                    onChange={(e) => patchStep({ waitDays: Number(e.target.value) || 0 })}
                  />
                  <Input
                    aria-label="Wait hours"
                    type="number"
                    min={0}
                    max={23}
                    value={step.waitHours}
                    onChange={(e) => patchStep({ waitHours: Number(e.target.value) || 0 })}
                  />
                  <Input
                    aria-label="Wait minutes"
                    type="number"
                    min={0}
                    max={59}
                    value={step.delayMinutes}
                    onChange={(e) => patchStep({ delayMinutes: Number(e.target.value) || 0 })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">days · hours · minutes</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The first step sends as soon as the campaign window opens.
              </p>
            )}

            {step.stepType === "email" && activeIndex > 0 ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Same thread</p>
                  <p className="text-xs text-muted-foreground">Reply to the previous email</p>
                </div>
                <Switch
                  checked={step.sameThread}
                  onCheckedChange={(v) => patchStep({ sameThread: v })}
                />
              </div>
            ) : null}

            {step.stepType === "email" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">A/B variants</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patchStep({
                        variants: [
                          ...step.variants,
                          {
                            label: String.fromCharCode(66 + step.variants.length),
                            subject: step.subject,
                            body: step.body,
                            weight: Math.floor(100 / (step.variants.length + 2)),
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="mr-1 size-3.5" /> Add
                  </Button>
                </div>
                {step.variants.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Only variant A is in use. Add a variant to split-test subject or body.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {step.variants.map((v, i) => (
                      <li key={v.label} className="flex items-center gap-2">
                        <Badge variant="outline">{v.label}</Badge>
                        <Input
                          aria-label={`Variant ${v.label} weight`}
                          type="number"
                          min={0}
                          max={100}
                          className="h-8 w-20"
                          value={v.weight}
                          onChange={(e) =>
                            patchStep({
                              variants: step.variants.map((item, index) =>
                                index === i
                                  ? { ...item, weight: Number(e.target.value) || 0 }
                                  : item,
                              ),
                            })
                          }
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove variant ${v.label}`}
                          onClick={() => {
                            setVariantIndex(-1);
                            patchStep({
                              variants: step.variants.filter((_, index) => index !== i),
                            });
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </aside>

      <Dialog open={variableDialogOpen} onOpenChange={setVariableDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a variable</DialogTitle>
            <DialogDescription>
              Use it anywhere in your emails as a token. If a lead has no value for it, the default
              text is used instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="var-label">Name</Label>
              <Input
                id="var-label"
                value={newVarLabel}
                placeholder="Pain point"
                onChange={(e) => {
                  setNewVarLabel(e.target.value);
                  if (!tokenEdited) setNewVarToken(normalizeVariableToken(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-token">Token</Label>
              <Input
                id="var-token"
                value={newVarToken}
                placeholder="pain_point"
                onChange={(e) => {
                  setTokenEdited(true);
                  setNewVarToken(normalizeVariableToken(e.target.value));
                }}
              />
              <p className="text-xs text-muted-foreground">
                Inserted as {`{{${newVarToken || "token"}}}`}. Values come from the matching lead
                custom field when it exists.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="var-default">Default value</Label>
              <Input
                id="var-default"
                value={newVarDefault}
                placeholder="your outbound process"
                onChange={(e) => setNewVarDefault(e.target.value)}
              />
            </div>

            {customVariables.length ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Your variables</p>
                <ul className="space-y-1.5">
                  {customVariables.map((v) => (
                    <li
                      key={v.token}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {v.label}
                        <span className="ml-2 text-xs text-muted-foreground">{`{{${v.token}}}`}</span>
                        {v.defaultValue ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            default: {v.defaultValue}
                          </span>
                        ) : null}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete variable ${v.label}`}
                        onClick={() => removeVariable(v.token)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariableDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createVariable} disabled={!normalizeVariableToken(newVarToken || newVarLabel)}>
              Add &amp; insert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {spintaxTarget && <SpintaxBuilder open initialText={spintaxTarget.selectedText}
        onClose={() => setSpintaxTarget(null)} onInsert={insertBuiltSpintax}
        onRestoreCursor={() => restoreSpintaxRef.current?.()} />}
    </div>

    {/* AI personalization lives with the copy it rewrites, not in a separate tab. */}
    <AiPersonalizationSidebar
      builder={builder}
      open={aiSidebarOpen}
      onOpenChange={setAiSidebarOpen}
    />
    {/* The writer builds the campaign; personalization above tailors it per lead. */}
    <AiCampaignWriterSidebar
      builder={builder}
      open={writerOpen}
      onOpenChange={setWriterOpen}
    />
    </div>
  );

}
