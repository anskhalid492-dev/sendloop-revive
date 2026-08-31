import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminDeleteSubprocessor,
  adminListSubprocessors,
  adminSaveSubprocessor,
} from "@/lib/trust-center.functions";
import { SUBPROCESSOR_STATUSES, SUBPROCESSOR_STATUS_LABEL } from "@/lib/trust-center-model";

export const Route = createFileRoute("/_authenticated/mranuskhalid/subprocessors")({
  head: () => ({
    meta: [
      { title: "Subprocessors — MunchReach Admin" },
      {
        name: "description",
        content: "Manage the providers published on the public MunchReach subprocessors page.",
      },
    ],
  }),
  component: AdminSubprocessorsPage,
});

type Draft = {
  id?: string;
  provider: string;
  service: string;
  purpose: string;
  dataProcessed: string;
  location: string;
  status: string;
  published: boolean;
  sortOrder: number;
};

const emptyDraft: Draft = {
  provider: "",
  service: "",
  purpose: "",
  dataProcessed: "",
  location: "",
  status: "active",
  published: true,
  sortOrder: 0,
};

function AdminSubprocessorsPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSubprocessors);
  const save = useServerFn(adminSaveSubprocessor);
  const remove = useServerFn(adminDeleteSubprocessor);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-subprocessors"],
    queryFn: () => list({}),
  });

  const saveMutation = useMutation({
    mutationFn: (d: Draft) => save({ data: { ...(d.id ? { id: d.id } : {}), ...d } }),
    onSuccess: () => {
      toast.success(draft.id ? "Provider updated" : "Provider added");
      setDraft(emptyDraft);
      void qc.invalidateQueries({ queryKey: ["admin-subprocessors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Provider removed");
      void qc.invalidateQueries({ queryKey: ["admin-subprocessors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = rows[index + direction];
    const current = rows[index];
    if (!target || !current) return;
    void Promise.all([
      save({
        data: {
          id: current.id,
          provider: current.provider,
          service: current.service,
          purpose: current.purpose,
          dataProcessed: current.data_processed,
          location: current.location,
          status: current.status,
          published: current.published,
          sortOrder: target.sort_order,
        },
      }),
      save({
        data: {
          id: target.id,
          provider: target.provider,
          service: target.service,
          purpose: target.purpose,
          dataProcessed: target.data_processed,
          location: target.location,
          status: target.status,
          published: target.published,
          sortOrder: current.sort_order,
        },
      }),
    ])
      .then(() => qc.invalidateQueries({ queryKey: ["admin-subprocessors"] }))
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Subprocessors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Published providers appear on /subprocessors immediately. Only list providers MunchReach
          actually uses.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-sm font-semibold">{draft.id ? "Edit provider" : "Add provider"}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sp-provider">Provider</Label>
            <Input
              id="sp-provider"
              value={draft.provider}
              onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-service">Service</Label>
            <Input
              id="sp-service"
              value={draft.service}
              onChange={(e) => setDraft((d) => ({ ...d, service: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="sp-purpose">Purpose</Label>
            <Textarea
              id="sp-purpose"
              rows={2}
              value={draft.purpose}
              onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="sp-data">Data processed</Label>
            <Textarea
              id="sp-data"
              rows={2}
              value={draft.dataProcessed}
              onChange={(e) => setDraft((d) => ({ ...d, dataProcessed: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-location">Location</Label>
            <Input
              id="sp-location"
              value={draft.location}
              onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-status">Status</Label>
            <Select
              value={draft.status}
              onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}
            >
              <SelectTrigger id="sp-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBPROCESSOR_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SUBPROCESSOR_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-order">Display order</Label>
            <Input
              id="sp-order"
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch
              id="sp-published"
              checked={draft.published}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, published: v }))}
            />
            <Label htmlFor="sp-published">Published</Label>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button
            onClick={() => saveMutation.mutate(draft)}
            disabled={saveMutation.isPending || draft.provider.trim().length < 2}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {draft.id ? "Save changes" : "Add provider"}
          </Button>
          {draft.id ? (
            <Button variant="ghost" onClick={() => setDraft(emptyDraft)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card">
        <div className="border-b border-border/60 px-5 py-3 text-sm font-semibold">
          Providers ({rows.length})
        </div>
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-sm text-muted-foreground">No providers yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((s, index) => (
              <li key={s.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.provider}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {SUBPROCESSOR_STATUS_LABEL[s.status] ?? s.status} ·{" "}
                      {s.published ? "published" : "hidden"}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.service} — {s.purpose}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.data_processed} · {s.location} · order {s.sort_order}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => move(index, -1)} disabled={index === 0}>
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: s.id,
                        provider: s.provider,
                        service: s.service,
                        purpose: s.purpose,
                        dataProcessed: s.data_processed,
                        location: s.location,
                        status: s.status,
                        published: s.published,
                        sortOrder: s.sort_order,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(s.id)}
                    aria-label={`Delete ${s.provider}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
