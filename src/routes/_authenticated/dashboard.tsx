import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Inbox,
  PenLine,
  Send,
  Upload,
  X,
} from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { SetupJourney } from "@/components/app/SetupJourney";
import { getSetupProgress } from "@/lib/setup-progress.functions";
import { countCompleted } from "@/lib/setup-journey";
import { MetricCards } from "@/components/dashboard/MetricCards";

import { OutreachGraph } from "@/components/dashboard/OutreachGraph";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  getDashboardOverview,
  getDashboardPulse,
} from "@/lib/dashboard.functions";
import { REPLY_SENTIMENT_LABELS } from "@/lib/reply-model";
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
  { label: "Create campaign", to: "/campaigns", icon: Send },
  { label: "Import leads", to: "/leads", icon: Upload },
  { label: "Compose email", to: "/inbox", icon: PenLine },
  { label: "View inbox", to: "/inbox", icon: Inbox },
] as const;

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function relative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString();
}

const SENTIMENT_TONE: Record<string, string> = {
  positive: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
  negative: "bg-destructive/10 text-destructive",
  out_of_office: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

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

  const m = overview.data?.metrics;
  const sending = overview.data?.sending;
  const setupComplete = setupProgress.data ? countCompleted(setupProgress.data) === 7 : false;
  const showChecklist =
    !(workspace as { checklist_dismissed?: boolean } | null)?.checklist_dismissed &&
    !setupComplete;


  const firstName = profile.data?.full_name?.split(" ")[0];
  const capacity = sending?.dailyCapacity ?? 0;
  const usedCapacity = capacity ? Math.round(((sending?.sentToday ?? 0) / capacity) * 100) : 0;

  return (
    <AppShell
      title={workspace ? workspace.name : "Dashboard"}
      description="Workspace overview"
      actions={
        <>
          <Button asChild size="sm">
            <Link to="/campaigns">
              <Send className="size-4" /> New campaign
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/leads">Import leads</Link>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h2 className="text-2xl font-bold tracking-tight">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ""}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your outreach ·{" "}
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
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


        <MetricCards
          loading={pulse.isLoading}
          current={pulse.data?.current ?? null}
          previous={pulse.data?.previous ?? null}
          replyRate={m?.replyRate ?? 0}
        />

        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action, i) => (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              whileHover={{ y: -2 }}
            >
              <Button asChild variant="outline" size="sm">
                <Link to={action.to}>
                  <action.icon className="size-4" /> {action.label}
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <OutreachGraph
              data={pulse.data?.series ?? []}
              days={days}
              onDaysChange={setDays}
              loading={pulse.isLoading}
            />
          </div>

          <div className="surface-card p-6">
            <h3 className="text-lg font-semibold">Sending health</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Managed mailboxes assigned to this workspace.
            </p>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Overall health</span>
                  <span className="font-medium">{sending?.overallHealth ?? 0}%</span>
                </div>
                <Progress value={sending?.overallHealth ?? 0} className="mt-1.5 h-2" />
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Daily capacity used</span>
                  <span className="font-medium">
                    {sending?.sentToday ?? 0} / {capacity}
                  </span>
                </div>
                <Progress value={usedCapacity} className="mt-1.5 h-2" />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                {[
                  { label: "Healthy", value: sending?.healthy ?? 0 },
                  { label: "Warming", value: sending?.warming ?? 0 },
                  { label: "Attention", value: sending?.attention ?? 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border p-2">
                    <div className="text-base font-semibold">{item.value}</div>
                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
              {(sending?.total ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No mailboxes assigned yet — MunchReach provisions them when your first campaign
                  launches.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="surface-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Campaign performance</h3>
              <Link
                to="/campaigns"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View all <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
            {overview.data?.campaigns.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Campaign</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 text-right font-medium">Leads</th>
                      <th className="pb-2 text-right font-medium">Sent</th>
                      <th className="pb-2 text-right font-medium">Replies</th>
                      <th className="pb-2 text-right font-medium">Reply rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.data.campaigns.map((c, i) => (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <td className="py-2 pr-3">
                          <Link
                            to="/campaigns/$campaignId"
                            params={{ campaignId: c.id }}
                            className="font-medium hover:underline"
                          >
                            {c.name}
                          </Link>
                          <Progress
                            value={c.recipients ? (c.sent / c.recipients) * 100 : 0}
                            className="mt-1 h-1 w-32"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary">{c.status}</Badge>
                        </td>
                        <td className="py-2 text-right">{c.recipients}</td>
                        <td className="py-2 text-right">{c.sent}</td>
                        <td className="py-2 text-right">{c.replied}</td>
                        <td className="py-2 text-right">
                          {c.sent ? `${Math.round((c.replied / c.sent) * 1000) / 10}%` : "—"}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                No campaigns yet.{" "}
                <Link to="/campaigns" className="text-primary hover:underline">
                  Create your first campaign
                </Link>
                .
              </p>
            )}
          </div>

          <div className="surface-card p-6">
            <h3 className="text-lg font-semibold">Recent replies</h3>
            {pulse.data?.recentReplies.length ? (
              <ul className="mt-4 space-y-4">
                <AnimatePresence initial={false}>
                  {pulse.data.recentReplies.map((reply) => (
                    <motion.li
                      key={reply.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <Link
                        to="/inbox"
                        {...(reply.conversationId
                          ? { search: { conversation: reply.conversationId } as never }
                          : {})}
                        className="block"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{reply.prospect}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {relative(reply.at)}
                          </span>
                        </div>
                        {reply.company ? (
                          <p className="text-xs text-muted-foreground">{reply.company}</p>
                        ) : null}
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {reply.preview || "(no preview)"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              SENTIMENT_TONE[reply.sentiment] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {REPLY_SENTIMENT_LABELS[reply.sentiment] ?? reply.sentiment}
                          </span>
                          {reply.campaign ? (
                            <span className="truncate text-[11px] text-muted-foreground">
                              {reply.campaign}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Replies from your campaigns will appear here as they land in the unified inbox.
              </p>
            )}
          </div>
        </div>

        <div className="surface-card p-6">
          <h3 className="text-lg font-semibold">Activity</h3>
          {overview.data?.activity.length ? (
            <ul className="mt-4 space-y-4">
              {overview.data.activity.map((a, i) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex gap-3"
                >
                  <Activity className="mt-0.5 size-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                    <p className="text-[11px] text-muted-foreground/80">{relative(a.at)}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Launches, replies and sending events will show up here.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
