import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/app/AppShell";
import { SetupJourney } from "@/components/app/SetupJourney";
import { useWorkspace } from "@/hooks/useWorkspace";
import { getSetupProgress } from "@/lib/setup-progress.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({
    meta: [
      { title: "Guided setup — MunchReach" },
      {
        name: "description",
        content:
          "Follow the eight guided steps from workspace to launch: connect a domain, verify DNS, connect a mailbox, add leads and start your first MunchReach campaign.",
      },
      { property: "og:title", content: "Your MunchReach setup" },
      {
        property: "og:description",
        content: "Track every setup step from workspace creation to your first replies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { workspace } = useWorkspace();
  const fetchProgress = useServerFn(getSetupProgress);
  const workspaceId = workspace?.id;

  const progress = useQuery({
    queryKey: ["setup-progress", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchProgress({ data: { workspaceId: workspaceId as string } }),
  });

  return (
    <AppShell
      title="Guided setup"
      description="From workspace to your first replies"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <SetupJourney progress={progress.data} loading={progress.isLoading} variant="full" />
        <p className="text-center text-xs text-muted-foreground">
          Steps unlock in any order — MunchReach keeps this list in sync with your real workspace
          data.
        </p>
      </div>
    </AppShell>
  );
}
