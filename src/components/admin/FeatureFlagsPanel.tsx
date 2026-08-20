/**
 * Admin → System settings → Feature flags.
 *
 * Flags are evaluated server-side through `isFeatureEnabled`, using a stable
 * hash of the workspace id so a percentage rollout stays consistent.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPlatformConfigAdmin,
  removeFeatureFlag,
  saveFeatureFlag,
} from "@/lib/platform-config.functions";

type Draft = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  environment: "all" | "production" | "preview";
  rolloutPercentage: number;
  audience: "customer" | "admin";
  isNew: boolean;
};

const EMPTY: Draft = {
  key: "",
  name: "",
  description: "",
  enabled: false,
  environment: "all",
  rolloutPercentage: 100,
  audience: "customer",
  isNew: true,
};

export function FeatureFlagsPanel() {
  const load = useServerFn(getPlatformConfigAdmin);
  const save = useServerFn(saveFeatureFlag);
  const remove = useServerFn(removeFeatureFlag);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const query = useQuery({ queryKey: ["admin-platform-config"], queryFn: () => load() });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-platform-config"] });
    void queryClient.invalidateQueries({ queryKey: ["viewer-platform-state"] });
  };

  const mutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          key: d.key.trim().toLowerCase().replace(/\s+/g, "_"),
          name: d.name,
          description: d.description,
          enabled: d.enabled,
          environment: d.environment,
          rolloutPercentage: d.rolloutPercentage,
          audience: d.audience,
        },
      }),
    onSuccess: () => {
      toast.success("Feature flag saved");
      setDraft(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deletion = useMutation({
    mutationFn: (key: string) => remove({ data: { key } }),
    onSuccess: () => {
      toast.success("Feature flag deleted");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flags = query.data?.flags ?? [];

  return (
    <div className="surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Flag className="size-4" /> Feature flags
          </h3>
          <p className="text-sm text-muted-foreground">
            Toggle platform features globally or roll them out to a percentage of workspaces.
          </p>
        </div>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-1.5 size-4" /> New flag
        </Button>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading flags…
        </div>
      ) : flags.length === 0 && !draft ? (
        <p className="py-8 text-sm text-muted-foreground">No feature flags defined yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/40">
          {flags.map((f) => (
            <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {f.name}{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{f.key}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  {f.environment} · {f.audience} · {f.rollout_percentage}% rollout
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={f.enabled}
                  onCheckedChange={(v) =>
                    mutation.mutate({
                      key: f.key,
                      name: f.name,
                      description: f.description ?? "",
                      enabled: v,
                      environment: f.environment,
                      rolloutPercentage: f.rollout_percentage,
                      audience: f.audience,
                      isNew: false,
                    })
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      key: f.key,
                      name: f.name,
                      description: f.description ?? "",
                      enabled: f.enabled,
                      environment: f.environment,
                      rolloutPercentage: f.rollout_percentage,
                      audience: f.audience,
                      isNew: false,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={deletion.isPending}
                  onClick={() => deletion.mutate(f.key)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="mt-5 space-y-4 rounded-lg border border-border/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="flag-key">Key</Label>
              <Input
                id="flag-key"
                disabled={!draft.isNew}
                placeholder="new_inbox_ui"
                value={draft.key}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="flag-name">Name</Label>
              <Input
                id="flag-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="flag-desc">Description</Label>
            <Textarea
              id="flag-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="flag-env">Environment</Label>
              <Select
                value={draft.environment}
                onValueChange={(v) =>
                  setDraft({ ...draft, environment: v as Draft["environment"] })
                }
              >
                <SelectTrigger id="flag-env">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All environments</SelectItem>
                  <SelectItem value="production">Production only</SelectItem>
                  <SelectItem value="preview">Preview only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="flag-audience">Audience</Label>
              <Select
                value={draft.audience}
                onValueChange={(v) => setDraft({ ...draft, audience: v as Draft["audience"] })}
              >
                <SelectTrigger id="flag-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customers</SelectItem>
                  <SelectItem value="admin">Admins only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="flag-rollout">Rollout %</Label>
              <Input
                id="flag-rollout"
                type="number"
                min={0}
                max={100}
                value={draft.rolloutPercentage}
                onChange={(e) =>
                  setDraft({ ...draft, rolloutPercentage: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
            Enabled
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={mutation.isPending || !draft.key.trim()}
              onClick={() => mutation.mutate(draft)}
            >
              {mutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save flag
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
