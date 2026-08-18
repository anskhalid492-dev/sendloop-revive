import { createFileRoute, notFound, Link } from "@tanstack/react-router";

import {
  CtaBlock,
  FaqBlock,
  FeatureGrid,
  MarketingLayout,
  PageHero,
  PainPoints,
  Section,
  StepList,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";
import { Button } from "@/components/ui/button";
import { solutionsBySlug } from "@/lib/solutions-content";

export const Route = createFileRoute("/solutions/$slug")({
  loader: ({ params }) => {
    const content = solutionsBySlug[params.slug];
    if (!content) throw notFound();
    return { slug: params.slug };
  },
  head: ({ params }) => {
    const content = solutionsBySlug[params.slug];
    if (!content) {
      return {
        meta: [{ title: "Solution not found — Sendloop" }, { name: "robots", content: "noindex" }],
      };
    }
    return metaFor(
      `${content.nav} — Cold Email Outreach | Sendloop`,
      content.description,
      `https://sendloop.lovable.app/solutions/${content.slug}`,
      content.faqs,
    );
  },
  notFoundComponent: SolutionNotFound,
  component: SolutionPage,
});

function SolutionNotFound() {
  return (
    <MarketingLayout>
      <div className="mx-auto max-w-xl px-4 py-28 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Solution not found</h1>
        <p className="mt-3 text-muted-foreground">
          That page does not exist. Explore what Sendloop can do instead.
        </p>
        <Button className="mt-8" asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </MarketingLayout>
  );
}

function SolutionPage() {
  const { slug } = Route.useLoaderData();
  const content = solutionsBySlug[slug];
  if (!content) return <SolutionNotFound />;

  return (
    <MarketingLayout>
      <PageHero
        eyebrow={content.eyebrow}
        title={content.title}
        highlight={content.highlight}
        description={content.description}
        secondaryCta="View Pricing"
      />

      <Section
        title="What gets in the way today"
        description="The problems outbound teams run into before they have one system."
        muted
      >
        <PainPoints items={content.pains} />
      </Section>

      <Section
        title="How Sendloop solves it"
        description="Everything you need to run outreach, without touching email infrastructure."
      >
        <FeatureGrid items={content.features} />
      </Section>

      <Section description="Live in an afternoon." muted>
        <StepList steps={content.steps} />
      </Section>

      <Section>
        <FaqBlock faqs={content.faqs} title="How it works" />
      </Section>

      <TestimonialCarousel page="solutions" />

      <CtaBlock
        title="Ready to turn cold email into conversations?"
        description="Create your workspace, launch your first campaign, and let Sendloop handle the rest."
        cta="Start for Free"
        secondaryCta="View Pricing"
        secondaryHref="/pricing"
      />
    </MarketingLayout>
  );
}
