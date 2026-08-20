import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  Flame,
  Inbox,
  Info,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/Reveal";
import { cn } from "@/lib/utils";
import type { Comparison } from "@/lib/comparison-content";

const SECTIONS = [
  { id: "quick", label: "Quick comparison" },
  { id: "features", label: "Feature table" },
  { id: "strengths", label: "Strengths" },
  { id: "who", label: "Who should choose what" },
  { id: "migration", label: "Migration" },
  { id: "faq", label: "FAQ" },
];

const AREA_ICONS: Record<string, typeof Send> = {
  Campaigns: Send,
  "Email sequences": Repeat,
  "AI personalization": Sparkles,
  "Follow-ups": Repeat,
  "Email accounts": Inbox,
  "Domain management": ShieldCheck,
  Warmup: Flame,
  "Deliverability controls": ShieldCheck,
  "Unified Inbox": Inbox,
  CRM: Users,
  Automations: Workflow,
  Analytics: BarChart3,
};

function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0]!.id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

function Section({
  id,
  title,
  description,
  children,
  muted,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section id={id} className={cn("scroll-mt-32 py-14", muted && "bg-secondary/30")}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </Reveal>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function ComparisonPage({ data }: { data: Comparison }) {
  const active = useActiveSection();
  const reviewed = new Date(data.reviewedOn).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/8 via-background to-background py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Info className="size-3.5 text-primary" />
              Comparison · last reviewed {reviewed}
            </p>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              MunchReach vs {data.competitor}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {data.heroSummary}
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                <p className="text-sm font-semibold text-primary">MunchReach is best for</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">{data.sendloopBestFor}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <p className="text-sm font-semibold">{data.competitor} is best for</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {data.competitorBestFor}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Try MunchReach
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">See pricing</Link>
              </Button>
              <a
                href={data.competitorSite}
                target="_blank"
                rel="noreferrer nofollow"
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                Visit {data.competitor}'s site
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Sticky section nav */}
      <nav
        aria-label="Comparison sections"
        className="sticky top-[4.75rem] z-30 border-y border-border/60 bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                active === s.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <Section
        id="quick"
        title="Quick comparison"
        description={`The short version for anyone deciding between MunchReach and ${data.competitor} today.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {data.quick.map((q) => (
            <Reveal key={q.label}>
              <div className="h-full rounded-2xl border border-border/70 bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {q.label}
                </p>
                <p className="mt-3 flex gap-2 text-sm font-semibold">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  MunchReach: {q.sendloop}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.competitor}: {q.competitor}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        id="features"
        title="Feature comparison"
        description={`Capability-by-capability. MunchReach rows describe what is in the product today; ${data.competitor} rows summarise publicly documented capabilities and may change.`}
        muted
      >
        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-2xl border border-border/70 bg-card md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-secondary/50">
                <th scope="col" className="w-56 px-5 py-3 font-semibold">Area</th>
                <th scope="col" className="px-5 py-3 font-semibold text-primary">MunchReach</th>
                <th scope="col" className="px-5 py-3 font-semibold">{data.competitor}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const Icon = AREA_ICONS[row.area];
                return (
                  <tr key={row.area} className="border-t border-border/60 align-top">
                    <th scope="row" className="px-5 py-4 font-semibold">
                      <span className="flex items-center gap-2">
                        {Icon ? <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                        {row.area}
                      </span>
                    </th>
                    <td className="px-5 py-4 leading-relaxed text-foreground/85">{row.sendloop}</td>
                    <td className="px-5 py-4 leading-relaxed text-muted-foreground">{row.competitor}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="grid gap-3 md:hidden">
          {data.rows.map((row) => {
            const Icon = AREA_ICONS[row.area];
            return (
              <div key={row.area} className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
                  {row.area}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary">MunchReach</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{row.sendloop}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {data.competitor}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.competitor}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Competitor information is summarised from public documentation and was last reviewed on{" "}
          {reviewed}. Features and pricing change — always confirm on the vendor's own site.
        </p>
      </Section>

      <Section id="strengths" title={`Where ${data.competitor} is strong`}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <h3 className="text-base font-bold">{data.competitor} strengths</h3>
            <ul className="mt-4 space-y-3">
              {data.competitorStrengths.map((s) => (
                <li key={s} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
            <h3 className="text-base font-bold">Where MunchReach is different</h3>
            <ul className="mt-4 space-y-3">
              {data.sendloopDifferences.map((s) => (
                <li key={s} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="who" title="Who should choose what" muted>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <h3 className="text-base font-bold">Who should choose MunchReach?</h3>
            <ul className="mt-4 space-y-3">
              {data.chooseSendloop.map((s) => (
                <li key={s} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
            <Button className="mt-6" asChild>
              <Link to="/signup">
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-6">
            <h3 className="text-base font-bold">Who should choose {data.competitor}?</h3>
            <ul className="mt-4 space-y-3">
              {data.chooseCompetitor.map((s) => (
                <li key={s} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground">
              Honest answer: if these describe your team, {data.competitor} is likely the better fit.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="migration"
        title="Migration to MunchReach"
        description="Four steps most teams follow when moving an active outbound motion without losing sending reputation."
      >
        <ol className="grid gap-4 sm:grid-cols-2">
          {data.migration.map((m, i) => (
            <Reveal key={m.title} delay={i * 0.05}>
              <li className="h-full rounded-2xl border border-border/70 bg-card p-5">
                <p className="text-sm font-semibold">{m.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">
          Want the detail? Read{" "}
          <Link to="/how-it-works" className="font-medium text-primary underline-offset-4 hover:underline">
            how MunchReach works
          </Link>
          ,{" "}
          <Link to="/deliverability-guide" className="font-medium text-primary underline-offset-4 hover:underline">
            the deliverability guide
          </Link>{" "}
          or{" "}
          <Link to="/product/unified-inbox" className="font-medium text-primary underline-offset-4 hover:underline">
            the unified inbox
          </Link>
          .
        </p>
      </Section>

      <Section id="faq" title="Frequently asked questions" muted>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-border/70 bg-card p-5">
              <h3 className="text-sm font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/12 via-secondary/40 to-background p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              See how MunchReach handles your outbound
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Connect a mailbox, import a list, and run a campaign end to end — sending, replies,
              pipeline and reporting in one workspace.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">
                  Try MunchReach
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/contact">Talk to us</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
