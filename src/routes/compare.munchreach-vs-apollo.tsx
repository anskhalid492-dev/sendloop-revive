import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["munchreach-vs-apollo"]!;

export const Route = createFileRoute("/compare/munchreach-vs-apollo")({
  head: () =>
    metaFor(
      "MunchReach vs Apollo — Cold Email or Contact Data?",
      "Compare MunchReach and Apollo on cold email sending, deliverability and warmup, unified inbox, CRM, automations, analytics and prospect data.",
      "/compare/munchreach-vs-apollo",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
