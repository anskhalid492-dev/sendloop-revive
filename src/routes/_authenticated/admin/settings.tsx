/**
 * Admin → System Settings (Phase 9).
 *
 * A single settings surface generated from `SETTING_GROUPS`. Every field is
 * persisted through the platform settings server function; nothing on this
 * page is a display-only toggle. Secrets are never rendered here — provider
 * credentials live in the secret store and are managed in Admin → Providers.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSystemSettings, saveSystemSettings } from "@/lib/platform-settings.functions";
import { SETTING_GROUPS, type SettingField, type SettingGroup } from "@/lib/platform-settings";
import { AuthProvidersPanel } from "@/components/admin/AuthProvidersPanel";
import { AnnouncementsPanel } from "@/components/admin/AnnouncementsPanel";
import { FeatureFlagsPanel } from "@/components/admin/FeatureFlagsPanel";
import { ConfigHistoryPanel } from "@/components/admin/ConfigHistoryPanel";
import { UploadButton } from "@/components/admin/MediaLibrary";
import { ReferralTemplatesPanel } from "@/components/admin/ReferralTemplatesPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SystemSettingsPage,
});

type Values = Record<string, string | number | boolean>;

function formatWhen(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

function SystemSettingsPage() {
  const load = useServerFn(getSystemSettings);
  const save = useServerFn(saveSystemSettings);
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState(SETTING_GROUPS[0]!.id);
  const [draft, setDraft] = useState<Values>({});
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["admin-system-settings"],
    queryFn: () => load(),
  });

  const group = useMemo(
    () => SETTING_GROUPS.find((g) => g.id === activeId) ?? SETTING_GROUPS[0]!,
    [activeId],
  );
  const state = query.data?.groups.find((g) => g.id === activeId) ?? null;

  useEffect(() => {
    if (state) setDraft({ ...(state.values as Values) });
  }, [state?.id, state?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      save({ data: { group: group.id, values, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success(`${group.label} settings saved`);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["platform-flags"] });
      queryClient.invalidateQueries({ queryKey: ["public-auth-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-platform-config"] });
      queryClient.invalidateQueries({ queryKey: ["public-platform-config"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dirtyKeys = useMemo(() => {
    if (!state) return [] as string[];
    return group.fields
      .map((f) => f.key)
      .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify((state.values as Values)[k]));
  }, [draft, state, group]);

  const dangerousChanges = dirtyKeys.filter(
    (k) => group.fields.find((f) => f.key === k)?.danger,
  );

  function submit() {
    if (dangerousChanges.length > 0) {
      setConfirming(dangerousChanges);
      return;
    }
    mutation.mutate(draft);
  }

  if (query.isError) {
    return (
      <div className="surface-card p-6 text-sm text-destructive">
        {(query.error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">System settings</h2>
          <p className="text-sm text-muted-foreground">
            Centralized platform configuration. Every value here is persisted and enforced by the
            running system.
          </p>
        </div>
        <Link
          to="/admin/production"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          Production checklist <ExternalLink className="size-3.5" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="surface-card h-fit p-2">
          {SETTING_GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveId(g.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                g.id === activeId
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </nav>

        <div className="space-y-4">
          <div className="surface-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/40 pb-4">
              <div>
                <h3 className="text-base font-semibold">{group.label}</h3>
                <p className="text-sm text-muted-foreground">{group.description}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Last updated {formatWhen(state?.updatedAt ?? null)}</p>
                <p>by {state?.updatedByEmail ?? (state?.updatedBy ? "an admin" : "—")}</p>
              </div>
            </div>

            {group.note ? (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                {group.note}
              </p>
            ) : null}

            {group.fields.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                This section is managed in the panel below.
              </p>
            ) : query.isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading settings…
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {group.fields.map((field) => (
                  <FieldRow
                    key={field.key}
                    field={field}
                    value={draft[field.key]}
                    changed={dirtyKeys.includes(field.key)}
                    onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
                  />
                ))}
              </div>
            )}

            <div
              className={cn(
                "mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4",
                group.fields.length === 0 && "hidden",
              )}
            >
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="settings-reason" className="text-xs text-muted-foreground">
                  Reason for change (recorded in configuration history)
                </Label>
                <Input
                  id="settings-reason"
                  className="max-w-sm"
                  placeholder="Optional — e.g. raising limits for Q3 launch"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {dirtyKeys.length === 0
                  ? "No unsaved changes"
                  : `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? "" : "s"}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dirtyKeys.length === 0 || mutation.isPending}
                  onClick={() => state && setDraft({ ...(state.values as Values) })}
                >
                  Reset
                </Button>
                <Button size="sm" disabled={dirtyKeys.length === 0 || mutation.isPending} onClick={submit}>
                  {mutation.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 size-4" />
                  )}
                  Save {group.label.toLowerCase()}
                </Button>
              </div>
            </div>
          </div>

          {group.panel === "auth" || group.id === "auth" ? <AuthProvidersPanel /> : null}
          {group.panel === "referral-templates" || group.id === "notifications" ? (
            <ReferralTemplatesPanel />
          ) : null}
          {group.panel === "announcements" ? <AnnouncementsPanel /> : null}
          {group.panel === "flags" ? <FeatureFlagsPanel /> : null}
          {group.panel === "history" ? <ConfigHistoryPanel /> : null}
        </div>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Confirm sensitive change
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>These settings change how the live platform behaves for every customer:</p>
                <ul className="list-disc pl-5">
                  {(confirming ?? []).map((key) => {
                    const field = group.fields.find((f) => f.key === key)!;
                    return (
                      <li key={key}>
                        <span className="font-medium text-foreground">{field.label}</span> →{" "}
                        {String(draft[key])}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(null);
                mutation.mutate(draft);
              }}
            >
              Apply changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldRow({
  field,
  value,
  changed,
  onChange,
}: {
  field: SettingField;
  value: string | number | boolean | undefined;
  changed: boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  const id = `setting-${field.key}`;
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-transparent p-3 sm:grid-cols-[1fr_320px] sm:items-center",
        changed && "border-primary/40 bg-primary/5",
      )}
    >
      <div>
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {field.label}
          {field.danger ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-destructive">
              sensitive
            </span>
          ) : null}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
      </div>

      <div className="sm:justify-self-end">
        {field.type === "boolean" ? (
          <div className="flex items-center gap-2">
            <Switch id={id} checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
            <span className="text-xs text-muted-foreground">{value ? "Enabled" : "Disabled"}</span>
          </div>
        ) : field.type === "select" ? (
          <Select value={String(value ?? "")} onValueChange={onChange}>
            <SelectTrigger id={id} className="sm:w-[320px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === "image" ? (
          <div className="flex flex-col items-start gap-2 sm:w-[320px]">
            {value ? (
              <img
                src={String(value)}
                alt={`${field.label} preview`}
                className="h-12 max-w-[200px] rounded border border-border/60 bg-muted/40 object-contain p-1"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <UploadButton
                folder="branding"
                label={value ? "Replace" : "Upload"}
                onUploaded={(item) => onChange(item.public_url)}
              />
              {value ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                  Remove
                </Button>
              ) : null}
            </div>
            <Input
              id={id}
              className="w-full"
              placeholder="or paste an image URL"
              value={String(value ?? "")}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        ) : field.type === "textarea" ? (
          <Textarea
            id={id}
            rows={3}
            className="sm:w-[320px]"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input
            id={id}
            className="sm:w-[320px]"
            type={field.type === "number" ? "number" : "text"}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder ?? ""}
            value={String(value ?? "")}
            onChange={(e) =>
              onChange(field.type === "number" ? Number(e.target.value) : e.target.value)
            }
          />
        )}
      </div>
    </div>
  );
}

export type { SettingGroup };
