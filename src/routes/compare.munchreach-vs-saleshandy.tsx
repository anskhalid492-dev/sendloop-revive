import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["sendloop-vs-saleshandy"]!;

export const Route = createFileRoute("/compare/sendloop-vs-saleshandy")({
  head: () =>
    metaFor(
      "MunchReach vs Saleshandy — Cold Email Platform Comparison",
      "Compare MunchReach and Saleshandy on sequences, mailbox rotation, warmup, deliverability controls, unified inbox, CRM, automations and reporting.",
      "/compare/sendloop-vs-saleshandy",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
