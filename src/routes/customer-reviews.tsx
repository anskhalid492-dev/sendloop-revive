import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Quote } from "lucide-react";

import { MarketingLayout } from "@/components/site/MarketingPage";
import { Reveal } from "@/components/site/Reveal";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { Button } from "@/components/ui/button";
import { placeholderAvatar } from "@/lib/reviews";
import { getReviewStats, listPublicReviews } from "@/lib/testimonials.functions";
import { absoluteUrl } from "@/lib/seo";

const TITLE = "Customer Stories — MunchReach";
const DESCRIPTION =
  "How teams run campaigns, AI personalization, follow-ups and replies from one outbound platform with MunchReach.";

export const Route = createFileRoute("/customer-reviews")({
  loader: async () => {
    const [reviews, stats] = await Promise.all([listPublicReviews(), getReviewStats()]);
    return { reviews, stats };
  },
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

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M+`
    : n >= 1_000
      ? `${Math.floor(n / 1_000)}K+`
      : `${n}`;

function CustomerReviewsPage() {
  const { reviews, stats } = Route.useLoaderData();
  const cards = reviews.slice(0, 9);
  const spotlight = reviews.find((r) => r.featured) ?? reviews[0];
  void stats;
  const metrics = [
    { label: "Cold emails sent", value: "30M+" },
    { label: "Campaigns created", value: "3k+" },
    { label: "Teams on MunchReach", value: "231" },
    { label: "Customer Reviews", value: "10" },
  ];
  const fmt = (v: string) => v;

  return (
    <MarketingLayout>
      <div className="dark scroll-smooth bg-background text-foreground">
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
            </Reveal>
          </div>
        </section>

        <div className="mx-auto max-w-6xl space-y-24 px-4 py-24 sm:px-6">
          {metrics.length > 0 ? (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metrics.map((m, i) => (
                <Reveal key={m.label} delay={i * 80}>
                  <div className="rounded-2xl border border-border bg-card/60 p-6 text-center">
                    <p className="text-4xl font-bold tracking-tight text-primary">{fmt(m.value)}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
                  </div>
                </Reveal>
              ))}
            </section>
          ) : null}

          {spotlight ? (
            <Reveal className="mx-auto max-w-4xl text-center">
              <Quote className="mx-auto size-8 text-primary/60" aria-hidden="true" />
              <blockquote className="mt-5 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
                “{spotlight.testimonial}”
              </blockquote>
              <div className="mt-8 flex items-center justify-center gap-3">
                <img
                  src={spotlight.avatar_url || placeholderAvatar(spotlight.name)}
                  alt=""
                  className="size-11 rounded-full bg-secondary object-cover"
                  loading="lazy"
                />
                <div className="text-left">
                  <p className="text-sm font-semibold">{spotlight.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[spotlight.role, spotlight.company].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            </Reveal>
          ) : null}

          {cards.length > 0 ? (
            <section>
              <Reveal>
                <h2 className="text-3xl font-bold tracking-tight">Verified reviews</h2>
                <p className="mt-2 text-muted-foreground">Written by MunchReach customers.</p>
              </Reveal>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((r) => (
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
