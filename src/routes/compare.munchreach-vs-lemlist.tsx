import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["munchreach-vs-lemlist"]!;

export const Route = createFileRoute("/compare/munchreach-vs-lemlist")({
  head: () =>
    metaFor(
      "MunchReach vs lemlist — Email-First or Multichannel?",
      "Compare MunchReach and lemlist on email outreach, multichannel sequences, AI personalization, deliverability, inbox, CRM, automations and lead data.",
      "/compare/munchreach-vs-lemlist",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
