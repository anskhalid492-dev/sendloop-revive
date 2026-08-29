/**
 * Settings → Developer API.
 *
 * Issues and manages Public API v1 keys. The plaintext secret exists only in
 * the response to a create call, so it is shown once, prominently, with a copy
 * button — after that the workspace only ever sees the `mr_live_…` prefix.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SCOPE_GROUPS, SCOPE_DESCRIPTIONS, type ApiScope, type GrantableScope } from "@/lib/api/v1/scopes";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from "@/lib/api-keys.functions";
import { cn } from "@/lib/utils";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  rate_limit_per_minute: number;
  created_at: string;
};

const DEFAULT_SCOPES: ApiScope[] = ["campaigns:read", "contacts:read", "analytics:read"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function ApiKeysTab({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const create = useServerFn(createApiKey);
  const update = useServerFn(updateApiKey);
  const remove = useServerFn(deleteApiKey);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const keysQuery = useQuery({
    queryKey: ["api-keys", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => fetchKeys({ data: { workspaceId: workspaceId as string } }),
  });

  const keys = useMemo(() => (keysQuery.data?.keys ?? []) as KeyRow[], [keysQuery.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["api-keys", workspaceId] });

  const createMutation = useMutation({
    mutationFn: () =>
      create({ data: { workspaceId: workspaceId as string, name: name.trim(), scopes } }),
    onSuccess: (result) => {
      setIssued(result.secret);
      setName("");
      setScopes(DEFAULT_SCOPES);
      setOpen(false);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the key."),
  });

  const toggleMutation = useMutation({
    mutationFn: (row: KeyRow) =>
      update({
        data: { id: row.id, status: row.status === "active" ? "revoked" : "active" },
      }),
    onSuccess: () => {
      toast.success("Key updated.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Key deleted.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Developer API</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Keys authenticate requests to the MunchReach Public API v1. Every key is scoped to this
            workspace and can only do what its scopes allow.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!workspaceId}>
          <Plus className="mr-1.5 size-4" /> Create key
        </Button>
      </header>

      {issued ? (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Copy your secret key now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the only time it is shown. Store it in your secret manager — MunchReach keeps
            only a hash.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs">
              {issued}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  toast.error("Clipboard unavailable — select and copy manually.");
                }
              }}
            >
              {copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/70">
        {keysQuery.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <KeyRound className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No API keys yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a key to start calling <code className="font-mono">/api/public/v1</code>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {keys.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {row.prefix}…
                    </code>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                        row.status === "active"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.scopes.join(", ")} · {row.rate_limit_per_minute}/min · last used{" "}
                    {formatDate(row.last_used_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={row.status === "active"}
                      onCheckedChange={() => toggleMutation.mutate(row)}
                      aria-label={row.status === "active" ? "Revoke key" : "Reactivate key"}
                    />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(row.id)}
                    aria-label="Delete key"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Grant only the scopes the integration needs. You can revoke the key at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Zapier production"
              />
            </div>

            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SCOPE_GROUPS.flatMap((group) => group.scopes).map((scope: GrantableScope) => {
                  const checked = scopes.includes(scope);
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() =>
                        setScopes((prev) =>
                          prev.includes(scope)
                            ? prev.filter((s) => s !== scope)
                            : [...prev, scope],
                        )
                      }
                      className={cn(
                        "rounded-lg border p-2.5 text-left text-sm transition-colors",
                        checked
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/70 hover:border-primary/30",
                      )}
                    >
                      <span className="font-mono text-xs font-semibold">{scope}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {SCOPE_DESCRIPTIONS[scope]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!name.trim() || scopes.length === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
