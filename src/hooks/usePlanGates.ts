/**
 * Plan gates for the signed-in workspace.
 *
 * Purely for UX: it disables actions the plan does not allow and explains why.
 * The server re-checks every one of these on write, so a stale or missing gate
 * can never grant access.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPlanGates } from "@/lib/billing.functions";

export function usePlanGates(workspaceId: string | undefined) {
  const fetchGates = useServerFn(getPlanGates);
  const query = useQuery({
    queryKey: ["plan-gates", workspaceId],
    queryFn: () => fetchGates({ data: { workspaceId: workspaceId as string } }),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const gates = query.data;
  return {
    gates,
    isLoading: query.isLoading,
    planName: gates?.planName ?? null,
    /** Warmup is only blocked once we know the plan; never guessed. */
    warmupAllowed: gates ? gates.warmup.allowed : true,
    warmupReason: gates?.warmup.reason ?? null,
    canAddMailbox: gates
      ? gates.mailboxes.limit === null || gates.mailboxes.used < gates.mailboxes.limit
      : true,
    mailboxes: gates?.mailboxes ?? null,
    mailboxReason:
      gates && gates.mailboxes.limit !== null && gates.mailboxes.used >= gates.mailboxes.limit
        ? `Your ${gates.planName} plan allows ${gates.mailboxes.limit === 1 ? "1 mailbox" : `${gates.mailboxes.limit} mailboxes`}. Upgrade your plan to add more.`
        : null,
  };
}
