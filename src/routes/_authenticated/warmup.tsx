import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flame } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { listMySendingAccounts } from "@/lib/sending.functions";

export const Route = createFileRoute("/_authenticated/warmup")({
  head: () => ({
    meta: [
      { title: "Warmup — Sendloop" },
      {
        name: "description",
        content: "Track inbox warmup progress and health for every mailbox assigned to you.",
      },
      { property: "og:title", content: "Warmup — Sendloop" },
      { property: "og:description", content: "Warmup progress and mailbox health." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WarmupPage,
});

function WarmupPage() {
  const fetchAccounts = useServerFn(listMySendingAccounts);
  const accounts = useQuery({ queryKey: ["sending-accounts"], queryFn: () => fetchAccounts() });

  const rows = accounts.data?.accounts ?? [];

  return (
    <AppShell title="Warmup" description="Managed warmup for your assigned mailboxes">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="surface-card flex items-start gap-4 p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <Flame className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Warmup runs automatically</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sendloop warms every mailbox we assign to you and ramps daily volume as reputation
              improves. There is nothing to configure.
            </p>
          </div>
        </div>

        {accounts.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        ) : rows.length === 0 ? (
          <div className="surface-card p-8 text-center text-sm text-muted-foreground">
            No mailboxes assigned yet. Your account manager will assign warmed mailboxes shortly.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((a) => (
              <div key={a.id} className="surface-card p-5">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{a.from_email}</p>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">
                    {a.warmup_status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.label}</p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, Math.min(100, a.health_score))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Health score {a.health_score}/100 · {a.sent_today}/{a.daily_limit} sent today
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
