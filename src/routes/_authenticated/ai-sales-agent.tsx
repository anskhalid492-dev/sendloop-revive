import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { SalesAgentSettingsPanel } from "@/components/automations/SalesAgentSettingsPanel";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/ai-sales-agent")({
  head: () => ({
    meta: [
      { title: "AI Sales Agent — MunchReach" },
      { name: "description", content: "Set the tone, instructions, safety rules and confidence your AI Sales Agent uses in workflows." },
      { property: "og:title", content: "AI Sales Agent — MunchReach" },
      { property: "og:description", content: "Configure the AI Sales Agent used by AI Decision and Generate AI Reply steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiSalesAgentPage,
});

function AiSalesAgentPage() {
  const { workspace } = useWorkspace();
  return (
    <AppShell title="AI Sales Agent" description="How AI reads conversations, chooses paths and drafts replies in your workflows.">
      {workspace?.id ? <SalesAgentSettingsPanel workspaceId={workspace.id} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
    </AppShell>
  );
}
