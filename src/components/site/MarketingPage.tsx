import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, X as XIcon, type LucideIcon } from "lucide-react";

import { SiteHeader } from "@/components/site/SiteHeader";
import { applySeoOverrides } from "@/lib/page-seo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div id="top" className="min-h-screen bg-background">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  highlight,
  description,
  primaryCta = "Start for Free",
  secondaryCta,
  secondaryHref = "#product",
  children,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description: string;
  primaryCta?: string;
  secondaryCta?: string;
  /** Anchor the secondary CTA scrolls to — defaults to the product preview. */
  secondaryHref?: string;
  children?: ReactNode;
}) {
  return (
    <section className="hero-glow relative overflow-hidden border-b border-border/60">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-24">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
          {eyebrow}
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
          {title} {highlight ? <span className="text-gradient">{highlight}</span> : null}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {description}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">{primaryCta}</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/pricing">{secondaryCta ?? "View Pricing"}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Section({
  id,
  title,
  description,
  muted,
  children,
}: {
  id?: string;
  title?: string;
  description?: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={muted ? "border-b border-border/60 bg-secondary/40 py-16" : "py-16"}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {title ? (
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
            {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
          </div>
        ) : null}
        <div className={title ? "mt-10" : ""}>{children}</div>
      </div>
    </section>
  );
}

export type FeatureItem = { icon: LucideIcon; title: string; text: string };

export function FeatureGrid({ items }: { items: FeatureItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="surface-card p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <f.icon className="size-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
        </div>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => (
        <div key={s.title} className="surface-card p-6">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-sm font-semibold text-primary">
            {i + 1}
          </span>
          <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Centered FAQ accordion: one column, readable max width, plus/minus affordance.
 */
export function FaqBlock({
  faqs,
  eyebrow = "FAQ",
  title = "Frequently Asked Questions",
  description = "Everything you need to know about Sendloop.",
}: {
  faqs: { q: string; a: string }[];
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[840px] text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{description}</p>

      <Accordion type="single" collapsible className="mt-10 text-left">
        {faqs.map((f) => (
          <AccordionItem key={f.q} value={f.q} className="border-b border-border/70">
            <AccordionTrigger className="group min-h-14 py-5 text-left text-base font-medium hover:no-underline [&>svg]:hidden">
              <span className="pr-4">{f.q}</span>
              <span
                aria-hidden="true"
                className="relative grid size-6 shrink-0 place-items-center text-primary"
              >
                <span className="absolute h-0.5 w-4 rounded bg-current" />
                <span className="absolute h-4 w-0.5 rounded bg-current transition-transform duration-200 group-data-[state=open]:scale-y-0" />
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-6 text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export function CtaBlock({
  title,
  description,
  cta = "Start for Free",
  secondaryCta,
  secondaryHref = "#product",
}: {
  title: string;
  description: string;
  cta?: string;
  secondaryCta?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="hero-glow surface-card px-6 py-14 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">{cta}</Link>
          </Button>
          {secondaryCta ? (
            <Button size="lg" variant="outline" asChild>
              <a href={secondaryHref}>{secondaryCta}</a>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Full-bleed product preview: the interface is the hero of the section. */
export function BigPreview({
  id = "product",
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border/60 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {title ? (
          <div className="mx-auto max-w-2xl text-center">
            {eyebrow ? (
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {eyebrow}
              </span>
            ) : null}
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
            {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
          </div>
        ) : null}
        <div className="mt-10 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_30px_80px_-50px_hsl(var(--primary)/0.55)]">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Mixed-size bento grid — deliberately not another 3-equal-cards row. */
export function FeatureBento({ items }: { items: FeatureItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      {items.map((f, i) => {
        const span = i === 0 ? "md:col-span-4" : i === 1 ? "md:col-span-2" : i === 2 ? "md:col-span-2" : i === 3 ? "md:col-span-4" : "md:col-span-3";
        return (
          <div key={f.title} className={`surface-card p-6 ${span}`}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <f.icon className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Horizontal workflow strip: step → step → step. */
export function WorkflowStrip({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {steps.map((s, i) => (
        <li key={s.title} className="relative surface-card p-5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Step {i + 1}
          </span>
          <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
          {i < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute right-[-14px] top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-xs text-primary md:grid"
            >
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function Prose({ sections }: { sections: { heading: string; body: string[] }[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      {sections.map((s) => (
        <section key={s.heading} className="mb-10">
          <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function metaFor(
  title: string,
  description: string,
  path?: string,
  faqs?: { q: string; a: string }[],
) {
  const head = {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(path ? [{ property: "og:url", content: path }] : []),
    ],
    ...(path ? { links: [{ rel: "canonical", href: path }] } : {}),
    ...(faqs && faqs.length
      ? {
          scripts: [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            },
          ],
        }
      : {}),
  };
  // Admin-managed SEO records override what the page declares in code.
  return path ? applySeoOverrides(path, head) : head;
}


/* ---------------------------------------------------------------------- */
/* Extended marketing primitives                                           */
/* ---------------------------------------------------------------------- */

export function PainPoints({
  items,
}: {
  items: { icon: LucideIcon; title: string; text: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <div
          key={p.title}
          className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <p.icon className="size-5" />
          </span>
          <h3 className="mt-4 text-base font-semibold">{p.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
        </div>
      ))}
    </div>
  );
}

export function SolutionSplit({
  rows,
}: {
  rows: {
    eyebrow?: string;
    title: string;
    text: string;
    bullets?: string[];
    visual: ReactNode;
  }[];
}) {
  return (
    <div className="space-y-16">
      {rows.map((row, i) => (
        <div
          key={row.title}
          className="grid min-w-0 items-center gap-8 lg:grid-cols-2 lg:gap-14"
        >
          <div className={i % 2 === 1 ? "min-w-0 lg:order-2" : "min-w-0"}>
            {row.eyebrow ? (
              <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                {row.eyebrow}
              </span>
            ) : null}
            <h3 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {row.title}
            </h3>
            <p className="mt-3 text-muted-foreground">{row.text}</p>
            {row.bullets ? (
              <ul className="mt-5 space-y-2.5">
                {row.bullets.map((b) => (
                  <li key={b} className="flex gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={i % 2 === 1 ? "min-w-0 lg:order-1" : "min-w-0"}>{row.visual}</div>
        </div>
      ))}
    </div>
  );
}

export function StatStrip({
  stats,
}: {
  stats: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border bg-card p-6 text-center">
          <div className="text-3xl font-extrabold tracking-tight text-primary">{s.value}</div>
          <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export function MockPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="browser-frame min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-primary/30" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-3 truncate text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="bg-card p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function MockRows({
  rows,
}: {
  rows: { left: string; right?: string; badge?: string; muted?: string }[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.left + (r.right ?? "")}
          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3.5 py-3"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{r.left}</div>
            {r.muted ? (
              <div className="truncate text-xs text-muted-foreground">{r.muted}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.badge ? (
              <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                {r.badge}
              </span>
            ) : null}
            {r.right ? (
              <span className="text-xs text-muted-foreground">{r.right}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MockBars({
  bars,
}: {
  bars: { label: string; value: number; caption?: string }[];
}) {
  return (
    <div className="space-y-3.5">
      {bars.map((b) => (
        <div key={b.label}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium">{b.label}</span>
            <span className="shrink-0 text-muted-foreground">{b.caption ?? `${b.value}%`}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(2, b.value))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QuoteBlock({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <figure className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center">
      <blockquote className="text-lg font-medium text-balance sm:text-xl">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="mt-5 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{name}</span> — {role}
      </figcaption>
    </figure>
  );
}

export function ResourceList({
  items,
}: {
  items: { title: string; text: string; meta?: string; to?: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((r) => (
        <div key={r.title} className="surface-card flex h-full flex-col p-6">
          {r.meta ? (
            <span className="text-xs font-medium tracking-wide text-primary uppercase">
              {r.meta}
            </span>
          ) : null}
          <h3 className="mt-2 text-base font-semibold">{r.title}</h3>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">{r.text}</p>
        </div>
      ))}
    </div>
  );
}

export function DocSection({
  groups,
}: {
  groups: { title: string; items: string[] }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.title} className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-base font-semibold">{g.title}</h3>
          <ul className="mt-3 space-y-2">
            {g.items.map((i) => (
              <li key={i} className="text-sm text-muted-foreground">
                {i}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }),
  };
}


/** Side-by-side "life before / life after" contrast block. */
export function BeforeAfter({
  beforeTitle = "Without Sendloop",
  afterTitle = "With Sendloop",
  before,
  after,
}: {
  beforeTitle?: string;
  afterTitle?: string;
  before: string[];
  after: string[];
}) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-border bg-muted/40 p-6">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {beforeTitle}
        </h3>
        <ul className="mt-4 space-y-3">
          {before.map((b) => (
            <li key={b} className="flex gap-3 text-sm text-muted-foreground">
              <XIcon className="mt-0.5 size-4 shrink-0 text-destructive/70" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0 rounded-2xl border border-primary/30 bg-primary/[0.04] p-6">
        <h3 className="text-sm font-semibold tracking-wide text-primary uppercase">
          {afterTitle}
        </h3>
        <ul className="mt-4 space-y-3">
          {after.map((b) => (
            <li key={b} className="flex gap-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-foreground/90">{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Who this is for — concrete scenarios with the outcome each team gets. */
export function UseCaseGrid({
  items,
}: {
  items: { icon?: LucideIcon; audience: string; scenario: string; outcome: string }[];
}) {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.audience}
          className="min-w-0 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
        >
          {item.icon ? (
            <span className="mb-4 inline-flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <item.icon className="size-4" />
            </span>
          ) : null}
          <h3 className="text-base font-semibold">{item.audience}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{item.scenario}</p>
          <p className="mt-4 border-t border-border/70 pt-3 text-sm font-medium text-primary">
            {item.outcome}
          </p>
        </div>
      ))}
    </div>
  );
}
