import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  ExternalLink,
  Flame,
  Inbox,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";

import { MarketingLayout, PageHero, metaFor } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { COMPARISON_LIST } from "@/lib/comparison-content";
import {
  ALTERNATIVES_FAQS,
  ALTERNATIVES_REVIEWED_ON,
  AUDIENCES,
  DECISION_GUIDE,
  FEATURE_DEEP_DIVES,
  MATRIX_COLUMNS,
  MIGRATION_CHECKLIST,
  MIGRATION_STEPS,
  PLATFORM_MATRIX,
  USE_CASES,
  WHY_COMPARE,
  WHY_SWITCH,
} from "@/lib/alternatives-content";

const COMPARE_ROUTES = {
  "munchreach-vs-instantly": "/compare/munchreach-vs-instantly",
  "munchreach-vs-smartlead": "/compare/munchreach-vs-smartlead",
  "munchreach-vs-lemlist": "/compare/munchreach-vs-lemlist",
  "munchreach-vs-apollo": "/compare/munchreach-vs-apollo",
  "munchreach-vs-saleshandy": "/compare/munchreach-vs-saleshandy",
} as const satisfies Record<string, string>;

const pillars = [
  { icon: ShieldCheck, title: "Deliverability first", body: "SPF, DKIM and DMARC gates, per-account caps, sending windows and suppression handling before anything sends." },
  { icon: Flame, title: "Built-in warmup", body: "Per-mailbox ramp schedules with daily stats and health scoring — not a separate subscription." },
  { icon: Inbox, title: "Unified inbox", body: "Every reply across every connected mailbox in one threaded view, answered from the original account." },
  { icon: Users, title: "CRM from replies", body: "Contacts, pipeline stages, tasks and notes created automatically when a prospect responds." },
  { icon: Workflow, title: "Visual automations", body: "Trigger, condition, action and wait steps running on a server-side scheduler." },
  { icon: BarChart3, title: "Funnel analytics", body: "Sent → delivered → opened → replied across campaigns, mailboxes and the whole workspace." },
];

const NAV = [
  { id: "quick-comparison", label: "Quick comparison" },
  { id: "why-compare", label: "Why compare" },
  { id: "competitors", label: "Platforms" },
  { id: "features", label: "Feature depth" },
  { id: "audiences", label: "By team" },
  { id: "use-cases", label: "By use case" },
  { id: "switching", label: "Why teams switch" },
  { id: "migration", label: "Migration" },
  { id: "faq", label: "FAQ" },
];

export const Route = createFileRoute("/compare/munchreach-alternatives")({
  head: () =>
    metaFor(
      "MunchReach Alternatives — Cold Email Platforms Compared (2026)",
      "Compare MunchReach with Instantly, Smartlead, lemlist, Apollo and Saleshandy across sending, warmup, deliverability, inbox, CRM, automation, analytics and API.",
      "/compare/munchreach-alternatives",
      ALTERNATIVES_FAQS,
    ),
  component: AlternativesPage,
});

function SectionHead({ id, eyebrow, title, lead }: { id?: string; eyebrow?: string; title: string; lead?: string }) {
  return (
    <Reveal>
      <div id={id} className="scroll-mt-24">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {lead ? <p className="mt-3 max-w-3xl text-muted-foreground">{lead}</p> : null}
      </div>
    </Reveal>
  );
}

function AlternativesPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Comparisons"
        title="MunchReach"
        highlight="alternatives"
        description="A detailed, neutral comparison of the cold email and sales engagement platforms teams evaluate alongside MunchReach — what each one is genuinely built for, where MunchReach differs, and how to choose without guessing."
        secondaryCta="View Pricing"
      />

      {/* Section navigation */}
      <div className="sticky top-16 z-30 border-y border-border/60 bg-background/85 backdrop-blur">
        <nav
          aria-label="On this page"
          className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 text-sm sm:px-6"
        >
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className="whitespace-nowrap rounded-full border border-border/60 px-3 py-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>
      </div>

      {/* 1. Quick comparison matrix */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHead
          id="quick-comparison"
          eyebrow="At a glance"
          title="Quick comparison table"
          lead="The same thirteen questions asked of every platform. Competitor rows describe publicly documented positioning; we deliberately do not publish competitor prices here because they change often — follow the vendor link for current numbers."
        />

        <Reveal>
          <div className="mt-8 hidden overflow-x-auto rounded-2xl border border-border/70 bg-card lg:block">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <caption className="sr-only">
                MunchReach compared with Instantly, Smartlead, lemlist, Apollo and Saleshandy
              </caption>
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  <th scope="col" className="sticky left-0 z-10 bg-muted/40 px-4 py-3 font-semibold">
                    Capability
                  </th>
                  {PLATFORM_MATRIX.map((p) => (
                    <th
                      key={p.slug}
                      scope="col"
                      className={`px-4 py-3 font-semibold ${p.slug === "munchreach" ? "text-primary" : ""}`}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_COLUMNS.map((col, rowIndex) => (
                  <tr key={col.key} className={rowIndex % 2 ? "bg-muted/20" : undefined}>
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 px-4 py-3 align-top font-medium ${rowIndex % 2 ? "bg-muted/20" : "bg-card"}`}
                    >
                      {col.label}
                    </th>
                    {PLATFORM_MATRIX.map((p) => (
                      <td
                        key={p.slug}
                        className={`px-4 py-3 align-top leading-relaxed ${
                          p.slug === "munchreach" ? "bg-primary/5 text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {String(p[col.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* Mobile: stacked cards */}
        <div className="mt-8 grid gap-5 lg:hidden">
          {PLATFORM_MATRIX.map((p, i) => (
            <Reveal key={p.slug} delay={i * 40}>
              <div
                className={`rounded-2xl border p-5 ${
                  p.slug === "munchreach" ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card"
                }`}
              >
                <h3 className="text-base font-semibold">{p.name}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  {MATRIX_COLUMNS.map((col) => (
                    <div key={col.key}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {col.label}
                      </dt>
                      <dd className="leading-relaxed">{String(p[col.key])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Last reviewed {ALTERNATIVES_REVIEWED_ON}. Capabilities described from public documentation; verify current
          details on each vendor's site.
        </p>
      </section>

      {/* 2. Why teams compare */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead
            id="why-compare"
            eyebrow="Evaluation framework"
            title="Why teams compare outbound platforms"
            lead="Feature lists look identical across this category. These six dimensions are where the real differences sit — and where a bad fit shows up three months in."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {WHY_COMPARE.map((c, i) => (
              <Reveal key={c.title} delay={i * 50}>
                <div className="h-full rounded-2xl border border-border/70 bg-card p-6">
                  <h3 className="text-base font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Competitor deep sections */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHead
          id="competitors"
          eyebrow="Platform by platform"
          title="The five platforms teams compare with MunchReach"
          lead="Each section covers what the platform is genuinely strong at, how MunchReach differs, and who should pick which. Every one links to a full side-by-side comparison."
        />

        <div className="mt-10 space-y-8">
          {COMPARISON_LIST.map((c, i) => (
            <Reveal key={c.slug} delay={i * 40}>
              <article
                id={c.slug}
                className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/70 bg-card"
              >
                <div className="border-b border-border/60 bg-muted/25 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xl font-bold tracking-tight">MunchReach vs {c.competitor}</h3>
                    <a
                      href={c.competitorSite}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      {c.competitorSite.replace("https://", "")} <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{c.heroSummary}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        MunchReach is best for
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{c.sendloopBestFor}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {c.competitor} is best for
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{c.competitorBestFor}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-semibold">Where {c.competitor} is strong</h4>
                    <ul className="mt-3 space-y-2">
                      {c.competitorStrengths.map((s) => (
                        <li key={s} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Where MunchReach differs</h4>
                    <ul className="mt-3 space-y-2">
                      {c.sendloopDifferences.map((s) => (
                        <li key={s} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid gap-4 border-t border-border/60 p-6 sm:p-8 lg:grid-cols-3">
                  <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Choose MunchReach if
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                        {c.chooseSendloop.map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Choose {c.competitor} if
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                        {c.chooseCompetitor.map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center gap-3 rounded-xl border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">
                      Full side-by-side on {c.rows.length} capability areas, migration steps and FAQs.
                    </p>
                    <Button variant="outline" className="w-full" asChild>
                      <Link to={COMPARE_ROUTES[c.slug as keyof typeof COMPARE_ROUTES]}>
                        Read MunchReach vs {c.competitor} <ArrowRight className="ml-1.5 size-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 4. Feature deep dives */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead
            id="features"
            eyebrow="Feature depth"
            title="Fifteen capabilities, explained properly"
            lead="For each area: what it actually means, why it matters for results, how MunchReach implements it, and what to check in any tool you evaluate."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {FEATURE_DEEP_DIVES.map((f, i) => (
              <Reveal key={f.slug} delay={i * 30}>
                <div id={f.slug} className="h-full scroll-mt-24 rounded-2xl border border-border/70 bg-card p-6">
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.what}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Why it matters: </span>
                    {f.why}
                  </p>
                  <p className="mt-3 rounded-xl bg-primary/5 p-3 text-sm leading-relaxed">
                    <span className="font-medium text-primary">In MunchReach: </span>
                    {f.munchreach}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">What to look for: </span>
                    {f.lookFor}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Best for each audience */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHead
          id="audiences"
          eyebrow="By team type"
          title="Which platform suits which team"
          lead="Recommendations are situational, not absolute. Read the reasoning rather than the label."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} delay={i * 40}>
              <div className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6">
                <h3 className="text-base font-semibold">{a.title}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">{a.best}</p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{a.why}</p>
                <p className="mt-4 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Also consider: </span>
                  {a.consider}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 6. Use-case comparison + decision guide */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead
            id="use-cases"
            eyebrow="By use case"
            title="Pick by the job you need done"
            lead="Start from the outcome, not the feature list. If a competitor is the better answer for your situation, this table says so."
          />
          <div className="mt-8 overflow-x-auto rounded-2xl border border-border/70 bg-card">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  <th scope="col" className="px-4 py-3 font-semibold">If you need</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Strongest fit</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody>
                {USE_CASES.map((u, i) => (
                  <tr key={u.need} className={i % 2 ? "bg-muted/20" : undefined}>
                    <th scope="row" className="px-4 py-3 align-top font-medium">{u.need}</th>
                    <td className="px-4 py-3 align-top font-medium text-primary">{u.pick}</td>
                    <td className="px-4 py-3 align-top leading-relaxed text-muted-foreground">{u.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Reveal>
            <h3 className="mt-12 text-xl font-bold tracking-tight">A 30-second decision guide</h3>
          </Reveal>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {DECISION_GUIDE.map((d, i) => (
              <Reveal key={d.need} delay={i * 40}>
                <div className="h-full rounded-2xl border border-border/70 bg-card p-5">
                  <p className="text-sm font-medium">{d.need}</p>
                  <p className="mt-1.5 text-sm font-semibold text-primary">{d.answer}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{d.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Why teams switch */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHead
          id="switching"
          eyebrow="Switching triggers"
          title="Why teams move to MunchReach"
          lead="Not reasons to switch for the sake of it — the specific moments where teams tell us their current setup stopped fitting."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {WHY_SWITCH.map((s, i) => (
            <Reveal key={s.title} delay={i * 40}>
              <div className="h-full rounded-2xl border border-border/70 bg-card p-6">
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <SectionHead
          eyebrow="The MunchReach position"
          title="What makes MunchReach different"
          lead="Most alternatives are excellent at one slice of outbound. MunchReach is built so the whole motion — from the first send to the closed reply — happens in one workspace."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 50}>
              <div className="h-full rounded-2xl border border-border/70 bg-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <p.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 8. Migration */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHead
            id="migration"
            eyebrow="Migration"
            title="Switching without hurting deliverability"
            lead="The mechanical work takes a day or two. The ramp is what sets the timeline — plan one to two weeks before you are back at full volume."
          />
          <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr,1fr]">
            <ol className="space-y-4">
              {MIGRATION_STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 40}>
                  <li className="flex gap-4 rounded-2xl border border-border/70 bg-card p-5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
            <Reveal delay={80}>
              <div className="rounded-2xl border border-border/70 bg-card p-6">
                <h3 className="text-base font-semibold">Migration checklist</h3>
                <ul className="mt-4 space-y-2.5">
                  {MIGRATION_CHECKLIST.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" asChild>
                  <Link to="/auth">
                    Start your migration <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 9. FAQ */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <SectionHead
          id="faq"
          eyebrow="FAQ"
          title="Alternatives, migration and fit — answered"
        />
        <div className="mt-8 divide-y divide-border/60 rounded-2xl border border-border/70 bg-card">
          {ALTERNATIVES_FAQS.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                <span className="flex items-start justify-between gap-4">
                  {f.q}
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition group-open:rotate-90" />
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-8 text-center">
          <h2 className="text-xl font-bold tracking-tight">See it for yourself</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Start free, connect a mailbox and run one campaign end to end — sending, warmup, replies and pipeline
            included. No migration required to evaluate it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">
                Start for Free <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Last reviewed {ALTERNATIVES_REVIEWED_ON}.</p>
        </div>
      </section>
    </MarketingLayout>
  );
}
