import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, History, Rocket, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getCampaignLaunchEvents } from "@/lib/campaigns.functions";

const OUTCOME_META: Record<string, { label: string; icon: typeof Rocket; tone: string }> = {
  launched: { label: "Launched", icon: Rocket, tone: "text-emerald-600" },
  blocked: { label: "Blocked", icon: AlertTriangle, tone: "text-amber-600" },
  failed: { label: "Failed", icon: AlertTriangle, tone: "text-destructive" },
  checked: { label: "Readiness check", icon: ShieldCheck, tone: "text-muted-foreground" },
};

/**
 * Launch audit trail — every readiness check and launch attempt with the exact
 * blocking reasons and the number of messages that were queued.
 */
export function LaunchAuditTrail({ campaignId }: { campaignId: string }) {
  const fetchEvents = useServerFn(getCampaignLaunchEvents);
  const query = useQuery({
    queryKey: ["campaign-launch-events", campaignId],
    queryFn: () => fetchEvents({ data: { campaignId, limit: 25 } }),
  });

  return (
    <section className="surface-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4 text-primary" /> Launch audit trail
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Readiness checks, blocking reasons and the queued message counts used for each launch.
      </p>

      {query.isLoading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="mt-3 text-sm text-destructive">Could not load the launch history.</p>
      ) : (query.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No launch attempts recorded yet — the first check appears here as soon as you launch.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {(query.data ?? []).map((event) => {
            const meta = OUTCOME_META[event.outcome] ?? OUTCOME_META["checked"]!;
            const Icon = meta.icon;
            return (
              <li key={event.id} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Icon className={`size-4 ${meta.tone}`} />
                  <span className="font-medium">{meta.label}</span>
                  {event.ready ? (
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <CheckCircle2 className="size-3" /> Ready
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Audience {event.audience.toLocaleString()} · eligible{" "}
                  {event.eligible.toLocaleString()} · already queued{" "}
                  {event.already_queued.toLocaleString()} · mailboxes {event.active_mailboxes}
                  {event.list_name ? ` · list “${event.list_name}”` : ""}
                </p>
                {event.outcome === "launched" ? (
                  <p className="mt-1 text-xs text-foreground">
                    Queued {event.queued_messages.toLocaleString()} messages for{" "}
                    {event.total_recipients.toLocaleString()} recipients
                    {event.first_send_at
                      ? ` · first send ${new Date(event.first_send_at).toLocaleString()}`
                      : ""}
                  </p>
                ) : null}
                {event.issues.length ? (
                  <ul className="mt-2 space-y-1">
                    {event.issues.map((issue) => (
                      <li key={issue.code} className="text-xs text-amber-700">
                        • {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {event.actor_email ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">by {event.actor_email}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
