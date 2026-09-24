import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  AtSign,
  BarChart3,
  Check,
  Flame,
  Inbox,
  Layers,
  Mail,
  Paperclip,
  Repeat,
  Search,
  Send,
  Sparkles,
  StickyNote,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import { BrandGlyph, brandIcon } from "@/components/site/BrandGlyph";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { INTEGRATIONS } from "@/lib/integrations-catalog";
import munchIcon from "@/assets/munchreach-icon.png";
import dashboardOverviewAsset from "@/assets/munchreach-dashboard-overview.jpg.asset.json";

function Eyebrow({ children }: { children: string }) {
  return <span className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">{children}</span>;
}

/* ------------------------------------------------------------------ */
/* 1. Works with your stack                                            */
/* ------------------------------------------------------------------ */

const STACK = INTEGRATIONS.filter((i) => i.brand && brandIcon(i.brand));

function LogoNode({ brand, name }: { brand: string; name: string }) {
  return (
    <Link
      to="/integrations/$slug"
      params={{ slug: STACK.find((s) => s.brand === brand)?.slug ?? "" }}
      aria-label={name}
      title={name}
      className="group grid size-14 place-items-center rounded-2xl border border-border/70 bg-card shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--primary)_60%,transparent)] transition-all duration-300 hover:scale-110 hover:border-primary/40 hover:shadow-[0_16px_36px_-16px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
    >
      <BrandGlyph brand={brand} title={name} className="size-7" />
    </Link>
  );
}

function Orbit({ items, radius, duration, reverse }: { items: typeof STACK; radius: number; duration: number; reverse?: boolean }) {
  return (
    <div
      className="mr-orbit absolute inset-0"
      style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
    >
      {items.map((item, i) => {
        const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        return (
          <div key={item.slug} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <div
              className="mr-orbit"
              style={{ animationDuration: `${duration}s`, animationDirection: reverse ? "normal" : "reverse" }}
            >
              <LogoNode brand={item.brand!} name={item.name} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StackSection() {
  const inner = STACK.slice(0, 4);
  const outer = STACK.slice(4);
  return (
    <section className="relative overflow-hidden border-y border-border/60 bg-gradient-to-b from-background via-primary/[0.03] to-background py-20 sm:py-28">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <Reveal>
          <Eyebrow>Integrations</Eyebrow>
          <h2 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">
            Works With
            <br />
            <span className="text-primary">Your Stack</span>
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Connect MunchReach with the tools your team already uses and keep your outbound workflow connected in one place.
          </p>
          <Button className="group mt-8 rounded-xl" size="lg" asChild>
            <Link to="/integrations">
              Explore Integrations
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Reveal>

        {/* Desktop / tablet orbit */}
        <Reveal delay={120} className="hidden sm:block">
          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
              <circle cx="50" cy="50" r="24" fill="none" stroke="var(--border)" strokeWidth="0.25" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="0.25" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="0.3" strokeDasharray="1 3" className="mr-dash" />
              <circle cx="50" cy="50" r="24" fill="none" stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="0.3" strokeDasharray="1 3" className="mr-dash" />
            </svg>
            <Orbit items={inner} radius={24} duration={70} />
            <Orbit items={outer} radius={42} duration={110} reverse />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 -m-6 rounded-full bg-primary/15 blur-2xl" />
              <div className="relative grid size-24 place-items-center rounded-3xl border border-primary/25 bg-card shadow-[0_24px_50px_-24px_color-mix(in_oklab,var(--primary)_80%,transparent)]">
                <img src={munchIcon} alt="MunchReach" className="size-12 object-contain" />
              </div>
            </div>
          </div>
        </Reveal>

        {/* Mobile arrangement */}
        <Reveal delay={120} className="sm:hidden">
          <div className="flex justify-center">
            <div className="grid size-20 place-items-center rounded-3xl border border-primary/25 bg-card shadow-lg">
              <img src={munchIcon} alt="MunchReach" className="size-10 object-contain" />
            </div>
          </div>
          <div className="mx-auto h-6 w-px bg-gradient-to-b from-primary/40 to-transparent" />
          <div className="flex flex-wrap justify-center gap-3">
            {STACK.map((s, i) => (
              <div key={s.slug} className="mr-float" style={{ animationDelay: `${i * 0.4}s` }}>
                <LogoNode brand={s.brand!} name={s.name} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Every reply. One inbox.                                          */
/* ------------------------------------------------------------------ */

const conversations = [
  { name: "Sarah Mitchell", company: "Northwind", preview: "Thanks for reaching out — Thursday works…", status: "Interested", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", active: true },
  { name: "David Park", company: "Brightlane", preview: "Can you send over more details on…", status: "Lead", tone: "bg-primary/12 text-primary" },
  { name: "Emma Rossi", company: "Fieldstone", preview: "Booked a slot for next week.", status: "Meeting booked", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { name: "James Carter", company: "Oakridge", preview: "I'm out of the office until Monday…", status: "Out of office", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { name: "Lina Haddad", company: "Corvid Labs", preview: "Not a fit right now, thanks.", status: "Not interested", tone: "bg-muted text-muted-foreground" },
];

function InboxProductVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-[0_40px_80px_-50px_color-mix(in_oklab,var(--foreground)_45%,transparent)]">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="ml-3 text-[11px] font-medium text-muted-foreground">Unibox</span>
      </div>
      <div className="grid aspect-[16/10] min-h-0 grid-cols-[1.05fr_1.6fr] text-[11px] md:grid-cols-[1fr_1.55fr_0.85fr]">
        {/* Conversation list */}
        <div className="flex min-h-0 flex-col border-r border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-muted-foreground">
            <Search className="size-3" /> Search conversations
          </div>
          <ul className="min-h-0 flex-1 overflow-hidden">
            {conversations.map((c) => (
              <li key={c.name} className={`border-b border-border/50 px-3 py-2.5 ${c.active ? "bg-primary/[0.06]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.name}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${c.tone}`}>{c.status}</span>
                </div>
                <p className="mt-0.5 truncate text-muted-foreground">{c.preview}</p>
              </li>
            ))}
          </ul>
        </div>
        {/* Thread */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
            <div>
              <p className="font-semibold">Quick question about Northwind's outbound</p>
              <p className="text-[10px] text-muted-foreground">Sarah Mitchell · via alex@yourdomain.com</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">Interested</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-4 py-3">
            <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-border/60 bg-muted/40 p-2.5">
              <p className="text-muted-foreground">Hi Sarah — noticed Northwind is growing the sales team. Worth a quick chat about how you book meetings?</p>
            </div>
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-primary/10 p-2.5">
              <p>Thanks for reaching out — this is timely. Thursday afternoon works for a call.</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-amber-700 dark:text-amber-300">
              <StickyNote className="size-3" /> Internal note: warm lead, send calendar link.
            </div>
          </div>
          <div className="m-3 rounded-xl border border-border/70">
            <div className="px-3 py-2 text-muted-foreground">Great — here's a link to grab a time that suits you…</div>
            <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Paperclip className="size-3" />
                <AtSign className="size-3" />
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                  <Sparkles className="size-3" /> AI Reply
                </span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground">
                <Send className="size-3" /> Send
              </span>
            </div>
          </div>
        </div>
        {/* Contact context */}
        <div className="hidden min-h-0 flex-col gap-3 border-l border-border/60 p-3 md:flex">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-primary/15 font-semibold text-primary">SM</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">Sarah Mitchell</p>
              <p className="truncate text-[10px] text-muted-foreground">Head of Sales · Northwind</p>
            </div>
          </div>
          <dl className="space-y-1.5">
            {[
              ["Stage", "Replied"],
              ["Campaign", "Q3 Outreach"],
              ["Assigned", "Alex"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg border border-border/60 p-2">
            <p className="font-medium">Activity</p>
            <ul className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
              <li>Replied · 2h ago</li>
              <li>Opened step 1</li>
              <li>Added to campaign</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InboxSection() {
  const points = [
    "Replies from all mailboxes in one view",
    "Reply classification",
    "Assignments and internal notes",
    "Conversation history with CRM context",
  ];
  return (
    <section id="inbox" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-14">
        <Reveal>
          <Eyebrow>Unified inbox</Eyebrow>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Every Reply. One Inbox.</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Replies from every connected mailbox arrive in one place, threaded with the full conversation and the lead's CRM context.
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm sm:text-base">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3" />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="group mt-8 rounded-xl" asChild>
            <Link to="/product/unified-inbox">
              Explore Unified Inbox
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </Reveal>
        <Reveal delay={120} className="min-w-0">
          <InboxProductVisual />
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. One workspace. Everything connected.                             */
/* ------------------------------------------------------------------ */

const modules = [
  { icon: Users, label: "Leads", note: "CSV import" },
  { icon: Layers, label: "Campaigns", note: "Schedule & limits" },
  { icon: Repeat, label: "Sequences", note: "Multi-step" },
  { icon: Sparkles, label: "AI", note: "Personalized drafts" },
  { icon: Inbox, label: "Inbox", note: "Every reply" },
  { icon: Flame, label: "Warmup", note: "Mailbox health" },
  { icon: Workflow, label: "CRM", note: "Pipeline stages" },
  { icon: BarChart3, label: "Analytics", note: "Real sending data" },
];

// Node anchor positions (percent of the stage). Left column top→bottom follows the
// outbound flow, right column continues it, so the pulse reads in order.
const nodePos = [
  { x: 9, y: 14 },
  { x: 4, y: 38 },
  { x: 4, y: 62 },
  { x: 9, y: 86 },
  { x: 91, y: 14 },
  { x: 96, y: 38 },
  { x: 96, y: 62 },
  { x: 91, y: 86 },
];

export function WorkspaceSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/[0.04] via-background to-background py-20 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/10 via-violet-500/10 to-primary/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>One workspace</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-5xl">
              One Workspace.
              <br />
              <span className="text-primary">Everything connected.</span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Leads, campaigns, replies, and pipeline share the same workspace and the same data, so nothing has to be copied
              between tools.
            </p>
          </div>
        </Reveal>

        {/* Desktop stage */}
        <Reveal delay={100} className="relative mx-auto mt-16 hidden aspect-[16/8] max-w-6xl lg:block">
          <svg aria-hidden viewBox="0 0 100 50" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {nodePos.map((p, i) => {
              const tx = p.x < 50 ? 24 : 76;
              const ty = 50 * (p.y / 100);
              const cy = 25;
              const d = `M ${p.x < 50 ? p.x + 6 : p.x - 6} ${ty} C ${(p.x + tx) / 2} ${ty}, ${(p.x + tx) / 2} ${cy}, ${tx} ${cy}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="var(--primary)" strokeOpacity="0.25" strokeWidth="0.15" vectorEffect="non-scaling-stroke" />
                  <path d={d} fill="none" stroke="var(--primary)" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="4 60" vectorEffect="non-scaling-stroke" className="mr-flow" style={{ animationDelay: `${i * 0.9}s` }} />
                </g>
              );
            })}
          </svg>

          <div className="absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_40px_90px_-40px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-4 py-2">
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="ml-3 text-[11px] font-medium text-muted-foreground">MunchReach workspace</span>
              </div>
              <img src={dashboardOverviewAsset.url} alt="MunchReach workspace dashboard" loading="lazy" className="block h-auto w-full" />
            </div>
          </div>

          {modules.map((m, i) => (
            <div
              key={m.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${nodePos[i]!.x}%`, top: `${nodePos[i]!.y}%` }}
            >
              <div className="mr-float" style={{ animationDelay: `${i * 0.5}s` }}>
                <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/95 py-2 pl-2 pr-3.5 shadow-[0_12px_30px_-18px_color-mix(in_oklab,var(--foreground)_40%,transparent)] backdrop-blur transition-transform hover:scale-105">
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <m.icon className="size-4" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground">{m.note}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </Reveal>

        {/* Tablet / mobile */}
        <div className="mt-12 lg:hidden">
          <Reveal>
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl">
              <img src={dashboardOverviewAsset.url} alt="MunchReach workspace dashboard" loading="lazy" className="block h-auto w-full" />
            </div>
          </Reveal>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {modules.map((m, i) => (
              <Reveal key={m.label} delay={i * 50}>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm font-medium shadow-sm">
                  <m.icon className="size-4 text-primary" />
                  {m.label}
                </span>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal className="mt-12 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-xs font-medium text-muted-foreground">
          {[
            [UserPlus, "Lead"],
            [Repeat, "Sequence"],
            [Sparkles, "AI"],
            [Mail, "Email"],
            [Inbox, "Reply"],
            [Workflow, "CRM"],
            [BarChart3, "Analytics"],
          ].map(([Icon, label], i, arr) => {
            const I = Icon as typeof Mail;
            return (
              <span key={label as string} className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.07] px-2.5 py-1 text-foreground/80">
                  <I className="size-3.5 text-primary" />
                  {label as string}
                </span>
                {i < arr.length - 1 ? <ArrowRight className="size-3 text-primary/50" /> : null}
              </span>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
