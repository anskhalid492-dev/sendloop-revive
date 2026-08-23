import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Flame,
  Inbox,
  Mail,
  Sparkles,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Lightweight, design-system-accurate previews of real MunchReach product
 * surfaces (campaign builder, leads table, unified inbox, warmup, analytics,
 * CRM, templates, automations, API docs).
 *
 * They render with the same tokens the application uses, stay crisp on every
 * screen size and add no image weight to the marketing page.
 */

export function AppFrame({
  title,
  path,
  children,
  className,
}: {
  title: string;
  path?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_30px_80px_-60px_hsl(var(--primary)/0.55)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/70 bg-secondary/50 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-primary/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-3 truncate text-[11px] font-medium text-muted-foreground">
          {title}
          {path ? <span className="ml-2 text-muted-foreground/70">{path}</span> : null}
        </span>
      </div>
      <div className="bg-card p-3 sm:p-4">{children}</div>
    </div>
  );
}

function Pill({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "muted" | "warn" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        tone === "primary" && "bg-primary/12 text-primary",
        tone === "muted" && "bg-secondary text-muted-foreground",
        tone === "warn" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ campaigns */

export function CampaignMock() {
  const steps = [
    { name: "Step 1 · Intro email", wait: "Day 0", status: "Sent" },
    { name: "Step 2 · Follow-up", wait: "Wait 3 days", status: "Scheduled" },
    { name: "Step 3 · Value nudge", wait: "Wait 4 days", status: "Queued" },
    { name: "Step 4 · Break-up", wait: "Wait 5 days", status: "Queued" },
  ];
  return (
    <AppFrame title="Campaigns" path="/campaigns/q3-outbound">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="text-sm font-semibold">Q3 Outbound — SaaS founders</div>
        <div className="flex items-center gap-2">
          <Pill>Active</Pill>
          <Pill tone="muted">4 steps</Pill>
        </div>
      </div>
      <div className="space-y-2">
        {steps.map((s) => (
          <Row key={s.name}>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{s.name}</div>
              <div className="text-[11px] text-muted-foreground">{s.wait}</div>
            </div>
            <Pill tone={s.status === "Sent" ? "primary" : "muted"}>{s.status}</Pill>
          </Row>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "Sequence", v: "Multi-step" },
          { k: "Schedule", v: "Mon–Fri" },
          { k: "Senders", v: "3 mailboxes" },
        ].map((c) => (
          <div key={c.k} className="rounded-xl border border-border/70 bg-background p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.k}</div>
            <div className="mt-0.5 text-xs font-semibold">{c.v}</div>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

/* ---------------------------------------------------------------- leads */

export function LeadsMock() {
  const leads = [
    { n: "Amelia Fox", c: "Northwind", s: "Contacted" },
    { n: "Daniel Reyes", c: "Loop Labs", s: "Replied" },
    { n: "Priya Nair", c: "Cadence", s: "Interested" },
    { n: "Tom Becker", c: "Stackhouse", s: "New" },
  ];
  return (
    <AppFrame title="Leads" path="/leads">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Pill>All leads</Pill>
          <Pill tone="muted">List: SaaS founders</Pill>
        </div>
        <Pill tone="muted">Bulk actions</Pill>
      </div>
      <div className="space-y-2">
        {leads.map((l) => (
          <Row key={l.n}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="size-4 shrink-0 rounded border border-border bg-secondary" />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{l.n}</div>
                <div className="truncate text-[11px] text-muted-foreground">{l.c}</div>
              </div>
            </div>
            <Pill tone={l.s === "New" ? "muted" : "primary"}>{l.s}</Pill>
          </Row>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["Import CSV", "Add to campaign", "Tag", "Change status", "Export"].map((a) => (
          <span
            key={a}
            className="rounded-lg border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            {a}
          </span>
        ))}
      </div>
    </AppFrame>
  );
}

/* ----------------------------------------------------------- follow-ups */

export function SequenceMock() {
  const nodes = [
    { icon: Mail, t: "Intro email", s: "Sent · Day 0" },
    { icon: Clock, t: "Wait 3 days", s: "No reply detected" },
    { icon: Mail, t: "Follow-up #1", s: "Scheduled · Tue 09:15" },
    { icon: Check, t: "Reply received", s: "Sequence stops automatically" },
  ];
  return (
    <AppFrame title="Campaign sequence" path="/campaigns · follow-ups">
      <ol className="space-y-2">
        {nodes.map((n, i) => (
          <li key={n.t}>
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <n.icon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{n.t}</div>
                <div className="truncate text-[11px] text-muted-foreground">{n.s}</div>
              </div>
            </div>
            {i < nodes.length - 1 ? (
              <div aria-hidden className="py-1 text-center text-xs text-primary/60">
                ↓
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </AppFrame>
  );
}

/* --------------------------------------------------------------- inbox  */

export function InboxMock() {
  return (
    <AppFrame title="Unified Inbox" path="/inbox">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-2">
          {[
            { n: "Daniel Reyes", p: "Sounds interesting — can you…", b: "Interested" },
            { n: "Priya Nair", p: "Who handles this on your side?", b: "Unread" },
            { n: "Tom Becker", p: "Not right now, thanks.", b: "Closed" },
          ].map((c) => (
            <div key={c.n} className="rounded-xl border border-border/70 bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{c.n}</span>
                <Pill tone={c.b === "Closed" ? "muted" : "primary"}>{c.b}</Pill>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.p}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
            <span className="truncate text-xs font-semibold">Daniel Reyes · Loop Labs</span>
            <Pill tone="muted">Assigned to you</Pill>
          </div>
          <div className="space-y-2 py-2.5">
            <div className="rounded-lg bg-secondary/70 p-2.5 text-[11px] text-muted-foreground">
              Q3 Outbound · Step 2 — sent Tuesday 09:15
            </div>
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-2.5 text-[11px]">
              “Sounds interesting — can you send over pricing and a short demo?”
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-[11px] text-muted-foreground">
            <Inbox className="size-3.5" /> Reply from the same mailbox…
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------- email accounts */

export function EmailAccountsMock() {
  const boxes = [
    { e: "sales@yourdomain.com", s: "Connected", h: 94 },
    { e: "hello@yourdomain.com", s: "Warming up", h: 71 },
    { e: "team@yourdomain.io", s: "Connected", h: 88 },
  ];
  return (
    <AppFrame title="Email Accounts" path="/sending">
      <div className="space-y-2">
        {boxes.map((b) => (
          <Row key={b.e}>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{b.e}</div>
              <div className="text-[11px] text-muted-foreground">Health {b.h}/100</div>
            </div>
            <Pill tone={b.s === "Connected" ? "primary" : "muted"}>{b.s}</Pill>
          </Row>
        ))}
      </div>
    </AppFrame>
  );
}

/* -------------------------------------------------------------- warmup  */

export function WarmupMock() {
  const bars = [
    { l: "Mon", v: 30 },
    { l: "Tue", v: 45 },
    { l: "Wed", v: 58 },
    { l: "Thu", v: 70 },
    { l: "Fri", v: 84 },
  ];
  return (
    <AppFrame title="Warmup" path="/warmup">
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Flame className="size-3.5 text-primary" /> Warmup activity
        </div>
        <Pill tone="muted">Separate from campaign sending</Pill>
      </div>
      <div className="flex h-28 items-end gap-2 rounded-xl border border-border/70 bg-background p-3">
        {bars.map((b) => (
          <div key={b.l} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${b.v}%` }} />
            <span className="text-[10px] text-muted-foreground">{b.l}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "Mailbox health", v: "Tracked daily" },
          { k: "Ramp", v: "Gradual" },
          { k: "Timeline", v: "Per-message log" },
        ].map((c) => (
          <div key={c.k} className="rounded-xl border border-border/70 bg-background p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.k}</div>
            <div className="mt-0.5 text-xs font-semibold">{c.v}</div>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ AI  */

export function AiMock() {
  return (
    <AppFrame title="AI Personalization" path="/campaigns · personalization">
      <div className="rounded-xl border border-border/70 bg-background p-3">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="size-3.5 text-primary" /> {"{{ai_personalization}}"}
        </div>
        <p className="mt-2 rounded-lg bg-secondary/70 p-2.5 text-[11px] text-muted-foreground">
          Generated from the lead fields you imported — company, role, industry and lead notes.
          Every line stays editable before the campaign sends.
        </p>
      </div>
      <div className="mt-2 space-y-2">
        {[
          { l: "Your own OpenAI API key", v: "Connected" },
          { l: "Preview before send", v: "Per lead" },
          { l: "Fallback when data is thin", v: "Configurable" },
        ].map((r) => (
          <Row key={r.l}>
            <span className="truncate text-xs font-medium">{r.l}</span>
            <Pill tone="muted">{r.v}</Pill>
          </Row>
        ))}
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------- automations UI */

export function AutomationMock() {
  return (
    <AppFrame title="Automations" path="/automations/workflows">
      <div className="space-y-2">
        <div className="rounded-xl border border-primary/25 bg-primary/8 p-3">
          <div className="text-[10px] uppercase tracking-wide text-primary">Trigger</div>
          <div className="mt-0.5 text-xs font-semibold">Positive reply detected</div>
        </div>
        <div aria-hidden className="text-center text-xs text-primary/60">↓</div>
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Condition</div>
          <div className="mt-0.5 text-xs font-semibold">Reply sentiment equals “positive”</div>
        </div>
        <div aria-hidden className="text-center text-xs text-primary/60">↓</div>
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Actions</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {["Stop campaign follow-ups", "Move CRM stage", "Create task", "Notify team"].map((a) => (
              <span key={a} className="rounded-lg bg-secondary px-2 py-0.5 text-[11px]">
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

/* ----------------------------------------------------------- analytics  */

export function AnalyticsMock() {
  const metrics = [
    { l: "Sent", v: "Tracked per campaign" },
    { l: "Delivered", v: "Provider confirmed" },
    { l: "Opens", v: "Optional tracking" },
    { l: "Clicks", v: "Tracked links" },
    { l: "Replies", v: "Real inbound" },
    { l: "Bounces", v: "Provider events" },
  ];
  return (
    <AppFrame title="Analytics" path="/analytics">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.l} className="rounded-xl border border-border/70 bg-background p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.l}</div>
            <div className="mt-0.5 text-xs font-semibold">{m.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex h-24 items-end gap-1.5 rounded-xl border border-border/70 bg-background p-3">
        {[38, 52, 44, 66, 58, 74, 81].map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-primary/70" style={{ height: `${h}%` }} />
        ))}
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ CRM */

export function CrmMock() {
  const cols = [
    { t: "New", items: ["Northwind", "Stackhouse"] },
    { t: "Contacted", items: ["Cadence"] },
    { t: "Interested", items: ["Loop Labs"] },
  ];
  return (
    <AppFrame title="CRM" path="/crm">
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.t} className="rounded-xl border border-border/70 bg-background p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold">{c.t}</span>
              <span className="text-[10px] text-muted-foreground">{c.items.length}</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {c.items.map((i) => (
                <div key={i} className="rounded-lg bg-secondary/70 px-2 py-1.5 text-[11px]">
                  {i}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-2">
        <Row>
          <span className="text-xs font-medium">Task · Follow up on reply</span>
          <Pill tone="muted">Due tomorrow</Pill>
        </Row>
      </div>
    </AppFrame>
  );
}

/* ------------------------------------------------------------ templates */

export function TemplatesMock() {
  return (
    <AppFrame title="Templates" path="/templates">
      <div className="space-y-2">
        {["Intro — SaaS founders", "Follow-up — no reply", "Break-up email"].map((t) => (
          <Row key={t}>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{t}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                Hi {"{{first_name}}"}, saw {"{{company}}"} is…
              </div>
            </div>
            <Pill tone="muted">Reusable</Pill>
          </Row>
        ))}
      </div>
    </AppFrame>
  );
}

/* ----------------------------------------------------------- workspaces */

export function WorkspaceMock() {
  return (
    <AppFrame title="Workspace" path="/workspace">
      <div className="space-y-2">
        {[
          { n: "You", r: "Owner" },
          { n: "Team member", r: "Admin" },
          { n: "Team member", r: "Member" },
        ].map((m, i) => (
          <Row key={i}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Users className="size-3" />
              </span>
              <span className="truncate text-xs font-medium">{m.n}</span>
            </div>
            <Pill tone={m.r === "Owner" ? "primary" : "muted"}>{m.r}</Pill>
          </Row>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Campaigns, leads, mailboxes and conversations are scoped to the workspace they belong to.
      </p>
    </AppFrame>
  );
}

/* ------------------------------------------------------------------ API */

export function ApiMock() {
  return (
    <AppFrame title="API Documentation" path="/api-docs">
      <div className="space-y-2">
        {[
          { m: "POST", p: "/api/public/integrations/{slug}" },
          { m: "POST", p: "/api/public/automations/{token}" },
          { m: "POST", p: "/api/public/inbound/email" },
          { m: "GET", p: "/api/public/media/{path}" },
        ].map((e) => (
          <Row key={e.p}>
            <span className="truncate font-mono text-[11px]">{e.p}</span>
            <Pill tone={e.m === "POST" ? "primary" : "muted"}>{e.m}</Pill>
          </Row>
        ))}
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl border border-border/70 bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
{`curl -X POST https://munchreach.com/api/public/automations/{token} \\
  -H "Content-Type: application/json" \\
  -d '{"email":"lead@company.com"}'`}
      </pre>
    </AppFrame>
  );
}

/* --------------------------------------------------------- flow diagram */

export function FlowDiagram({ steps }: { steps: { label: string; text: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((s, i) => (
        <div key={s.label} className="relative rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
              {i + 1}
            </span>
            <h3 className="text-sm font-semibold">{s.label}</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
          {i < steps.length - 1 ? (
            <ArrowRight
              aria-hidden
              className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-primary/50 lg:block"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
