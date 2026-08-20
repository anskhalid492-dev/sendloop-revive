import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  deleteInboundWebhook,
  getInboundWebhooks,
  registerInboundWebhook,
} from "@/lib/admin.functions";

/**
 * Registers the provider webhook that pushes real replies into MunchReach, so
 * reply tracking works for live campaigns and not only simulated test sends.
 */
export function InboundWebhookSettings() {
  const queryClient = useQueryClient();
  const fetchWebhooks = useServerFn(getInboundWebhooks);
  const register = useServerFn(registerInboundWebhook);
  const remove = useServerFn(deleteInboundWebhook);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "inbound-webhooks"],
    queryFn: () => fetchWebhooks(),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "inbound-webhooks"] });

  const create = useMutation({
    mutationFn: () => register({ data: { baseUrl: window.location.origin } }),
    onSuccess: () => {
      toast.success("Reply webhook registered");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn’t register the webhook."),
  });

  const drop = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Webhook removed");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn’t remove the webhook."),
  });

  const replyHooks = (data?.webhooks ?? []).filter((w) => w.events.includes("email.received"));

  return (
    <section className="surface-card space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Reply webhook</h3>
        <p className="text-sm text-muted-foreground">
          The sending provider posts every inbound reply to MunchReach here. Once registered, replies
          to live campaigns land in the Unified Inbox automatically.
        </p>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : !data?.available ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          No provider API key is configured yet, so the webhook can’t be registered.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reply-to domains
            </h4>
            {data.domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No domains found at the provider.</p>
            ) : (
              data.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{domain.name}</span>
                  <span className="flex gap-2 text-xs">
                    <span
                      className={
                        domain.status === "verified"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600"
                          : "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600"
                      }
                    >
                      Sending: {domain.status}
                    </span>
                    <span
                      className={
                        domain.receiving === "enabled"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-600"
                          : "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600"
                      }
                    >
                      Receiving: {domain.receiving}
                    </span>
                  </span>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Receiving must be enabled on the reply-to domain (MX records at your DNS provider)
              before inbound replies can be delivered to the webhook.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Registered reply webhooks
            </h4>
            {replyHooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reply webhook registered yet for this deployment.
              </p>
            ) : (
              replyHooks.map((hook) => (
                <div
                  key={hook.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <code className="break-all text-xs">{hook.endpoint}</code>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{hook.status}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => drop.mutate(hook.id)}
                      disabled={drop.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !data.secretConfigured}>
              {create.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plug className="mr-2 size-4" />
              )}
              Register reply webhook
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
