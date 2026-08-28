import type { ReactNode } from "react";
import { ArrowRight, Check, Sparkles, Wand2 } from "lucide-react";

import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/30 px-3 py-2">
        <span className="truncate text-xs font-medium">{value}</span>
        <span className="text-[10px] text-muted-foreground">▾</span>
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Chip({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/70 bg-secondary/30 text-muted-foreground",
      )}
    >
      {on ? <Check className="size-3" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Main product screen                                                 */
/* ------------------------------------------------------------------ */

export function AiPersonalizationScreen() {
  return (
    <AppWindow
      title="AI Personalization — Q4 Outbound · SaaS Founders"
      breadcrumb="Campaign builder / Sequence / AI Personalization"
    >
      <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* Controls */}
        <div className="min-w-0 space-y-5 border-b border-border/70 p-5 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2.5">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <Sparkles className="size-4 text-primary" /> AI personalization
            </span>
            <span className="flex h-5 w-9 items-center rounded-full bg-primary/70 p-0.5">
              <span className="ml-auto size-4 rounded-full bg-background" />
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Writing framework" value="Problem → Solution" />
            <Field label="Tone" value="Conversational" />
            <Field label="Length" value="One sentence" />
            <Field label="Language" value="English" />
          </div>

          <div>
            <Label>Lead data the AI may use</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip on>First name</Chip>
              <Chip on>Job title</Chip>
              <Chip on>Company</Chip>
              <Chip on>Website</Chip>
              <Chip on>Industry</Chip>
              <Chip>Lead notes</Chip>
              <Chip>Custom fields</Chip>
            </div>
          </div>

          <div>
            <Label>Personalization instructions</Label>
            <div className="mt-1.5 rounded-lg border border-border/70 bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
              Write one short opening sentence about how this company likely handles outbound
              today. Use only the data provided. No compliments, no invented facts.
            </div>
          </div>

          <div>
            <Label>If personalization is unavailable</Label>
            <div className="mt-1.5 space-y-2">
              <div className="rounded-lg border border-primary/30 bg-primary/[0.06] px-3 py-2 text-xs">
                <span className="font-medium">Use fallback text</span>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  “I came across your team and wanted to reach out.”
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div className="rounded-lg border border-border/70 px-3 py-2">
                  Skip personalization
                </div>
                <div className="rounded-lg border border-border/70 px-3 py-2">Do not send</div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview + coverage */}
        <div className="min-w-0 space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="primary">Preview</Pill>
            <span className="text-xs text-muted-foreground">
              Sample lead: Marcus Lee · Head of Growth, Northwind
            </span>
          </div>

          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <Label>Generated personalization</Label>
            <p className="mt-2 text-sm leading-relaxed">
              “Running growth at Northwind, I imagine outbound is still spread across a few
              mailboxes and a spreadsheet.”
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill tone="ok">Completed</Pill>
              <Pill tone="muted">Used: job title, company, industry</Pill>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <Label>Email preview</Label>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Hi Marcus,
              <br />
              <span className="rounded bg-primary/10 px-1 text-foreground">
                Running growth at Northwind, I imagine outbound is still spread across a few
                mailboxes and a spreadsheet.
              </span>
              <br />
              We help teams run it from one place — worth a quick look?
            </p>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Coverage</span>
              <span className="text-muted-foreground">842 / 1,000 leads</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-[84%] rounded-full bg-primary" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <Stat label="Completed" value="781" />
              <Stat label="Limited data" value="61" />
              <Stat label="Queued" value="140" />
              <Stat label="Failed" value="18" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              <Wand2 className="size-3.5" /> Generate for remaining leads
            </span>
            <span className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
              Retry failed
            </span>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 px-2.5 py-2">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tone comparison                                                     */
/* ------------------------------------------------------------------ */

export function ToneMatrix({
  items,
}: {
  items: { tone: string; trait: string; example: string }[];
}) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.tone} className="min-w-0 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{item.tone}</h3>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {item.trait}
            </span>
          </div>
          <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground italic">
            “{item.example}”
          </p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Real example transformation                                         */
/* ------------------------------------------------------------------ */

export function TransformationFlow() {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-3">
      <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <Label>1 · Lead record</Label>
        <dl className="mt-3 space-y-2 text-xs">
          {[
            ["Name", "Priya Raman"],
            ["Title", "Founder"],
            ["Company", "Loomtide"],
            ["Industry", "B2B logistics software"],
            ["Website", "loomtide.io"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="min-w-0 rounded-2xl border border-primary/30 bg-primary/[0.05] p-5">
        <Label>2 · AI reads the allowed fields</Label>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Only the fields you enabled are sent. The model works from those facts alone — it does
          not browse, guess headcount, or invent a funding round.
        </p>
        <div className="mt-4 rounded-lg border border-border/70 bg-card p-3">
          <Label>Generated</Label>
          <p className="mt-1.5 text-sm leading-relaxed">
            “Founder-led logistics software usually means outbound sits with you before it sits
            with a sales team.”
          </p>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-border bg-card p-5">
        <Label>3 · Inserted at send time</Label>
        <p className="mt-3 rounded-lg bg-secondary/40 px-2 py-1 font-mono text-[11px]">
          Hi {"{{first_name}}"}, {"{{ai_personalization}}"}
        </p>
        <ArrowRight className="my-3 size-4 text-primary" />
        <div className="rounded-lg border border-border/70 p-3 text-xs leading-relaxed">
          Hi Priya,
          <br />
          Founder-led logistics software usually means outbound sits with you before it sits with
          a sales team.
          <br />
          <br />
          Worth 15 minutes to see how other founders hand it off?
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk generation panel                                               */
/* ------------------------------------------------------------------ */

export function BulkRunMock() {
  const rows = [
    { lead: "marcus@northwind.io", state: "Completed", tone: "ok" as const, note: "job title, company" },
    { lead: "priya@loomtide.io", state: "Completed", tone: "ok" as const, note: "industry, website" },
    { lead: "sam@bluepath.co", state: "Limited data", tone: "warn" as const, note: "company only" },
    { lead: "dana@arcform.dev", state: "Queued", tone: "muted" as const, note: "waiting in batch" },
    { lead: "kai@northline.app", state: "Failed", tone: "danger" as const, note: "will retry" },
  ];
  return (
    <AppWindow title="Generation run — 1,000 leads" breadcrumb="Batched · retries enabled">
      <div className="p-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">Progress</span>
          <span className="text-muted-foreground">860 processed · 140 remaining</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[86%] rounded-full bg-primary" />
        </div>
        <div className="mt-4 divide-y divide-border/60 rounded-xl border border-border/70">
          {rows.map((r) => (
            <div key={r.lead} className="flex items-center gap-3 px-3 py-2.5 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{r.lead}</span>
              <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {r.note}
              </span>
              <Pill tone={r.tone}>{r.state}</Pill>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Leads that already have personalization are skipped, so re-running only fills the gaps.
        </p>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Builder integration                                                 */
/* ------------------------------------------------------------------ */

export function BuilderIntegrationMock() {
  return (
    <AppWindow title="Sequence editor — Step 1" breadcrumb="Campaign builder">
      <div className="grid min-w-0 gap-0 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-3 p-5">
          <div className="rounded-lg border border-border/70 px-3 py-2 text-xs">
            Subject: Quick question about {"{{company}}"}
          </div>
          <div className="min-h-[150px] rounded-lg border border-border/70 p-3 text-xs leading-relaxed">
            Hi {"{{first_name}}"},
            <br />
            <span className="rounded bg-primary/12 px-1 font-mono text-[11px] text-primary">
              {"{{ai_personalization}}"}
            </span>
            <br />
            <br />
            We help outbound teams run every mailbox, reply and follow-up from one workspace.
            <br />
            Open to a look?
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="muted">{"{{first_name}}"}</Pill>
            <Pill tone="muted">{"{{company}}"}</Pill>
            <Pill tone="primary">{"{{ai_personalization}}"}</Pill>
          </div>
        </div>
        <div className="min-w-0 space-y-3 border-t border-border/70 bg-secondary/20 p-4 md:border-t-0 md:border-l">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles className="size-3.5 text-primary" /> AI panel
          </span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Opens beside the editor. Configure framework, tone, length, language, fields,
            instructions and fallback, then generate without leaving the step.
          </p>
          <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-[11px]">
            Coverage 842 / 1,000
          </div>
          <span className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground">
            Generate
          </span>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* Shared: numbered steps + detail panel                               */
/* ------------------------------------------------------------------ */

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
