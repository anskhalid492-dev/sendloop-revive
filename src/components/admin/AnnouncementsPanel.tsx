/**
 * Admin → System settings → Announcements.
 *
 * Announcements are real records: they render in the customer dashboard and
 * admin area through `getViewerPlatformState`, respect their schedule window
 * and remember per-user dismissals.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
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
  removeAnnouncement,
  saveAnnouncement,
} from "@/lib/platform-config.functions";
import { cn } from "@/lib/utils";

type Draft = {
  id?: string;
  title: string;
  message: string;
  level: "info" | "warning" | "critical";
  audience: "customer" | "admin" | "all";
  startsAt: string;
  endsAt: string;
  dismissible: boolean;
  ctaLabel: string;
  ctaUrl: string;
  enabled: boolean;
};

const EMPTY: Draft = {
  title: "",
  message: "",
  level: "info",
  audience: "customer",
  startsAt: "",
  endsAt: "",
  dismissible: true,
  ctaLabel: "",
  ctaUrl: "",
  enabled: true,
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementsPanel() {
  const load = useServerFn(getPlatformConfigAdmin);
  const save = useServerFn(saveAnnouncement);
  const remove = useServerFn(removeAnnouncement);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const query = useQuery({ queryKey: ["admin-platform-config"], queryFn: () => load() });

  const mutation = useMutation({
    mutationFn: (d: Draft) =>
      save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          title: d.title,
          message: d.message,
          level: d.level,
          audience: d.audience,
          startsAt: d.startsAt ? new Date(d.startsAt).toISOString() : null,
          endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
          dismissible: d.dismissible,
          ctaLabel: d.ctaLabel,
          ctaUrl: d.ctaUrl,
          enabled: d.enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Announcement saved");
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-config"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-platform-state"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deletion = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Announcement deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin-platform-config"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer-platform-state"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = query.data?.announcements ?? [];

  return (
    <div className="surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Megaphone className="size-4" /> Platform announcements
          </h3>
          <p className="text-sm text-muted-foreground">
            Banners shown across the dashboard while they are enabled and inside their schedule.
          </p>
        </div>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-1.5 size-4" /> New announcement
        </Button>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading announcements…
        </div>
      ) : items.length === 0 && !draft ? (
        <p className="py-8 text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border/40">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {a.title}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      a.level === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : a.level === "warning"
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-primary/10 text-primary",
                    )}
                  >
                    {a.level}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {a.audience}
                  </span>
                  {!a.enabled ? (
                    <span className="text-[10px] uppercase text-muted-foreground">disabled</span>
                  ) : null}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {a.starts_at ? `From ${new Date(a.starts_at).toLocaleString()}` : "No start date"}
                  {" · "}
                  {a.ends_at ? `Until ${new Date(a.ends_at).toLocaleString()}` : "No end date"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: a.id,
                      title: a.title,
                      message: a.message,
                      level: a.level,
                      audience: a.audience,
                      startsAt: toLocalInput(a.starts_at),
                      endsAt: toLocalInput(a.ends_at),
                      dismissible: a.dismissible,
                      ctaLabel: a.cta_label ?? "",
                      ctaUrl: a.cta_url ?? "",
                      enabled: a.enabled,
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
                  onClick={() => deletion.mutate(a.id)}
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
              <Label htmlFor="ann-title">Title</Label>
              <Input
                id="ann-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ann-level">Type</Label>
              <Select
                value={draft.level}
                onValueChange={(v) => setDraft({ ...draft, level: v as Draft["level"] })}
              >
                <SelectTrigger id="ann-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ann-message">Message</Label>
            <Textarea
              id="ann-message"
              rows={3}
              value={draft.message}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ann-audience">Audience</Label>
              <Select
                value={draft.audience}
                onValueChange={(v) => setDraft({ ...draft, audience: v as Draft["audience"] })}
              >
                <SelectTrigger id="ann-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customers</SelectItem>
                  <SelectItem value="admin">Admins only</SelectItem>
                  <SelectItem value="all">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ann-start">Starts</Label>
              <Input
                id="ann-start"
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ann-end">Ends</Label>
              <Input
                id="ann-end"
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ann-cta">Call-to-action label</Label>
              <Input
                id="ann-cta"
                value={draft.ctaLabel}
                onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="ann-cta-url">Call-to-action URL</Label>
              <Input
                id="ann-cta-url"
                placeholder="/billing or https://…"
                value={draft.ctaUrl}
                onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.dismissible}
                onCheckedChange={(v) => setDraft({ ...draft, dismissible: v })}
              />
              Dismissible
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
              />
              Enabled
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(draft)}>
              {mutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save announcement
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
