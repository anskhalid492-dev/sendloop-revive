import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, Check, Flame, Inbox, ShieldCheck, Users, Workflow } from "lucide-react";

import { MarketingLayout, PageHero, metaFor } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { Button } from "@/components/ui/button";
import { COMPARISON_LIST } from "@/lib/comparison-content";

const faqs = [
  {
    q: "What is the best Sendloop alternative?",
    a: "It depends on what you optimise for. Instantly and Saleshandy are sending-first, Smartlead leans on infrastructure and APIs, lemlist adds multichannel personalization, and Apollo bundles a contact database. Sendloop's own position is end-to-end email: sending, deliverability, unified inbox, CRM, automations and analytics in one workspace.",
  },
  {
    q: "How were these alternatives chosen?",
    a: "They are the cold email and sales engagement tools teams most often evaluate alongside Sendloop. Each page describes publicly documented capabilities in neutral terms — no invented pricing or feature claims.",
  },
  {
    q: "Can I migrate from another tool without hurting deliverability?",
    a: "Yes. Import your lists, connect and authenticate your domains, run warmup on each mailbox in parallel, then move volume across gradually once test sends and the unresolved-variable report look clean.",
  },
  {
    q: "When was this page last reviewed?",
    a: "20 August 2026. Competitor products change frequently — check each vendor's site for current details before deciding.",
  },
];

const COMPARE_ROUTES = {
  "sendloop-vs-instantly": "/compare/sendloop-vs-instantly",
  "sendloop-vs-smartlead": "/compare/sendloop-vs-smartlead",
  "sendloop-vs-lemlist": "/compare/sendloop-vs-lemlist",
  "sendloop-vs-apollo": "/compare/sendloop-vs-apollo",
  "sendloop-vs-saleshandy": "/compare/sendloop-vs-saleshandy",
} as const satisfies Record<string, string>;

const pillars = [
  { icon: ShieldCheck, title: "Deliverability first", body: "SPF, DKIM and DMARC gates, per-account caps, sending windows and suppression handling before anything sends." },
  { icon: Flame, title: "Built-in warmup", body: "Per-mailbox ramp schedules with daily stats and health scoring — not a separate subscription." },
  { icon: Inbox, title: "Unified inbox", body: "Every reply across every connected mailbox in one threaded view, answered from the original account." },
  { icon: Users, title: "CRM from replies", body: "Contacts, pipeline stages, tasks and notes created automatically when a prospect responds." },
  { icon: Workflow, title: "Visual automations", body: "Trigger, condition, action and wait steps running on a server-side scheduler." },
  { icon: BarChart3, title: "Funnel analytics", body: "Sent → delivered → opened → replied across campaigns, mailboxes and the whole workspace." },
];

export const Route = createFileRoute("/compare/sendloop-alternatives")({
  head: () =>
    metaFor(
      "Sendloop Alternatives — Compare Cold Email Platforms (2026)",
      "A neutral guide to Sendloop alternatives: Instantly, Smartlead, lemlist, Apollo and Saleshandy compared on sending, deliverability, warmup, inbox, CRM and automations.",
      "/compare/sendloop-alternatives",
      faqs,
    ),
  component: AlternativesPage,
});

function AlternativesPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Comparisons"
        title="Sendloop"
        highlight="alternatives"
        description="Evaluating cold email platforms? Here is an honest map of the tools teams compare with Sendloop, what each one is genuinely good at, and where Sendloop is different."
        secondaryCta="View Pricing"
      />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Compare Sendloop side by side</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Each comparison covers the same areas — campaigns, sequences, deliverability, warmup, inbox, CRM,
            automations, analytics and pricing model — so you can read them like for like.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMPARISON_LIST.map((c, i) => (
            <Reveal key={c.slug} delay={i * 60}>
              <div className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6 transition hover:border-primary/40 hover:shadow-lg">
                <h3 className="text-lg font-semibold">Sendloop vs {c.competitor}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{c.heroSummary}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Best for {c.competitor}:</span> {c.competitorBestFor}
                </p>
                <Button variant="outline" className="mt-5 w-full" asChild>
                  <Link to={COMPARE_ROUTES[c.slug as keyof typeof COMPARE_ROUTES]}>
                    Read the comparison <ArrowRight className="ml-1.5 size-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Reveal>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What makes Sendloop different</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Most alternatives are excellent at one slice of outbound. Sendloop is built so the whole motion —
              from the first send to the closed reply — happens in one place.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Switching to Sendloop</h2>
        </Reveal>
        <ul className="mt-6 space-y-3">
          {[
            "Export your lists and sequence copy from your current tool.",
            "Connect your mailboxes and pass SPF, DKIM and DMARC checks.",
            "Run warmup in parallel so reputation is never interrupted.",
            "Rebuild sequences, send a test, review unresolved variables, then ramp volume.",
          ].map((step) => (
            <li key={step} className="flex gap-3 text-sm text-muted-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{step}</span>
            </li>
          ))}
        </ul>

        <div className="mt-10 space-y-6">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-sm font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border/70 bg-card p-8 text-center">
          <h2 className="text-xl font-bold tracking-tight">See it for yourself</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Start free, connect a mailbox and run a campaign end to end — sending, replies and pipeline included.
          </p>
          <Button size="lg" className="mt-6" asChild>
            <Link to="/auth">
              Start for Free <ArrowRight className="ml-1.5 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
