import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["sendloop-vs-instantly"]!;

export const Route = createFileRoute("/compare/sendloop-vs-instantly")({
  head: () =>
    metaFor(
      "MunchReach vs Instantly — Honest Cold Email Platform Comparison",
      "Compare MunchReach and Instantly across campaigns, sending infrastructure, warmup, unified inbox, CRM, automations and analytics. Reviewed August 2026.",
      "/compare/sendloop-vs-instantly",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
