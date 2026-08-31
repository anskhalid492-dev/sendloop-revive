import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/billing/model";
import { formatCredits } from "@/lib/billing/features";
import {
  createAdminPlan,
  getAdminPlans,
  setAdminPlanActive,
  updateAdminPlan,
} from "@/lib/plans-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({
    meta: [
      { title: "Plans & Pricing · MunchReach Admin" },
      { name: "description", content: "Manage MunchReach plans, pricing, credits and usage limits." },
    ],
  }),
  component: AdminPlansPage,
});

const NUMBER_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "monthly_price", label: "Monthly price (cents)" },
  { key: "yearly_price", label: "Annual price (cents)" },
  { key: "one_time_price", label: "One-time price (cents)", hint: "Lifetime plans only." },
  { key: "compare_at_price", label: "Compare-at price (cents)", hint: "Crossed-out reference price." },
  { key: "monthly_credits", label: "Credits included / month" },
  { key: "max_users", label: "Member limit" },
  { key: "max_workspaces", label: "Workspace limit" },
  { key: "max_campaigns", label: "Campaign limit" },
  { key: "max_leads", label: "Lead limit" },
  { key: "max_emails_monthly", label: "Emails per month" },
  { key: "max_emails_daily", label: "Emails per day", hint: "Hard daily sending cap. Blank = no daily cap." },
  { key: "max_warmup_daily", label: "Warmup emails per day", hint: "Metered separately from campaign sends." },
  { key: "max_sending_accounts", label: "Sending accounts" },
  { key: "max_automations", label: "Automations" },
  { key: "sort_order", label: "Sort order" },
];

const FLAG_FIELDS: { key: string; label: string }[] = [
  { key: "is_active", label: "Active (visible for checkout)" },
  { key: "is_popular", label: "Highlighted as popular" },
  { key: "is_enterprise", label: "Enterprise (contact sales)" },
  { key: "public_on_pricing_page", label: "Show on public pricing page" },
];

type PlanDraft = Record<string, any>;

function emptyDraft(): PlanDraft {
  return {
    name: "",
    slug: "",
    description: "",
    tagline: "",
    monthly_price: 0,
    yearly_price: 0,
    monthly_credits: 0,
    sort_order: 100,
    is_active: true,
    billing_type: "recurring",
    public_on_pricing_page: true,
  };
}

function AdminPlansPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getAdminPlans);
  const create = useServerFn(createAdminPlan);
  const update = useServerFn(updateAdminPlan);
  const toggle = useServerFn(setAdminPlanActive);

  const { data, isLoading } = useQuery({ queryKey: ["admin-plans"], queryFn: () => load() });
  const [editing, setEditing] = useState<PlanDraft | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
    queryClient.invalidateQueries({ queryKey: ["admin-feature-matrix"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (draft: PlanDraft) => {
      const patch = { ...draft };
      delete patch["id"];
      delete patch["activeSubscribers"];
      delete patch["mrrCents"];
      delete patch["creditsAllocated"];
      delete patch["created_at"];
      delete patch["updated_at"];
      if (draft["id"]) return update({ data: { planId: draft["id"], patch } });
      return create({ data: { patch } });
    },
    onSuccess: () => {
      toast.success("Plan saved");
      setEditing(null);
      setCreating(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { planId: string; active: boolean }) => toggle({ data: input }),
    onSuccess: () => {
      toast.success("Plan status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    const plans = data?.plans ?? [];
    return {
      subscribers: plans.reduce((s, p) => s + p.activeSubscribers, 0),
      mrr: plans.reduce((s, p) => s + p.mrrCents, 0),
      credits: plans.reduce((s, p) => s + p.creditsAllocated, 0),
      active: plans.filter((p) => p["is_active"] !== false).length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Plans &amp; pricing</h1>
          <p className="text-sm text-muted-foreground">
            Live plan catalogue. Changes apply to the customer pricing page and checkout immediately.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(emptyDraft());
            setCreating(true);
          }}
        >
          <Plus className="mr-2 size-4" /> New plan
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active plans" value={String(totals.active)} />
        <Stat label="Active subscribers" value={String(totals.subscribers)} />
        <Stat label="MRR" value={formatMoney(totals.mrr)} />
        <Stat label="Credits allocated" value={formatCredits(totals.credits)} />
      </div>

      {isLoading ? (
        <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading plans…
        </div>
      ) : (
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {["Plan", "Status", "Monthly", "Annual", "Credits", "Limits", "Subscribers", "MRR", ""].map(
                  (h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {(data?.plans ?? []).map((plan) => (
                <tr key={plan.id} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{plan["name"]}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan["slug"]}
                      {plan["billing_type"] === "lifetime" ? " · lifetime" : ""}
                      {plan["public_on_pricing_page"] === false ? " · hidden" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={plan["is_active"] !== false}
                        onCheckedChange={(v) =>
                          toggleMutation.mutate({ planId: plan.id, active: v })
                        }
                      />
                      <Badge variant={plan["is_active"] !== false ? "default" : "secondary"}>
                        {plan["is_active"] !== false ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">{formatMoney(plan["monthly_price"] ?? 0)}</td>
                  <td className="px-4 py-3">
                    {plan["billing_type"] === "lifetime"
                      ? `${formatMoney(plan["one_time_price"] ?? 0)} once`
                      : formatMoney(plan["yearly_price"] ?? 0)}
                  </td>
                  <td className="px-4 py-3">{formatCredits(plan["monthly_credits"] ?? 0)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {plan["max_users"] ?? "∞"} members · {plan["max_campaigns"] ?? "∞"} campaigns ·{" "}
                    {plan["max_emails_monthly"] ?? "∞"} emails
                  </td>
                  <td className="px-4 py-3">{plan.activeSubscribers}</td>
                  <td className="px-4 py-3">{formatMoney(plan.mrrCents)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCreating(false);
                        setEditing({ ...plan });
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Create plan" : `Edit ${editing?.["name"] ?? "plan"}`}</DialogTitle>
            <DialogDescription>
              These values drive the public pricing page, checkout and every server-side plan check.
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input
                    value={editing["name"] ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </Field>
                <Field label="Slug">
                  <Input
                    value={editing["slug"] ?? ""}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plan type">
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={editing["billing_type"] ?? "recurring"}
                    onChange={(e) => setEditing({ ...editing, billing_type: e.target.value })}
                  >
                    <option value="recurring">Recurring subscription</option>
                    <option value="lifetime">Lifetime (one-time payment)</option>
                  </select>
                </Field>
                <Field label="Tagline (short)">
                  <Input
                    value={editing["tagline"] ?? ""}
                    onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Tagline">
                <Input
                  value={editing["tagline"] ?? ""}
                  onChange={(e) => setEditing({ ...editing, tagline: e.target.value })}
                />
              </Field>
              <Field label="Description">
                <Textarea
                  rows={3}
                  value={editing["description"] ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                {NUMBER_FIELDS.map((field) => (
                  <Field key={field.key} label={field.label}>
                    <Input
                      type="number"
                      value={editing[field.key] ?? ""}
                      placeholder="Unlimited"
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [field.key]: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {FLAG_FIELDS.map((flag) => (
                  <label key={flag.key} className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={Boolean(editing[flag.key])}
                      onCheckedChange={(v) => setEditing({ ...editing, [flag.key]: v })}
                    />
                    {flag.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Feature access per plan is managed in the Feature Manager.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => editing && saveMutation.mutate(editing)}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
