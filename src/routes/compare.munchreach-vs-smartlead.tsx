import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["munchreach-vs-smartlead"]!;

export const Route = createFileRoute("/compare/munchreach-vs-smartlead")({
  head: () =>
    metaFor(
      "MunchReach vs Smartlead — Campaigns, Deliverability and Inbox Compared",
      "A side-by-side look at MunchReach and Smartlead: sequences, sending infrastructure, deliverability controls, unified inbox, CRM, automations and workspaces.",
      "/compare/munchreach-vs-smartlead",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
