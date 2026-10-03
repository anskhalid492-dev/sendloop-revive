import { createFileRoute } from "@tanstack/react-router";

import { AdminPageHeader } from "@/components/app/admin/OutreachUI";
import { SalesAgentProviderSettings } from "@/components/admin/SalesAgentProviderSettings";

export const Route = createFileRoute("/_authenticated/mranuskhalid/ai-provider")({
  head: () => ({
    meta: [
      { title: "AI Provider — MunchReach Admin" },
      { name: "description", content: "Configure the MunchReach-owned OpenAI or Anthropic provider used by the AI Sales Agent." },
      { property: "og:title", content: "AI Provider — MunchReach Admin" },
      { property: "og:description", content: "Super-admin configuration for the AI Sales Agent provider." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <AdminPageHeader
        title="AI Provider"
        description="The single MunchReach-owned AI provider used by AI Decision and Generate AI Reply. Customer AI features (Campaign Writer, Personalization, Inbox AI Reply) keep their own keys."
      />
      <SalesAgentProviderSettings />
    </div>
  ),
});
