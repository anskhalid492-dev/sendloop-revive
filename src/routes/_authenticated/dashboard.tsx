import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import {
  Contact,
  Flame,
  Inbox,
  PenLine,
  RefreshCw,
  Send,
  Upload,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { SetupJourney } from "@/components/app/SetupJourney";
import { getSetupProgress } from "@/lib/setup-progress.functions";
import { countCompleted } from "@/lib/setup-journey";
import { KpiBoard } from "@/components/dashboard/command/KpiBoard";
import { ActivityChart } from "@/components/dashboard/command/ActivityChart";
import { CampaignTable } from "@/components/dashboard/command/CampaignTable";
import {
  FunnelPanel,
  MailboxTable,
  SendingHealthPanel,
  TopCampaigns,
} from "@/components/dashboard/command/HealthPanels";
import {
  ActionCenter,
  ActivityFeed,
  InsightsPanel,
  RepliesPanel,
} from "@/components/dashboard/command/SidePanels";
import {
  EmptyState,
  Panel,
  PanelLink,
  SkeletonRows,
} from "@/components/dashboard/command/primitives";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAnalyticsRealtime } from "@/hooks/useAnalyticsRealtime";
import { analyticsKeys, liveQueryOptions } from "@/lib/analytics-query";
import { getCommandCenter } from "@/lib/dashboard-command.functions";
import { dismissChecklist } from "@/lib/profile.functions";
import { getMyProfile } from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MunchReach Outbound Command Center" },
      {
        name: "description",
        content:
          "Your MunchReach outbound command center: today's sends, replies and meetings, campaign run states, mailbox capacity and everything that needs attention.",
      },
      { property: "og:title", content: "MunchReach Outbound Command Center" },
      {
        property: "og:description",
        content:
          "Today's sending, campaign run states, mailbox health and reply performance in one view.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const QUICK_ACTIONS = [
  { label: "New campaign", to: "/campaigns", icon: Send, primary: true },
  { label: "Import leads", to: "/leads", icon: Upload },
  { label: "Open inbox", to: "/inbox", icon: Inbox },
  { label: "Templates", to: "/templates", icon: PenLine },
  { label: "Warmup", to: "/warmup", icon: Flame },
  { label: "CRM pipeline", to: "/crm", icon: Contact },
] as const;

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace, isLoading: loadingWorkspaces, workspaces } = useWorkspace();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchCommand = useServerFn(getCommandCenter);
  const dismiss = useServerFn(dismissChecklist);
  const [days, setDays] = useState(30);
  const [now] = useState(() => new Date());

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  useEffect(() => {
    if (!loadingWorkspaces && workspaces.length === 0) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loadingWorkspaces, workspaces, navigate]);

  const workspaceId = workspace?.id;

  // Live invalidation: any send/engagement/reply/campaign change refetches.
  useAnalyticsRealtime(workspaceId ?? null);

  const command = useQuery({
    queryKey: analyticsKeys.commandCenter(workspaceId ?? null, days),
    enabled: Boolean(workspaceId),
    queryFn: () => fetchCommand({ data: { workspaceId: workspaceId as string, days } }),
    ...liveQueryOptions(),
  });

  const fetchSetup = useServerFn(getSetupProgress);
  const setupProgress = useQuery({
    queryKey: ["setup-progress", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchSetup({ data: { workspaceId: workspaceId as string } }),
  });

  const dismissMutation = useMutation({
    mutationFn: dismiss,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  const setupComplete = setupProgress.data ? countCompleted(setupProgress.data) === 7 : false;
  const showChecklist =
    !(workspace as { checklist_dismissed?: boolean } | null)?.checklist_dismissed && !setupComplete;

  const firstName = profile.data?.full_name?.split(" ")[0];
  const data = command.data ?? null;
  const loading = command.isLoading;
  const hasCampaigns = (data?.totals.campaigns ?? 0) > 0;

  return (
    <AppShell
      title={workspace ? workspace.name : "Dashboard"}
      description="Outbound command center"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => command.refetch()}
            disabled={command.isFetching}
          >
            <RefreshCw className={command.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link to="/campaigns">
              <Send className="size-4" /> New campaign
            </Link>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-[1400px] space-y-10 pb-6">
        {/* 1. Header */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <h2 className="text-[26px] font-bold leading-tight tracking-tight">
              {greeting(now)}
              {firstName ? `, ${firstName}` : ""}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {workspace ? `${workspace.name} · ` : ""}
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              {data ? ` · sending day in ${data.timezone}` : ""}
            </p>
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-wrap items-center gap-2 lg:flex-nowrap"
          >
            {QUICK_ACTIONS.map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + 0.03 * i }}
                whileHover={{ y: -1 }}
              >
                <Button
                  asChild
                  variant={"primary" in action && action.primary ? "default" : "outline"}
                  size="sm"
                  className="h-9 gap-2 text-xs"
                >
                  <Link to={action.to}>
                    <action.icon className="size-3.5 shrink-0" />
                    <span>{action.label}</span>
                  </Link>
                </Button>
              </motion.div>
            ))}
          </motion.div>
        </motion.header>

        <AnimatePresence>
          {showChecklist ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
            >
              <SetupJourney
                progress={setupProgress.data}
                loading={setupProgress.isLoading}
                variant="compact"
                onDismiss={() => workspaceId && dismissMutation.mutate({ data: { workspaceId } })}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 2. Today's outbound overview */}
        <Panel
          title="Today's outbound"
          description="Scoped to the current sending day and compared with yesterday. Lifetime totals live in the campaign table."
          bare
        >
          <KpiBoard today={data?.today ?? null} yesterday={data?.yesterday ?? null} loading={loading} />
        </Panel>

        {/* 3 + 6. Activity chart and action center */}
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ActivityChart
              data={data?.series ?? []}
              days={days}
              onDaysChange={setDays}
              loading={loading}
            />
          </div>
          <Panel
            title="Needs your attention"
            description="Blocked mailboxes, unverified domains, stalled campaigns and unread replies."
          >
            {loading ? <SkeletonRows rows={4} height={72} /> : <ActionCenter items={data?.actions ?? []} />}
          </Panel>
        </div>

        {/* 5. Sending health */}
        <Panel
          title="Sending health"
          description="Mailbox mix, domain readiness and remaining capacity in the rolling 12-hour window."
          action={<PanelLink to="/warmup" label="Manage mailboxes" />}
        >
          {loading || !data ? (
            <SkeletonRows rows={1} height={168} />
          ) : (
            <SendingHealthPanel health={data.health} />
          )}
        </Panel>

        {/* 4. Campaign performance */}
        <Panel
          title="Campaign performance"
          description="Run state comes from the scheduler — a campaign that only used today's quota is never marked completed."
          action={<PanelLink to="/campaigns" label="All campaigns" />}
        >
          <CampaignTable rows={data?.campaigns ?? []} loading={loading} />
        </Panel>

        {/* 7 + 10. Insights and top campaigns */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Insights" description="Observations generated from your own results.">
            {loading ? <SkeletonRows rows={3} height={56} /> : <InsightsPanel insights={data?.insights ?? []} />}
          </Panel>
          <Panel
            title="Top campaigns"
            description="Ranked by reply rate across the selected window."
            action={<PanelLink to="/analytics" label="Analytics" />}
          >
            {loading ? <SkeletonRows rows={4} height={64} /> : <TopCampaigns rows={data?.topCampaigns ?? []} />}
          </Panel>
        </div>

        {/* 8 + 12. Replies and funnel */}
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Panel
              title="Recent replies"
              description="Latest inbound messages from your prospects."
              action={<PanelLink to="/inbox" label="Open inbox" />}
            >
              {loading ? <SkeletonRows rows={4} height={92} /> : <RepliesPanel replies={data?.recentReplies ?? []} />}
            </Panel>
          </div>
          <Panel
            title="Lead funnel"
            description="How leads convert into conversations and meetings."
            action={<PanelLink to="/leads" label="Leads" />}
          >
            {loading ? <SkeletonRows rows={1} height={240} /> : <FunnelPanel steps={data?.funnel ?? []} />}
          </Panel>
        </div>

        {/* 11. Mailbox performance */}
        <Panel
          title="Mailbox performance"
          description="Per-mailbox deliverability and remaining capacity."
          action={<PanelLink to="/sending" label="Email accounts" />}
        >
          {loading ? <SkeletonRows rows={4} height={64} /> : <MailboxTable rows={data?.mailboxes ?? []} />}
        </Panel>

        {/* 9. Recent activity */}
        <Panel title="Recent activity" description="A chronological trail of what happened in this workspace.">
          {loading ? (
            <SkeletonRows rows={5} height={56} />
          ) : hasCampaigns || (data?.activity.length ?? 0) > 0 ? (
            <ActivityFeed rows={data?.activity ?? []} />
          ) : (
            <EmptyState
              icon={Users}
              title="Your workspace is quiet"
              body="Import leads and launch your first campaign — activity will start streaming in here."
              ctaLabel="Import leads"
              to="/leads"
            />
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
