import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquareQuote, Send, Star, Users } from "lucide-react";

import { MarketingLayout, CtaBlock } from "@/components/site/MarketingPage";
import { ReviewCard, Stars } from "@/components/reviews/ReviewCard";
import { ReviewCarousel } from "@/components/reviews/ReviewCarousel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { REVIEW_CATEGORIES, compactNumber } from "@/lib/reviews";
import { getReviewStats, listPublicReviews } from "@/lib/testimonials.functions";

const TITLE = "Customer Reviews | Sendloop";
const DESCRIPTION =
  "Read verified Sendloop customer reviews from agencies, SaaS teams, sales teams and recruiters using Sendloop for cold email outreach, deliverability and reply management.";

export const Route = createFileRoute("/customer-reviews")({
  loader: async () => ({
    reviews: await listPublicReviews(),
    stats: await getReviewStats(),
  }),
  head: ({ loaderData }) => {
    const stats = loaderData?.stats;
    const rating = stats?.averageRating ?? null;
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { property: "og:url", content: "/customer-reviews" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "/customer-reviews" }],
      ...(rating && stats && stats.reviews > 0
        ? {
            scripts: [
              {
                type: "application/ld+json",
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "Product",
                  name: "Sendloop",
                  description: DESCRIPTION,
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: rating,
                    reviewCount: stats.reviews,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }),
              },
            ],
          }
        : {}),
    };
  },
  errorComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Customer reviews are unavailable right now</h1>
        <p className="mt-3 text-muted-foreground">Please refresh the page in a moment.</p>
      </div>
    </MarketingLayout>
  ),
  notFoundComponent: () => (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-3xl font-bold">Page not found</h1>
      </div>
    </MarketingLayout>
  ),
  component: CustomerReviewsPage,
});

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: string;
  label: string;
}) {
  return (
    <div className="surface-card px-5 py-4 text-left">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function CustomerReviewsPage() {
  const { reviews, stats } = Route.useLoaderData();
  const [category, setCategory] = useState<string>("all");

  const featured = useMemo(() => reviews.filter((r) => r.featured), [reviews]);
  const available = useMemo(
    () => REVIEW_CATEGORIES.filter((c) => reviews.some((r) => r.category === c.id)),
    [reviews],
  );
  const filtered = useMemo(
    () => (category === "all" ? reviews : reviews.filter((r) => r.category === category)),
    [reviews, category],
  );

  return (
    <MarketingLayout>
      <section className="hero-glow border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <MessageSquareQuote className="size-3.5 text-primary" aria-hidden="true" />
            Customer Reviews
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            What teams say about running outreach on Sendloop
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Every review below comes from a real Sendloop workspace. Nothing here is written by us,
            and the numbers are pulled live from the platform.
          </p>

          {stats.averageRating !== null && stats.reviews > 0 ? (
            <div className="mt-7 flex items-center justify-center gap-3">
              <Stars rating={Math.round(stats.averageRating)} />
              <span className="text-sm font-medium">
                {stats.averageRating.toFixed(1)} average from {stats.reviews}{" "}
                {stats.reviews === 1 ? "review" : "reviews"}
              </span>
            </div>
          ) : null}

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.customers > 0 ? (
              <StatCard icon={Users} value={compactNumber(stats.customers)} label="Workspaces" />
            ) : null}
            {stats.campaigns > 0 ? (
              <StatCard icon={Send} value={compactNumber(stats.campaigns)} label="Campaigns run" />
            ) : null}
            {stats.emailsSent > 0 ? (
              <StatCard
                icon={MessageSquareQuote}
                value={compactNumber(stats.emailsSent)}
                label="Emails delivered"
              />
            ) : null}
            {stats.averageRating !== null ? (
              <StatCard icon={Star} value={`${stats.averageRating.toFixed(1)} / 5`} label="Average rating" />
            ) : null}
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">Start for Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {reviews.length === 0 ? (
        <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
          <h2 className="text-2xl font-semibold">Reviews are on the way</h2>
          <p className="mt-3 text-muted-foreground">
            We only publish reviews written by verified Sendloop customers, so this page stays empty
            until they are collected. Want to share your experience?{" "}
            <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
              Get in touch
            </Link>
            .
          </p>
        </section>
      ) : (
        <>
          {featured.length > 0 ? (
            <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Featured reviews</h2>
              <p className="mt-2 text-muted-foreground">
                Longer stories from teams running Sendloop day to day.
              </p>
              <div className="mt-8 grid gap-6 lg:grid-cols-2">
                {featured.slice(0, 2).map((review) => (
                  <ReviewCard key={review.id} review={review} featured />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">All reviews</h2>
                <p className="mt-2 text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "review" : "reviews"}
                  {category === "all" ? "" : " in this category"}
                </p>
              </div>
              {available.length > 1 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter reviews by industry">
                  {[{ id: "all", label: "All" }, ...available].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                        category === c.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <p className="mt-10 rounded-xl border border-dashed border-border/70 px-6 py-12 text-center text-muted-foreground">
                No reviews in this category yet.
              </p>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </section>

          {reviews.length > 2 ? (
            <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">In their words</h2>
              <p className="mt-2 text-muted-foreground">
                Drag, swipe or use the arrow keys to browse.
              </p>
              <div className="mt-8">
                <ReviewCarousel reviews={reviews} />
              </div>
            </section>
          ) : null}
        </>
      )}

      <CtaBlock
        title="Run your next outreach campaign on Sendloop"
        description="Managed sending infrastructure, warmup, CRM and a unified inbox in one workspace."
        cta="Start for Free"
        secondaryCta="Talk to us"
        secondaryHref="/contact"
      />
    </MarketingLayout>
  );
}
