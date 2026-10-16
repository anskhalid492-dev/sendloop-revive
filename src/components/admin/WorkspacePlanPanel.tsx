/**
 * Admin manual plan assignment panel.
 *
 * Reads and writes the central subscription/entitlement record — the same one
 * customer billing and metering use. Server functions enforce super-admin
 * access; nothing here is trusted client-side.
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  assignWorkspacePlan,
  cancelScheduledWorkspacePlan,
  getWorkspacePlanAdmin,
  grantWorkspacePlan,
  revokeWorkspacePlanGrant,
  updateWorkspaceGrantExpiry,
} from "@/lib/manual-plan.functions";

/** Grant durations offered to staff; null = no expiry. */
const GRANT_DURATIONS: { value: string; label: string; days: number | null }[] = [
  { value: "7", label: "7 days", days: 7 },
  { value: "14", label: "14 days", days: 14 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "custom", label: "Custom", days: null },
  { value: "unlimited", label: "Unlimited / no expiry", days: null },
];

const LIMIT_LABELS: Record<string, string> = {
  max_emails_monthly: "Emails / month",
  max_emails_daily: "Daily Sending Limit",
  max_leads: "Lead capacity",
  max_sending_accounts: "Mailboxes",
  max_domains: "Domains",
  max_campaigns: "Campaigns",
  max_active_campaigns: "Active campaigns",
  max_automations: "Automations",
  max_ai_monthly: "AI credits / month",
  max_warmup_daily: "Warmup / day",
  max_users: "Team seats",
  max_workspaces: "Workspaces",
};

const KEY_LIMITS = ["max_emails_monthly", "max_emails_daily", "max_leads", "max_sending_accounts"];

function num(v: number | null | undefined) {
  return v === null || v === undefined ? "Unlimited" : v.toLocaleString();
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

type PlanOption = {
  id: string;
  name: string;
  isFree: boolean;
  monthlyPrice: number;
  limits: Record<string, number | null>;
};

type Grant = {
  id: string;
  planId: string;
  planName: string;
  status: "active" | "revoked" | "expired";
  startsAt: string;
  expiresAt: string | null;
  reason: string | null;
  grantedByEmail: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

type PanelData = {
  plans: PlanOption[];
  grant: Grant | null;
  grants: Grant[];
  current: {
    planId: string | null;
    planName: string;
    statusLabel: string;
    interval: string | null;
    amountCents: number;
    currentPeriodEnd: string | null;
    manualOverride: boolean;
    manualAssignedAt: string | null;
    manualAssignedByEmail: string | null;
    manualNote: string | null;
    pendingPlanId: string | null;
    pendingPlanName: string | null;
    pendingEffectiveAt: string | null;
  };
  limits: Record<string, number | null>;
  usage: Array<{
    key: string;
    label: string;
    used: number;
    limit: number | null;
    overLimit: boolean;
  }>;
  history: Array<{
    id: string;
    action: string;
    at: string;
    note: string | null;
    fromPlan: string | null;
    toPlan: string | null;
    effect: string | null;
  }>;
};

export function WorkspacePlanPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getWorkspacePlanAdmin);
  const assign = useServerFn(assignWorkspacePlan);
  const cancelScheduled = useServerFn(cancelScheduledWorkspacePlan);

  const [planId, setPlanId] = useState<string>("");
  const [effect, setEffect] = useState<"immediate" | "next_cycle">("immediate");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [grantPlanId, setGrantPlanId] = useState<string>("");
  const [grantDuration, setGrantDuration] = useState<string>("30");
  const [customDays, setCustomDays] = useState<string>("60");
  const [grantReason, setGrantReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "workspace-plan", workspaceId],
    queryFn: () => load({ data: { workspaceId } }) as Promise<PanelData>,
  });

  const data = query.data as PanelData | undefined;
  const targetPlan = useMemo(
    () => data?.plans.find((p) => p.id === planId) ?? null,
    [data, planId],
  );
  const currentPlan = useMemo(
    () => data?.plans.find((p) => p.id === data?.current.planId) ?? null,
    [data],
  );

  const mutation = useMutation({
    mutationFn: () => {
      const trimmed = reason.trim();
      return assign({
        data: {
          workspaceId,
          planId: targetPlan && targetPlan.isFree ? null : planId,
          interval: "monthly" as const,
          effect,
          ...(trimmed ? { reason: trimmed } : {}),
        },
      });
    },

    onSuccess: () => {
      toast.success(
        effect === "immediate" ? "Plan updated" : "Plan change scheduled for the next cycle",
      );
      setReason("");
      setPlanId("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "workspace-plan", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grantFn = useServerFn(grantWorkspacePlan);
  const extendFn = useServerFn(updateWorkspaceGrantExpiry);
  const revokeFn = useServerFn(revokeWorkspacePlanGrant);

  const grantDays = (() => {
    if (grantDuration === "unlimited") return null;
    if (grantDuration === "custom") {
      const n = Number.parseInt(customDays, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return Number.parseInt(grantDuration, 10);
  })();

  const refreshPlan = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "workspace-plan", workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  };

  const grantMutation = useMutation({
    mutationFn: () => {
      const trimmed = grantReason.trim();
      return grantFn({
        data: {
          workspaceId,
          planId: grantPlanId,
          days: grantDays,
          ...(trimmed ? { reason: trimmed } : {}),
        },
      });
    },
    onSuccess: () => {
      toast.success("Plan granted — entitlements are active immediately");
      setGrantReason("");
      setGrantPlanId("");
      refreshPlan();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extendMutation = useMutation({
    mutationFn: () => extendFn({ data: { workspaceId, days: grantDays } }),
    onSuccess: () => {
      toast.success("Grant expiry updated");
      refreshPlan();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: () => {
      const trimmed = grantReason.trim();
      return revokeFn({ data: { workspaceId, ...(trimmed ? { reason: trimmed } : {}) } });
    },
    onSuccess: () => {
      toast.success("Grant revoked — the customer is back on their own plan");
      setRevoking(false);
      setGrantReason("");
      refreshPlan();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelScheduled({ data: { workspaceId } }),
    onSuccess: () => {
      toast.success("Scheduled plan change removed");
      void queryClient.invalidateQueries({ queryKey: ["admin", "workspace-plan", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <div className="h-56 animate-pulse rounded-xl bg-muted" />;
  if (query.error)
    return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  if (!data) return null;

  const usageRows = data.usage.filter((u) =>
    ["emails_monthly", "emails_daily", "leads", "sending_accounts"].includes(u.key),
  );

  return (
    <div className="space-y-5 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{data.current.planName}</span>
            <Badge variant="secondary" className="capitalize">
              {data.current.statusLabel}
            </Badge>
            {data.current.manualOverride ? (
              <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400">
                <ShieldCheck className="h-3 w-3" /> Plan override
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {money(data.current.amountCents)} / {data.current.interval ?? "monthly"} · Renews{" "}
            {fmtDate(data.current.currentPeriodEnd)}
            {data.current.manualAssignedByEmail
              ? ` · Assigned by ${data.current.manualAssignedByEmail} on ${fmtDate(data.current.manualAssignedAt)}`
              : ""}
          </p>
          {data.current.manualNote ? (
            <p className="text-xs text-muted-foreground">Note: {data.current.manualNote}</p>
          ) : null}
        </div>
      </div>

      {data.current.pendingPlanId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm">
          <span>
            Scheduled: switches to <strong>{data.current.pendingPlanName}</strong> on{" "}
            {fmtDate(data.current.pendingEffectiveAt)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            Cancel
          </Button>
        </div>
      ) : null}


      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Gift className="h-4 w-4 text-primary" /> Plan grant
          </p>
          {data.grant ? (
            <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Admin granted</Badge>
          ) : null}
        </div>

        {data.grant ? (
          <div className="space-y-1 rounded-lg border bg-background p-3 text-sm">
            <p>
              <strong>{data.grant.planName}</strong> granted{" "}
              {data.grant.grantedByEmail ? `by ${data.grant.grantedByEmail} ` : ""}on{" "}
              {fmtDate(data.grant.grantedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.grant.expiresAt
                ? `Expires ${fmtDate(data.grant.expiresAt)} — the workspace then returns to its own plan.`
                : "No expiry — active until revoked."}
              {data.grant.reason ? ` · Note: ${data.grant.reason}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => extendMutation.mutate()}
                disabled={extendMutation.isPending}
              >
                {extendMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply new expiry
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRevoking(true)}>
                Revoke plan grant
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No grant active. The workspace uses its own subscription or trial.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select value={grantPlanId} onValueChange={setGrantPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan to grant" />
              </SelectTrigger>
              <SelectContent>
                {data.plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.isFree ? " — Free Trial" : ` — ${money(p.monthlyPrice)}/mo value`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Duration</Label>
            <Select value={grantDuration} onValueChange={setGrantDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANT_DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {grantDuration === "custom" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Custom duration (days)</Label>
            <Input
              type="number"
              min={1}
              max={3650}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="max-w-[160px]"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs">Reason / internal note</Label>
          <Textarea
            rows={2}
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
            placeholder="Internal only — never shown to the customer"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          A grant activates the selected plan's limits, daily caps, credits and features
          immediately. No payment is taken and the customer's real subscription history is left
          untouched.
        </p>

        <Button
          onClick={() => grantMutation.mutate()}
          disabled={!grantPlanId || grantMutation.isPending || (grantDuration === "custom" && !grantDays)}
        >
          {grantMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {data.grant ? "Change grant" : "Grant plan"}
        </Button>
      </div>

      {data.grants.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grant history
          </p>
          <ul className="space-y-1 text-sm">
            {data.grants.map((g) => (
              <li key={g.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                <span className="truncate">
                  {g.planName} · {g.status}
                  {g.expiresAt ? ` · expires ${fmtDate(g.expiresAt)}` : " · no expiry"}
                  {g.reason ? ` · ${g.reason}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(g.grantedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Plan limits
          </p>
          <ul className="space-y-1 text-sm">
            {KEY_LIMITS.map((key) => (
              <li key={key} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{LIMIT_LABELS[key]}</span>
                <span className="font-medium">{num(data.limits[key])}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Current usage
          </p>
          <ul className="space-y-1 text-sm">
            {usageRows.length === 0 ? (
              <li className="text-muted-foreground">No usage recorded.</li>
            ) : (
              usageRows.map((u) => (
                <li key={u.key} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{u.label}</span>
                  <span className={u.overLimit ? "font-medium text-destructive" : "font-medium"}>
                    {u.used.toLocaleString()} / {num(u.limit)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Assign plan manually
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {data.plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.isFree ? " — Free Trial" : ` — ${money(p.monthlyPrice)}/mo`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Effective</Label>
            <Select value={effect} onValueChange={(v) => setEffect(v as typeof effect)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediately (override current plan)</SelectItem>
                <SelectItem value="next_cycle">At next billing cycle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Reason / note</Label>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this plan being assigned? (recorded in the audit log)"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Manual assignment does not charge the customer. Limits, features and daily caps apply
          instantly from the central entitlement system.
        </p>
        <Button
          disabled={!planId || planId === data.current.planId || mutation.isPending}
          onClick={() => setConfirming(true)}
        >
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Change plan
        </Button>
      </div>

      {data.history.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Plan change history
          </p>
          <ul className="space-y-1 text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 border-b py-1 last:border-0">
                <span className="truncate">
                  {h.fromPlan ? `${h.fromPlan} → ${h.toPlan}` : h.action}
                  {h.effect === "next_cycle" ? " (scheduled)" : ""}
                  {h.note ? ` · ${h.note}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <AlertDialog open={revoking} onOpenChange={setRevoking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this plan grant?</AlertDialogTitle>
            <AlertDialogDescription>
              {data.grant?.planName} access ends immediately and the workspace returns to its own
              subscription or trial. No customer data is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep grant</AlertDialogCancel>
            <AlertDialogAction onClick={() => revokeMutation.mutate()}>
              Revoke grant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change this workspace from {data.current.planName} to {targetPlan?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {effect === "immediate"
                    ? "The new entitlement applies immediately. No charge is taken."
                    : `The change is scheduled for ${fmtDate(data.current.currentPeriodEnd)}.`}
                </p>
                <div className="grid grid-cols-3 gap-2 rounded-lg border p-2 text-xs">
                  <span className="font-medium text-muted-foreground">Limit</span>
                  <span className="font-medium text-muted-foreground">
                    {data.current.planName}
                  </span>
                  <span className="font-medium text-muted-foreground">{targetPlan?.name}</span>
                  {KEY_LIMITS.map((key) => (
                    <Fragment key={key}>
                      <span>{LIMIT_LABELS[key]}</span>
                      <span>{num(currentPlan?.limits[key] ?? data.limits[key])}</span>
                      <span className="font-medium">{num(targetPlan?.limits[key] ?? null)}</span>
                    </Fragment>
                  ))}

                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate()}>Confirm change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
