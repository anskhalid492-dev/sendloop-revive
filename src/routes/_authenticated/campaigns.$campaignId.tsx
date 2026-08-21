import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { CampaignHeader, type CampaignTab } from "@/components/campaign/CampaignHeader";
import { OverviewTab } from "@/components/campaign/OverviewTab";
import { LeadsTab } from "@/components/campaign/LeadsTab";
import { SequencesTab } from "@/components/campaign/SequencesTab";
import { AiTab } from "@/components/campaign/AiTab";
import { ScheduleTab } from "@/components/campaign/ScheduleTab";
import { AccountsTab } from "@/components/campaign/AccountsTab";
import { OptionsTab } from "@/components/campaign/OptionsTab";
import { QueueTab } from "@/components/campaign/QueueTab";
import { AnalyticsTab } from "@/components/campaign/AnalyticsTab";
import { CostTab } from "@/components/campaign/CostTab";
import { SettingsTab } from "@/components/campaign/SettingsTab";
import { PreviewDialog, TestSendDialog } from "@/components/campaign/PreviewDialog";
import { useCampaignBuilder } from "@/components/campaign/useCampaignBuilder";
import { duplicateCampaign } from "@/lib/campaigns.functions";
import { takePendingTemplate } from "@/lib/templates-model";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId")({
  head: () => ({
    meta: [
      { title: "Campaign Workspace — MunchReach" },
      {
        name: "description",
        content:
          "Build multi-step cold email sequences, manage leads, schedule sending and track performance in one campaign workspace.",
      },
      { property: "og:title", content: "Campaign Workspace — MunchReach" },
      {
        property: "og:description",
        content: "Sequences, leads, schedule, mailbox rotation and analytics for your campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignWorkspace,
});

function CampaignWorkspace() {
  const { campaignId } = useParams({ from: "/_authenticated/campaigns/$campaignId" });
  const navigate = useNavigate();
  const builder = useCampaignBuilder(campaignId);
  const [tab, setTab] = useState<CampaignTab>("Overview");
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [testStep, setTestStep] = useState<number | null>(null);

  // A template picked in the library is stashed before navigation; drop it into
  // the first email step of this campaign once the builder has hydrated.
  const appliedTemplate = useRef(false);
  const stepCount = builder.steps.length;
  useEffect(() => {
    if (appliedTemplate.current || builder.isLoading || stepCount === 0) return;
    const pending = takePendingTemplate();
    if (!pending) return;
    appliedTemplate.current = true;
    builder.updateSteps((prev) => {
      const index = prev.findIndex((s) => s.stepType === "email");
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { ...next[index]!, subject: pending.subject, body: pending.body };
      return next;
    });
    setTab("Sequences");
    toast.success(`Inserted “${pending.name}” into the first email step`);
  }, [builder, builder.isLoading, stepCount]);

  const duplicateFn = useServerFn(duplicateCampaign);
  const duplicate = useMutation({
    mutationFn: () => duplicateFn({ data: { id: campaignId, includeLeads: false } }),
    onSuccess: (result: { id: string }) => {
      toast.success("Campaign duplicated");
      void navigate({ to: "/campaigns/$campaignId", params: { campaignId: result.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (builder.isLoading || !builder.campaign || !builder.settings) {
    return (
      <AppShell title="Campaign">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={builder.campaign.name}>
      <div className="space-y-6">
        <CampaignHeader
          builder={builder}
          tab={tab}
          onTabChange={setTab}
          onPreview={() => setPreviewStep(0)}
          onTest={() => setTestStep(0)}
          onLaunch={() => builder.launch.mutate()}
          onDuplicate={() => duplicate.mutate()}
          onArchive={() => builder.toggleStatus.mutate("archived")}
        />

        {tab === "Overview" ? <OverviewTab builder={builder} /> : null}
        {tab === "Leads" ? <LeadsTab builder={builder} /> : null}
        {tab === "Sequences" ? (
          <SequencesTab
            builder={builder}
            onPreview={(index) => setPreviewStep(index)}
            onTest={(index) => setTestStep(index)}
          />
        ) : null}
        {tab === "AI" ? <AiTab builder={builder} /> : null}
        {tab === "Schedule" ? <ScheduleTab builder={builder} /> : null}
        {tab === "Email Accounts" ? <AccountsTab builder={builder} /> : null}
        {tab === "Options" ? <OptionsTab builder={builder} /> : null}
        {tab === "Queue" ? <QueueTab builder={builder} /> : null}
        {tab === "Analytics" ? <AnalyticsTab builder={builder} /> : null}
        {tab === "Cost" ? <CostTab builder={builder} /> : null}
        {tab === "Settings" ? <SettingsTab builder={builder} /> : null}
      </div>

      {previewStep !== null ? (
        <PreviewDialog
          builder={builder}
          stepIndex={previewStep}
          open
          onOpenChange={(open) => !open && setPreviewStep(null)}
        />
      ) : null}
      {testStep !== null ? (
        <TestSendDialog
          builder={builder}
          stepIndex={testStep}
          open
          onOpenChange={(open) => !open && setTestStep(null)}
        />
      ) : null}
    </AppShell>
  );
}
