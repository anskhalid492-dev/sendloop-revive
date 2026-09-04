import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import {
  CtaBlock,
  MarketingLayout,
  PageHero,
  Section,
  metaFor,
} from "@/components/site/MarketingPage";
import { solutions } from "@/lib/solutions-content";

export const Route = createFileRoute("/solutions/")({
  head: () =>
    metaFor(
      "Solutions by Team and Use Case | MunchReach",
      "See how agencies, sales teams, lead generation teams, recruiters, SaaS companies, consultants, founders and marketing agencies run outbound with MunchReach.",
      "/solutions",
    ),
  component: SolutionsIndex,
});

function SolutionsIndex() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Solutions"
        title="One outbound platform,"
        highlight="eight ways to run it"
        description="MunchReach brings leads, campaigns, sequences, sending accounts, replies and analytics into one workspace. Pick the way your team works to see how it fits."
        primaryCta="Start Free"
        secondaryCta="View Pricing"
      />

      <Section title="By use case" description="Choose the team closest to how you run outreach.">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2">
          {solutions.map((s) => (
            <Link
              key={s.slug}
              to="/solutions/$slug"
              params={{ slug: s.slug }}
              className="group bg-background p-7 transition-colors hover:bg-secondary/50"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-bold tracking-tight">{s.nav}</h3>
                <ArrowRight className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-1" />
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{s.navText}</p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground/90">{s.description}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CtaBlock
        title="Ready to run outbound from one place?"
        description="Create your workspace, import your first list and launch a campaign today."
        cta="Get Started"
        secondaryCta="View Pricing"
        secondaryHref="/pricing"
      />
    </MarketingLayout>
  );
}
