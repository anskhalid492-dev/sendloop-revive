import type { ReactNode } from "react";
import { ArrowDown, Clock, Filter, Play, Zap } from "lucide-react";

import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";
import { cn } from "@/lib/utils";

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Automation builder screen                                           */
/* ------------------------------------------------------------------ */

export function AutomationBuilderMock() {
  return (
    <AppWindow
      title="Automation — Positive reply routing"
      breadcrumb="Automations / Builder"
    >
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-4 border-b border-border/70 p-5 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Label>Automation name</Label>
              <p className="truncate text-sm font-semibold">Positive reply routing</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" /> Active
            </span>
          </div>

          <StepCard kind="When" icon={Zap} title="Positive reply detected" meta="Source: Unified Inbox">
            Only for campaign: Q4 Outbound — SaaS Founders
          </StepCard>
          <Connector />
          <StepCard kind="If" icon={Filter} title="Lead status is not Customer" meta="Condition">
            Field: lead.status · Operator: is not · Value: customer
          </StepCard>
          <Connector />
          <StepCard kind="Then" icon={Play} title="Stop campaign follow-ups" meta="Action" />
          <Connector />
          <StepCard kind="Then" icon={Play} title="Add tag “interested”" meta="Action" />
          <Connector />
          <StepCard kind="Then" icon={Play} title="Assign owner — Sarah K." meta="Action" />
          <Connector />
          <StepCard kind="Wait" icon={Clock} title="Wait until business hours" meta="Flow" />
          <Connector />
          <StepCard kind="Then" icon={Play} title="Create task — “Follow up on reply”" meta="Due in 1 day" />

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save automation
            </span>
            <span className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
              Run test
            </span>
            <span className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
              Pause
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-4 p-5">
          <Label>Execution history</Label>
          <div className="divide-y divide-border/60 rounded-xl border border-border/70">
            {[
              { lead: "marcus@northwind.io", state: "Completed", tone: "ok" as const, when: "2m ago" },
              { lead: "priya@loomtide.io", state: "Completed", tone: "ok" as const, when: "18m ago" },
              { lead: "sam@bluepath.co", state: "Waiting", tone: "muted" as const, when: "resumes 09:00" },
              { lead: "dana@arcform.dev", state: "Skipped", tone: "warn" as const, when: "condition false" },
              { lead: "kai@northline.app", state: "Failed", tone: "danger" as const, when: "retry queued" },
            ].map((r) => (
              <div key={r.lead} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{r.lead}</span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">{r.when}</span>
                <Pill tone={r.tone}>{r.state}</Pill>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4 text-[11px] leading-relaxed text-muted-foreground">
            Every run records the trigger event, which branch it followed, each step's result and
            any error — so you can see exactly why an automation did or did not act.
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowDown className="size-4 text-muted-foreground/60" />
    </div>
  );
}

function StepCard({
  kind,
  icon: Icon,
  title,
  meta,
  children,
}: {
  kind: string;
  icon: typeof Zap;
  title: string;
  meta?: string;
  children?: ReactNode;
}) {
  const accent =
    kind === "When"
      ? "border-primary/40 bg-primary/[0.06]"
      : kind === "If"
        ? "border-amber-500/30 bg-amber-500/[0.06]"
        : kind === "Wait"
          ? "border-border/70 bg-secondary/30"
          : "border-emerald-500/25 bg-emerald-500/[0.05]";
  return (
    <div className={cn("min-w-0 rounded-xl border p-3.5", accent)}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-background/70">
          <Icon className="size-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {kind}
        </span>
        {meta ? (
          <span className="ml-auto truncate text-[10px] text-muted-foreground">{meta}</span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{title}</p>
      {children ? <p className="mt-1 text-[11px] text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* WHEN / IF / THEN walkthrough                                        */
/* ------------------------------------------------------------------ */

export function WhenIfThen() {
  const blocks = [
    {
      tag: "WHEN",
      title: "Pick the event",
      text: "Choose from real product events — a lead is added, an email is sent, delivered or bounced, a reply lands, a status changes, a meeting is booked.",
      example: "Lead replied",
    },
    {
      tag: "IF",
      title: "Narrow it down",
      text: "Conditions read live lead, campaign and engagement fields with plain operators like is, is not, contains and is empty.",
      example: "Reply is positive",
    },
    {
      tag: "THEN",
      title: "Do the work",
      text: "Pick actions from a list. No code, no scripting — each action names exactly what it changes.",
      example: "Assign owner + create task",
    },
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {blocks.map((b, i) => (
        <div key={b.tag}>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-lg bg-primary/12 px-2.5 py-1 text-xs font-bold tracking-[0.18em] text-primary">
                {b.tag}
              </span>
              <h3 className="text-base font-semibold">{b.title}</h3>
              <span className="ml-auto rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                {b.example}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{b.text}</p>
          </div>
          {i < blocks.length - 1 ? <Connector /> : null}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow examples                                                   */
/* ------------------------------------------------------------------ */

export function WorkflowCards({
  items,
}: {
  items: { label: string; title: string; steps: string[]; note: string }[];
}) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      {items.map((w) => (
        <div key={w.title} className="min-w-0 rounded-2xl border border-border bg-card p-6">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {w.label}
          </span>
          <h3 className="mt-2 text-lg font-bold tracking-tight">{w.title}</h3>
          <ol className="mt-4 space-y-2">
            {w.steps.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            {w.note}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trigger / action catalogues                                         */
/* ------------------------------------------------------------------ */

export function CatalogGrid({
  items,
}: {
  items: { title: string; group: string; text: string }[];
}) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <div key={t.title} className="min-w-0 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold">{t.title}</h3>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
              {t.group}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

export function DetailList({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="grid min-w-0 gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((d) => (
        <div key={d.title} className="min-w-0 border-l-2 border-primary/30 pl-4">
          <h3 className="text-sm font-semibold">{d.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
        </div>
      ))}
    </div>
  );
}

export function NumberedSteps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <div key={s.title} className="min-w-0 rounded-2xl border border-border bg-card p-5">
          <span className="text-xs font-bold tracking-[0.18em] text-primary">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}
