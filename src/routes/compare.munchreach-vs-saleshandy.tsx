import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["munchreach-vs-saleshandy"]!;

export const Route = createFileRoute("/compare/munchreach-vs-saleshandy")({
  head: () =>
    metaFor(
      "MunchReach vs Saleshandy — Cold Email Compared",
      "Compare MunchReach and Saleshandy on sequences, mailbox rotation, warmup, deliverability controls, unified inbox, CRM, automations and reporting.",
      "/compare/munchreach-vs-saleshandy",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
