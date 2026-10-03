import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/app/admin/OutreachUI";
import { SalesAgentMonitoring } from "@/components/admin/SalesAgentMonitoring";

export const Route = createFileRoute("/_authenticated/mranuskhalid/ai-sales-agent")({
  head: () => ({
    meta: [
      { title: "AI Sales Agent — MunchReach Admin" },
      { name: "description", content: "Platform-wide monitoring for the MunchReach AI Sales Agent: requests, success rate, response time, usage, outcomes and failures." },
      { property: "og:title", content: "AI Sales Agent — MunchReach Admin" },
      { property: "og:description", content: "Admin monitoring for the MunchReach-owned AI Sales Agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <AdminPageHeader
        title="AI Sales Agent"
        description="Usage of the MunchReach-owned AI used by AI Decision and Generate AI Reply in workflows. Customer-key AI (Campaign Writer, Personalization, Inbox AI Reply) is not included."
      />
      <SalesAgentMonitoring />
    </div>
  ),
});
