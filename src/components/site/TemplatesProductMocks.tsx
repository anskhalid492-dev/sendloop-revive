import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Eye,
  Filter,
  ListOrdered,
  Search,
  Sparkles,
  Star,
  Users,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AppWindow, Pill } from "@/components/site/CampaignsProductMocks";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Control({ children, icon: Icon }: { children: ReactNode; icon?: typeof Search }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

function GhostButton({ children, icon: Icon }: { children: ReactNode; icon?: typeof Eye }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] font-medium">
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </span>
  );
}

function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground">
      {children}
    </span>
  );
}

/** Renders copy with `{{variable}}` tokens highlighted. */
export function VariableText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{\{[a-z_]+\}\})/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        /^\{\{[a-z_]+\}\}$/.test(part) ? (
          <span
            key={`${part}-${i}`}
            className="rounded bg-primary/12 px-1 py-0.5 font-medium text-primary"
          >
            {part}
          </span>
        ) : (
          <span key={`t-${i}`}>{part}</span>
        ),
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 1 + 3. Template library                                             */
/* ------------------------------------------------------------------ */

const CATEGORY_FILTERS = [
  "All",
  "Cold Outreach",
  "Follow-Ups",
  "SaaS",
  "Agencies",
  "Sales",
  "Recruiting",
  "Lead Generation",
  "Partnership",
  "Breakup",
  "Referral",
];

const LIBRARY = [
  {
    name: "SaaS trial expiring",
    category: "SaaS",
    description: "Opener for accounts whose trial is about to end.",
    steps: 3,
    source: "Official",
    featured: true,
  },
  {
    name: "Agency case study drop",
    category: "Agencies",
    description: "Lead with a comparable client result, then ask for 15 minutes.",
    steps: 3,
    source: "Official",
    featured: true,
  },
  {
    name: "Passive candidate opener",
    category: "Recruiting",
    description: "Short role intro for people who are not actively looking.",
    steps: 2,
    source: "Official",
  },
  {
    name: "Cold intro — founder to founder",
    category: "Cold Outreach",
    description: "First touch that names the problem before the product.",
    steps: 4,
    source: "Workspace",
  },
  {
    name: "Partnership intro",
    category: "Partnership",
    description: "Propose a shared-audience collaboration in three lines.",
    steps: 2,
    source: "Workspace",
  },
  {
    name: "Breakup email v2",
    category: "Breakup",
    description: "Last touch that closes the loop and leaves the door open.",
    steps: 1,
    source: "Workspace",
  },
];

export function TemplateLibraryMock() {
  return (
    <AppWindow title="MunchReach — Templates" breadcrumb="Templates / Library">
      <div className="border-b border-border/70 bg-secondary/25 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground">
            <Search className="size-3.5" />
            Search name, subject or body
          </span>
          <Control icon={Filter}>Category</Control>
          <Control icon={Star}>Featured</Control>
          <Control icon={Users}>Workspace</Control>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((c) => (
            <span
              key={c}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                c === "All"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/70 bg-background text-muted-foreground",
              )}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {LIBRARY.map((t) => (
          <div
            key={t.name}
            className="flex min-w-0 flex-col rounded-xl border border-border/70 bg-background p-3.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Pill tone="muted">{t.category}</Pill>
                  <Pill tone={t.source === "Official" ? "primary" : "ok"}>{t.source}</Pill>
                </div>
              </div>
              {t.featured ? <Star className="size-3.5 shrink-0 fill-primary text-primary" /> : null}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {t.description}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ListOrdered className="size-3.5" />
              {t.steps} {t.steps === 1 ? "step" : "steps"}
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
              <GhostButton icon={Eye}>Preview</GhostButton>
              <PrimaryButton>Use template</PrimaryButton>
            </div>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Template detail / sequence preview                               */
/* ------------------------------------------------------------------ */

const SEQUENCE = [
  {
    step: "Step 1",
    kind: "Initial email",
    timing: "Sends on day 0",
    subject: "{{first_name}}, quick question about {{company}}",
    body: [
      "Hi {{first_name}} — saw {{company}} is hiring across the {{job_title}} side.",
      "{{ai_personalization}}",
      "We help teams like yours run outbound without a bigger SDR bench.",
    ],
    cta: "Worth a 15-minute look next week?",
    variables: ["{{first_name}}", "{{company}}", "{{job_title}}", "{{ai_personalization}}"],
  },
  {
    step: "Step 2",
    kind: "Follow-up",
    timing: "3 days after step 1, if no reply",
    subject: "Re: {{first_name}}, quick question about {{company}}",
    body: [
      "Following up on the note above, {{first_name}}.",
      "Happy to send a short example built around {{company}} instead of a demo.",
    ],
    cta: "Want me to send it over?",
    variables: ["{{first_name}}", "{{company}}"],
  },
  {
    step: "Step 3",
    kind: "Follow-up",
    timing: "5 days after step 2, if no reply",
    subject: "Closing the loop, {{first_name}}",
    body: [
      "I'll stop here so I'm not crowding your inbox.",
      "If outbound moves up the list at {{company}} later this quarter, reply and I'll pick it back up.",
    ],
    cta: "Reply anytime and I'll pick it back up.",
    variables: ["{{first_name}}", "{{company}}"],
  },
];

export function TemplateDetailMock() {
  return (
    <AppWindow
      title="MunchReach — Template preview"
      breadcrumb="Templates / SaaS trial expiring"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-secondary/25 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">SaaS trial expiring</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill tone="muted">SaaS</Pill>
            <Pill tone="primary">Official</Pill>
            <Pill tone="muted">3 steps</Pill>
          </div>
        </div>
        <GhostButton icon={Eye}>Preview as recipient</GhostButton>
        <PrimaryButton>Use template</PrimaryButton>
      </div>
      <div className="space-y-3 p-4">
        {SEQUENCE.map((s) => (
          <div key={s.step} className="min-w-0 rounded-xl border border-border/70 bg-background">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3.5 py-2.5">
              <span className="flex size-6 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-semibold text-primary">
                {s.step.replace("Step ", "")}
              </span>
              <span className="text-xs font-semibold">{s.kind}</span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {s.timing}
              </span>
            </div>
            <div className="space-y-2.5 px-3.5 py-3">
              <div className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Subject: </span>
                <VariableText text={s.subject} />
              </div>
              <div className="space-y-1.5 rounded-lg bg-secondary/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {s.body.map((line) => (
                  <p key={line}>
                    <VariableText text={line} />
                  </p>
                ))}
                <p className="pt-1 font-medium text-foreground">{s.cta}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Variables</span>
                {s.variables.map((v) => (
                  <span
                    key={v}
                    className="rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 5 + 10. Flow rails                                                  */
/* ------------------------------------------------------------------ */

export function FlowRail({
  steps,
  tone = "primary",
}: {
  steps: string[];
  tone?: "primary" | "muted";
}) {
  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-stretch gap-2">
          <div
            className={cn(
              "flex w-[150px] flex-col justify-center rounded-xl border px-3 py-3 text-center",
              tone === "primary"
                ? "border-primary/25 bg-primary/5"
                : "border-border/70 bg-muted/40",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-semibold",
                tone === "primary" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mt-1 text-xs font-medium">{s}</span>
          </div>
          {i < steps.length - 1 ? (
            <span className="flex items-center text-muted-foreground">
              <ArrowRight className="size-4" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const WORKFLOW = [
  { title: "Choose template", text: "Pick a structure from the library." },
  { title: "Review sequence", text: "Read every step before using it." },
  { title: "Customize copy", text: "Rewrite subjects and bodies." },
  { title: "Add leads", text: "Pull in a list or a saved segment." },
  { title: "Select sending accounts", text: "Choose the mailboxes that send." },
  { title: "Schedule campaign", text: "Set sending days, window and timezone." },
  { title: "Launch", text: "Start the sequence." },
];

export function TemplateToCampaignFlow() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {WORKFLOW.map((s, i) => (
        <div
          key={s.title}
          className={cn(
            "min-w-0 rounded-2xl border p-5",
            i === WORKFLOW.length - 1
              ? "border-primary/30 bg-primary/5"
              : "border-border/70 bg-card",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-semibold text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-sm font-semibold">{s.title}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Variables and personalization                                    */
/* ------------------------------------------------------------------ */

const VARIABLE_ROWS = [
  { token: "{{first_name}}", source: "Lead field", example: "Marcus" },
  { token: "{{company}}", source: "Lead field", example: "Fieldstack Robotics" },
  { token: "{{job_title}}", source: "Lead field", example: "Head of Sales" },
  { token: "{{ai_personalization}}", source: "Generated per lead", example: "One-line opener" },
];

export function VariablesMock() {
  return (
    <AppWindow title="MunchReach — Step 1 editor" breadcrumb="Campaign / Sequence / Step 1">
      <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 border-b border-border/70 p-4 lg:border-r lg:border-b-0">
          <div className="rounded-xl border border-border/70 bg-background">
            <div className="border-b border-border/60 px-3.5 py-2.5 text-[11px]">
              <span className="text-muted-foreground">Subject </span>
              <VariableText text="{{first_name}}, quick question about {{company}}" />
            </div>
            <div className="space-y-2 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <VariableText text="Hi {{first_name}} —" />
              </p>
              <p>
                <VariableText text="{{ai_personalization}}" />
              </p>
              <p>
                <VariableText text="Most {{job_title}} teams we work with run outbound with two people, not ten. Curious whether that's the shape at {{company}} too." />
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Control icon={Sparkles}>Insert variable</Control>
            <Control icon={Wand2}>AI personalization</Control>
            <Control icon={Eye}>Preview with a lead</Control>
          </div>
        </div>
        <div className="min-w-0 p-4">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Variables in this step
          </div>
          <div className="mt-3 space-y-2">
            {VARIABLE_ROWS.map((v) => (
              <div
                key={v.token}
                className="rounded-lg border border-border/70 bg-background px-3 py-2"
              >
                <div className="text-[11px] font-medium text-primary">{v.token}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{v.source}</span>
                  <span className="truncate">{v.example}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            The template supplies the structure. Variables and AI personalization fill in the parts
            that change per lead.
          </p>
        </div>
      </div>
    </AppWindow>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Template → campaign builder handoff                              */
/* ------------------------------------------------------------------ */

const HANDOFF = [
  {
    label: "Template selected",
    detail: "SaaS trial expiring · 3 steps",
    state: "Library",
  },
  {
    label: "Campaign builder opens",
    detail: "New campaign draft created",
    state: "Draft",
  },
  {
    label: "Sequence imported",
    detail: "Step 1, Step 2 and Step 3 with timing",
    state: "Imported",
  },
  {
    label: "You edit the steps",
    detail: "Rewrite copy, change delays, add or remove steps",
    state: "Editing",
  },
  {
    label: "Campaign launches",
    detail: "Leads, mailboxes and schedule applied",
    state: "Active",
  },
];

export function TemplateToBuilderMock() {
  return (
    <AppWindow title="MunchReach — Template to campaign" breadcrumb="Templates → Campaign builder">
      <div className="grid gap-0 lg:grid-cols-[1fr_1.3fr]">
        <div className="min-w-0 space-y-2 border-b border-border/70 p-4 lg:border-r lg:border-b-0">
          {HANDOFF.map((h, i) => (
            <div key={h.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                {i < HANDOFF.length - 1 ? (
                  <span className="my-1 w-px flex-1 bg-border" />
                ) : null}
              </div>
              <div className="min-w-0 pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">{h.label}</span>
                  <Pill tone={i === HANDOFF.length - 1 ? "ok" : "muted"}>{h.state}</Pill>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{h.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0 p-4">
          <div className="rounded-xl border border-border/70 bg-background">
            <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
              <span className="text-xs font-semibold">Sequence — imported from template</span>
              <Pill tone="primary">Editable</Pill>
            </div>
            <div className="divide-y divide-border/60">
              {[
                { s: "Step 1", t: "Initial email", d: "Day 0", edited: "Subject edited" },
                { s: "Step 2", t: "Follow-up", d: "+3 days", edited: "Delay changed to 2 days" },
                { s: "Step 3", t: "Follow-up", d: "+5 days", edited: "Body rewritten" },
              ].map((r) => (
                <div key={r.s} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                  <span className="text-[11px] font-medium">{r.s}</span>
                  <span className="text-[11px] text-muted-foreground">{r.t}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{r.d}</span>
                  <Pill tone="muted">{r.edited}</Pill>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-3.5 py-3">
              <GhostButton icon={Eye}>Preview sequence</GhostButton>
              <PrimaryButton>Launch campaign</PrimaryButton>
            </div>
          </div>
          <p className="mt-3 inline-flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            Nothing is locked. Once the sequence is imported it belongs to the campaign — editing it
            never changes the saved template.
          </p>
        </div>
      </div>
    </AppWindow>
  );
}
