import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Info, Quote, Sparkles } from "lucide-react";

import { MarketingLayout } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { placeholderAvatar } from "@/lib/reviews";
import { listPublicReviews } from "@/lib/testimonials.functions";
import { absoluteUrl } from "@/lib/seo";
import { DEMO_METRICS, SHORT_QUOTES, STORIES, type Story } from "@/lib/demo-stories";

const TITLE = "Customer Stories — MunchReach";
const DESCRIPTION =
  "How teams run campaigns, AI personalization, follow-ups and replies from one outbound platform with MunchReach.";

export const Route = createFileRoute("/customer-reviews")({
  loader: async () => ({ reviews: await listPublicReviews() }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absoluteUrl("/customer-reviews") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/customer-reviews") }],
  }),
  errorComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Customer stories are unavailable right now</h1>
        <p className="mt-3 text-muted-foreground">Please refresh the page in a moment.</p>
      </div>
    </MarketingLayout>
  ),
  component: CustomerReviewsPage,
});

function DemoLabel({ demo, className }: { demo: boolean; className?: string }) {
  if (!demo) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <Info className="size-3" aria-hidden="true" />
      Illustrative example
    </span>
  );
}

function Person({ s }: { s: Story }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={s.avatarUrl || placeholderAvatar(s.avatarSeed)}
        alt=""
        className="size-11 rounded-full bg-secondary object-cover"
        loading="lazy"
      />
      <div>
        <p className="text-sm font-semibold text-foreground">
          {s.name} — {s.role}
        </p>
        <p className="text-xs text-muted-foreground">{s.company}</p>
      </div>
    </div>
  );
}

function FeaturePanel({ s }: { s: Story }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-6">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {s.feature}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.featureText}</p>
      <ul className="mt-4 space-y-2">
        {s.bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm text-foreground/90">
            <Check className="size-4 text-primary" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Layout A: big quote left, feature panel right. */
function SplitStory({ s, flip }: { s: Story; flip?: boolean }) {
  return (
    <div className={cn("grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]", flip && "lg:[&>*:first-child]:order-2 lg:grid-cols-[1fr_1.4fr]")}>
      <Reveal>
        <DemoLabel demo={s.demo} />
        <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{s.headline}</p>
        <blockquote className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
          “{s.quote}”
        </blockquote>
        <div className="mt-6">
          <Person s={s} />
        </div>
      </Reveal>
      <Reveal delay={120}>
        <FeaturePanel s={s} />
      </Reveal>
    </div>
  );
}

/** Layout B: centered oversized quote. */
function CenterStory({ s }: { s: Story }) {
  return (
    <Reveal className="mx-auto max-w-4xl text-center">
      <Quote className="mx-auto size-8 text-primary/60" aria-hidden="true" />
      <DemoLabel demo={s.demo} className="mt-4" />
      <blockquote className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
        “{s.quote}”
      </blockquote>
      <div className="mt-8 flex justify-center">
        <Person s={s} />
      </div>
      <p className="mx-auto mt-6 max-w-xl text-sm text-muted-foreground">
        <span className="font-semibold text-primary">{s.feature}:</span> {s.featureText}
      </p>
    </Reveal>
  );
}

/** Layout C: pair of cards side by side. */
function PairStories({ a, b }: { a: Story; b: Story }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {[a, b].map((s, i) => (
        <Reveal key={s.id} delay={i * 120}>
          <figure className="flex h-full flex-col rounded-2xl border border-border bg-card/60 p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">{s.feature}</span>
              <DemoLabel demo={s.demo} />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-foreground">{s.headline}</h3>
            <blockquote className="mt-3 flex-1 leading-relaxed text-muted-foreground">“{s.quote}”</blockquote>
            <div className="mt-6 border-t border-border pt-5">
              <Person s={s} />
            </div>
          </figure>
        </Reveal>
      ))}
    </div>
  );
}

function CustomerReviewsPage() {
  const { reviews } = Route.useLoaderData();
  const [s1, s2, s3, s4, s5, s6] = STORIES as [Story, Story, Story, Story, Story, Story];

  return (
    <MarketingLayout>
      <div className="dark scroll-smooth bg-background text-foreground">
        {/* Hero */}
        <section className="hero-glow border-b border-border">
          <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 sm:py-32">
            <Reveal>
              <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                Customer stories
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
                Loved by teams building <span className="text-primary">better outbound.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                MunchReach brings campaigns, AI personalization, follow-ups, a unified inbox and your
                whole outreach workflow into one platform.
              </p>
              <Button size="sm" className="mt-8" asChild>
                <Link to="/signup">
                  Start Sending Free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <p className="mt-6 text-xs text-muted-foreground">
                Stories marked “Illustrative example” are demo content, not real customers.
              </p>
            </Reveal>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-28 px-4 py-24 sm:px-6">
          <SplitStory s={s1} />
          <CenterStory s={s2} />
          <SplitStory s={s3} flip />

          {/* Metrics */}
          <section>
            <Reveal className="text-center">
              <DemoLabel demo />
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">What a workspace can look like</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
                Demo figures for illustration only. These are not MunchReach platform totals or
                verified customer results.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DEMO_METRICS.map((m, i) => (
                <Reveal key={m.label} delay={i * 80}>
                  <div className="rounded-2xl border border-border bg-card/60 p-6 text-center">
                    <p className="text-4xl font-bold tracking-tight text-primary">{m.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">Demo metric</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          <PairStories a={s4} b={s5} />

          {/* Short quotes strip */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SHORT_QUOTES.map((q, i) => (
              <Reveal key={q.id} delay={i * 80}>
                <figure className="h-full rounded-2xl border border-border p-5">
                  <blockquote className="font-medium text-foreground">“{q.quote}”</blockquote>
                  <figcaption className="mt-3 text-xs text-muted-foreground">{q.role}</figcaption>
                  {q.demo ? <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground/70">Demo testimonial</p> : null}
                </figure>
              </Reveal>
            ))}
          </section>

          <SplitStory s={s6} />

          {reviews.length > 0 ? (
            <section>
              <Reveal>
                <h2 className="text-3xl font-bold tracking-tight">Verified reviews</h2>
                <p className="mt-2 text-muted-foreground">Written by MunchReach customers.</p>
              </Reveal>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Final CTA */}
        <section className="hero-glow border-t border-border">
          <Reveal className="mx-auto max-w-3xl px-4 py-28 text-center sm:px-6">
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">Make your next campaign your best one.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">Start Sending Free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/" hash="how-it-works">See How It Works</Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </div>
    </MarketingLayout>
  );
}
