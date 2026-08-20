import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import { ComparisonPage } from "@/components/site/ComparisonPage";
import { COMPARISONS } from "@/lib/comparison-content";

const data = COMPARISONS["sendloop-vs-smartlead"]!;

export const Route = createFileRoute("/compare/sendloop-vs-smartlead")({
  head: () =>
    metaFor(
      "Sendloop vs Smartlead — Campaigns, Deliverability and Inbox Compared",
      "A side-by-side look at Sendloop and Smartlead: sequences, sending infrastructure, deliverability controls, unified inbox, CRM, automations and workspaces.",
      "/compare/sendloop-vs-smartlead",
      data.faqs,
    ),
  component: () => (
    <MarketingLayout>
      <ComparisonPage data={data} />
    </MarketingLayout>
  ),
});
