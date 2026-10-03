import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MANDATORY_SAFETY_RULES, type SalesAgentSettings } from "@/lib/sales-agent";
import { getSalesAgentSettings, saveSalesAgentSettings } from "@/lib/sales-agent.functions";

/** Workspace AI Sales Agent settings. Included with MunchReach — no AI key needed. */
export function SalesAgentSettingsPanel({ workspaceId }: { workspaceId: string }) {
  const fetchSettings = useServerFn(getSalesAgentSettings);
  const save = useServerFn(saveSalesAgentSettings);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["sales-agent-settings", workspaceId],
    queryFn: () => fetchSettings({ data: { workspaceId } }),
  });
  const [draft, setDraft] = useState<SalesAgentSettings | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: (settings: SalesAgentSettings) => save({ data: { workspaceId, settings } }),
    onSuccess: (value) => {
      qc.setQueryData(["sales-agent-settings", workspaceId], value);
      toast.success("AI Sales Agent settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save settings"),
  });

  return (
    <section className="max-w-2xl space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-base font-semibold">Workspace settings</h2>
        <p className="text-sm text-muted-foreground">Included with MunchReach. Used by AI Decision, Generate AI Reply and Request Human Review steps in your workflows.</p>
      </div>
        {!draft ? (
          <p className="text-sm text-muted-foreground">{query.isError ? "Couldn't load settings." : "Loading…"}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default tone</Label>
              <Input value={draft.defaultTone} onChange={(e) => setDraft({ ...draft, defaultTone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Global sales instructions</Label>
              <Textarea rows={3} value={draft.globalInstructions} placeholder="What you sell, who it's for, facts AI may use." onChange={(e) => setDraft({ ...draft, globalInstructions: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Extra safety rules</Label>
              <Textarea rows={2} value={draft.extraRules} onChange={(e) => setDraft({ ...draft, extraRules: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Default minimum confidence (%)</Label>
              <Input
                type="number"
                min={50}
                max={100}
                className="w-28"
                value={Math.round(draft.defaultThreshold * 100)}
                onChange={(e) => setDraft({ ...draft, defaultThreshold: Math.min(100, Math.max(50, Number(e.target.value) || 80)) / 100 })}
              />
            </div>
            <div className="rounded-md border bg-muted/40 p-2">
              <p className="mb-1 text-xs font-medium">Always enforced</p>
              <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
                {MANDATORY_SAFETY_RULES.slice(0, 5).map((r) => (
                  <li key={r}>{r}</li>
                ))}
                <li>Never replies automatically to unsubscribe, legal or sensitive requests.</li>
                <li>Unclear or low-confidence conversations go to a person.</li>
              </ul>
            </div>
          </div>
        )}
      <div className="flex justify-end">
        <Button disabled={!draft || mutation.isPending} onClick={() => draft && mutation.mutate(draft)}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
