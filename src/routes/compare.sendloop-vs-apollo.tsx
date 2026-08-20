import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["sendloop-vs-apollo"]!;

export const Route = createFileRoute("/compare/sendloop-vs-apollo")({
  head: () =>
    metaFor(
      "Sendloop vs Apollo — Email Execution or Contact Database?",
      "Compare Sendloop and Apollo on cold email sending, deliverability and warmup, unified inbox, CRM, automations, analytics and prospect data.",
      "/compare/sendloop-vs-apollo",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
