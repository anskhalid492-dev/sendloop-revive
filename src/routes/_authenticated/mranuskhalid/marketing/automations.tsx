import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MarketingEmpty,
  MarketingLoading,
  MarketingPanel,
} from "@/components/admin/marketing/MarketingUI";
import {
  createAutomationFromBlueprint,
  listMarketingAutomations,
  runMarketingAutomations,
  setAutomationStatus,
} from "@/lib/marketing.functions";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing/automations")({
  head: () => ({
    meta: [
      { title: "Marketing Automations — MunchReach Admin" },
      {
        name: "description",
        content:
          "Lifecycle marketing automations triggered by real MunchReach product events: signup, trial, activation, upgrade and churn risk.",
      },
      { property: "og:title", content: "Marketing Automations — MunchReach Admin" },
      {
        property: "og:description",
        content: "Blueprint-driven marketing journeys for MunchReach customers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMarketingAutomations);
  const create = useServerFn(createAutomationFromBlueprint);
  const setStatus = useServerFn(setAutomationStatus);
  const runNow = useServerFn(runMarketingAutomations);

  const [fromName, setFromName] = useState("MunchReach");
  const [fromEmail, setFromEmail] = useState("");

  const query = useQuery({
    queryKey: ["admin", "marketing", "automations"],
    queryFn: () => list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "marketing"] });

  const createMutation = useMutation({
    mutationFn: (blueprintKey: string) =>
      create({ data: { blueprintKey, fromName, fromEmail } }),
    onSuccess: () => {
      toast.success("Automation created as draft");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; status: "draft" | "active" | "paused" }) =>
      setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Automation updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runMutation = useMutation({
    mutationFn: () => runNow(),
    onSuccess: (result) =>
      toast.success(`Processed ${result.processed} enrolments · sent ${result.sent}`),
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <MarketingLoading label="Loading automations" />;
  const data = query.data!;

  const enrolmentCount = (automationId: string) =>
    data.enrollments.filter((e) => e.automation_id === automationId && e.status === "active").length;

  return (
    <div className="space-y-6">
      <MarketingPanel
        title="Sender identity for new automations"
        description="Automations send from a dedicated marketing domain, never from a customer sending mailbox."
        actions={
          <Button variant="outline" size="sm" onClick={() => runMutation.mutate()}>
            <Play className="mr-2 h-4 w-4" /> Run due steps now
          </Button>
        }
      >
        <div className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label>From name</Label>
            <Input value={fromName} onChange={(event) => setFromName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>From email</Label>
            <Input
              value={fromEmail}
              placeholder="hello@news.munchreach.com"
              onChange={(event) => setFromEmail(event.target.value)}
              className="w-72"
            />
          </div>
        </div>
      </MarketingPanel>

      <MarketingPanel
        title="Blueprints"
        description="Prebuilt journeys you can create in one click, then edit."
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {data.blueprints.map((blueprint) => (
            <div key={blueprint.key} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{blueprint.name}</p>
              </div>
              <p className="text-xs text-muted-foreground">{blueprint.description}</p>
              <p className="text-xs text-muted-foreground">Trigger: {blueprint.triggerEvent}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={!fromEmail.includes("@") || createMutation.isPending}
                onClick={() => createMutation.mutate(blueprint.key)}
              >
                Create
              </Button>
            </div>
          ))}
        </div>
      </MarketingPanel>

      <MarketingPanel
        title="Your automations"
        description="Activating an automation validates its steps first — an invalid journey can never go live."
      >
        {data.automations.length === 0 ? (
          <MarketingEmpty title="No automations yet" hint="Create one from a blueprint above." />
        ) : (
          <div className="divide-y">
            {data.automations.map((automation) => {
              const id = String(automation.id);
              const steps = data.steps.filter((s) => s.automation_id === id).length;
              return (
                <div key={id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{String(automation.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(automation.trigger_event)} · {steps} steps ·{" "}
                      {enrolmentCount(id)} active enrolments
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={automation.status === "active" ? "default" : "outline"}>
                      {String(automation.status)}
                    </Badge>
                    {automation.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMutation.mutate({ id, status: "paused" })}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => statusMutation.mutate({ id, status: "active" })}
                      >
                        Activate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </MarketingPanel>
    </div>
  );
}
