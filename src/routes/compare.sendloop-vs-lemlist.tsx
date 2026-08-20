import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["sendloop-vs-lemlist"]!;

export const Route = createFileRoute("/compare/sendloop-vs-lemlist")({
  head: () =>
    metaFor(
      "MunchReach vs lemlist — Email-First Outbound or Multichannel?",
      "Compare MunchReach and lemlist on email outreach, multichannel sequences, AI personalization, deliverability, inbox, CRM, automations and lead data.",
      "/compare/sendloop-vs-lemlist",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
