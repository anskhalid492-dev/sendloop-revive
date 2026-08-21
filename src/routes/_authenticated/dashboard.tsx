import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, PenLine, Send, Upload, Users } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { SetupJourney } from "@/components/app/SetupJourney";
import { getSetupProgress } from "@/lib/setup-progress.functions";
import { countCompleted } from "@/lib/setup-journey";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { OutreachGraph } from "@/components/dashboard/OutreachGraph";
import { CampaignPerformance } from "@/components/dashboard/CampaignPerformance";
import { RecentRepliesCard } from "@/components/dashboard/RecentRepliesCard";
import { SendingHealthCard } from "@/components/dashboard/SendingHealthCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getDashboardOverview, getDashboardPulse } from "@/lib/dashboard.functions";
import { dismissChecklist } from "@/lib/profile.functions";
import { getMyProfile } from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — MunchReach Cold Email Workspace" },
      {
        name: "description",
        content:
          "Your MunchReach workspace overview: emails sent, replies, positive replies and meetings booked, plus campaign performance at a glance.",
      },
      { property: "og:title", content: "MunchReach Dashboard" },
      {
        property: "og:description",
        content: "Campaign activity and reply performance at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const QUICK_ACTIONS = [
  { label: "Import leads", to: "/leads", icon: Upload },
  { label: "Open inbox", to: "/inbox", icon: Inbox },
  { label: "Templates", to: "/templates", icon: PenLine },
  { label: "CRM pipeline", to: "/crm", icon: Users },
] as const;

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
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
  const fetchOverview = useServerFn(getDashboardOverview);
  const fetchPulse = useServerFn(getDashboardPulse);
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

  const overview = useQuery({
    queryKey: ["dashboard", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchOverview({ data: { workspaceId: workspaceId as string } }),
  });

  const pulse = useQuery({
    queryKey: ["dashboard-pulse", workspaceId, days],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchPulse({ data: { workspaceId: workspaceId as string, days } }),
    refetchInterval: 60_000,
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
    !(workspace as { checklist_dismissed?: boolean } | null)?.checklist_dismissed &&
    !setupComplete;

  const firstName = profile.data?.full_name?.split(" ")[0];

  return (
    <AppShell
      title={workspace ? workspace.name : "Dashboard"}
      description="Workspace overview"
      actions={
        <>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild size="sm">
            <Link to="/campaigns">
              <Send className="size-4" /> New campaign
            </Link>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-7xl space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
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
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                whileHover={{ y: -2 }}
              >
                <Button asChild variant="outline" size="sm" className="h-9 text-xs">
                  <Link to={action.to}>
                    <action.icon className="size-3.5" /> {action.label}
                  </Link>
                </Button>
              </motion.div>
            ))}
          </div>
        </motion.div>

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
                onDismiss={() =>
                  workspaceId && dismissMutation.mutate({ data: { workspaceId } })
                }
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold tracking-tight">Performance summary</h3>
            <span className="text-xs text-muted-foreground">
              Compared with the previous {days} days
            </span>
          </div>
          <KpiGrid
            loading={pulse.isLoading}
            current={pulse.data?.current ?? null}
            previous={pulse.data?.previous ?? null}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <OutreachGraph
              data={pulse.data?.series ?? []}
              days={days}
              onDaysChange={setDays}
              loading={pulse.isLoading}
            />
          </div>
          <SendingHealthCard
            health={overview.data?.sending ?? null}
            loading={overview.isLoading}
          />
        </div>

        <CampaignPerformance rows={pulse.data?.campaigns ?? []} loading={pulse.isLoading} />

        <div className="grid gap-6 lg:grid-cols-2">
          <RecentRepliesCard
            replies={pulse.data?.recentReplies ?? []}
            loading={pulse.isLoading}
          />
          <ActivityFeed items={overview.data?.activity ?? []} loading={overview.isLoading} />
        </div>
      </div>
    </AppShell>
  );
}
