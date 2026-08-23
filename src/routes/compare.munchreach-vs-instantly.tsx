import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["munchreach-vs-instantly"]!;

export const Route = createFileRoute("/compare/munchreach-vs-instantly")({
  head: () =>
    metaFor(
      "MunchReach vs Instantly — Cold Email Comparison",
      "Compare campaigns, sending infrastructure, warmup, unified inbox, CRM, automations and analytics before picking a platform.",
      "/compare/munchreach-vs-instantly",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
