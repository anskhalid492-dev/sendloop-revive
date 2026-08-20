import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getReplyToSettings, saveReplyToSettings } from "@/lib/admin.functions";

export function ReplyToSettings() {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getReplyToSettings);
  const save = useServerFn(saveReplyToSettings);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reply-to"],
    queryFn: () => fetchSettings(),
  });

  const [defaultReplyTo, setDefaultReplyTo] = useState("");
  const [forwardHint, setForwardHint] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setDefaultReplyTo(data.defaultReplyTo ?? "");
    setForwardHint(data.forwardHint ?? "");
    setOverrides(
      Object.fromEntries(data.providers.map((p) => [p.id, p.reply_to_email ?? ""])) as Record<
        string,
        string
      >,
    );
  }, [data]);

  const endpointUrl =
    typeof window === "undefined"
      ? (data?.inboundEndpoint ?? "/api/public/inbound/email")
      : `${window.location.origin}${data?.inboundEndpoint ?? "/api/public/inbound/email"}`;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          defaultReplyTo,
          forwardHint,
          providerOverrides: Object.entries(overrides).map(([id, replyTo]) => ({ id, replyTo })),
        },
      }),
    onSuccess: () => {
      toast.success("Reply-to settings saved");
      void queryClient.invalidateQueries({ queryKey: ["admin", "reply-to"] });
    },
    onError: (error: Error) => toast.error(error.message || "Couldn’t save reply-to settings."),
  });

  return (
    <section className="surface-card space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold">Reply-to inbox</h3>
        <p className="text-sm text-muted-foreground">
          Replies to every managed campaign land in this inbox, and forwarding it into MunchReach is
          what makes reply tracking and the Unified Inbox work.
        </p>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="default-reply-to">Default reply-to address</Label>
              <Input
                id="default-reply-to"
                type="email"
                value={defaultReplyTo}
                onChange={(event) => setDefaultReplyTo(event.target.value)}
                placeholder="replies@yourdomain.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forward-hint">Forwarding note</Label>
              <Input
                id="forward-hint"
                value={forwardHint}
                onChange={(event) => setForwardHint(event.target.value)}
                placeholder="Forward this inbox to the MunchReach inbound endpoint"
              />
            </div>
          </div>

          {data && data.providers.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Per-provider overrides
              </h4>
              {data.providers.map((provider) => (
                <div key={provider.id} className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)]">
                  <Label htmlFor={`reply-${provider.id}`} className="self-center text-sm">
                    {provider.name}
                  </Label>
                  <Input
                    id={`reply-${provider.id}`}
                    type="email"
                    value={overrides[provider.id] ?? ""}
                    onChange={(event) =>
                      setOverrides((prev) => ({ ...prev, [provider.id]: event.target.value }))
                    }
                    placeholder="Uses the default reply-to"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Inbound endpoint</span>
              <span
                className={
                  data?.inboundConfigured
                    ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                    : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600"
                }
              >
                {data?.inboundConfigured ? "Ready" : "Secret missing"}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">
              Forward the reply-to inbox to this URL. Send the shared secret as the{" "}
              <code>x-sendloop-signature</code> header or a <code>?token=</code> query parameter.
            </p>
            <code className="mt-2 block break-all rounded bg-background px-2 py-1 text-xs">
              {endpointUrl}
            </code>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save reply-to settings
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
