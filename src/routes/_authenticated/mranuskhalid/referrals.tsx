/**
 * Staff referral console: program rules, referrers, commissions, payouts and
 * fraud review. Every mutation re-checks the platform admin role server-side.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebhookHealthPanel, type WebhookHealth } from "@/components/referral/WebhookHealthPanel";
import { useReferralRealtime } from "@/hooks/useReferralRealtime";
import {
  getAdminReferralOverview,
  resolveFraudFlag,
  reviewReferralCommission,
  setReferrerStatus,
  updateReferralPayout,
  updateReferralProgram,
} from "@/lib/referral.functions";
import { PAYOUT_METHOD_LABELS, PAYOUT_STATUS_LABELS, formatMoney } from "@/lib/referral-model";

export const Route = createFileRoute("/_authenticated/mranuskhalid/referrals")({
  head: () => ({
    meta: [
      { title: "Referral Program — MunchReach Admin" },
      { name: "description", content: "Configure commissions, review referral activity and approve affiliate payouts." },
    ],
  }),
  component: AdminReferralsPage,
});

type ProgramForm = {
  enabled: boolean;
  commission_type: "percentage" | "fixed";
  commission_percent: number;
  commission_fixed_cents: number;
  recurring: boolean;
  commission_duration_months: number;
  minimum_payout_cents: number;
  attribution_window_days: number;
  approval_mode: "manual" | "auto";
  approval_delay_days: number;
  payout_schedule: string;
  payout_methods: string[];
  payout_provider_configured: boolean;
  eligibility: string;
  terms: string;
};

const ALL_METHODS = ["paypal", "bank_transfer", "wise", "stripe_connect", "credit"];

function AdminReferralsPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminReferralOverview);
  const saveProgram = useServerFn(updateReferralProgram);
  const reviewCommission = useServerFn(reviewReferralCommission);
  const savePayout = useServerFn(updateReferralPayout);
  const setStatus = useServerFn(setReferrerStatus);
  const resolveFlag = useServerFn(resolveFraudFlag);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "referrals"],
    queryFn: () => fetchOverview(),
  });

  // Clicks, signups, commissions and payout statuses stream in live.
  useReferralRealtime(["admin", "referrals"], "admin");

  const [form, setForm] = useState<ProgramForm | null>(null);
  useEffect(() => {
    if (data?.program && !form) {
      const p = data.program as unknown as ProgramForm;
      setForm({
        enabled: p.enabled,
        commission_type: p.commission_type,
        commission_percent: Number(p.commission_percent),
        commission_fixed_cents: p.commission_fixed_cents,
        recurring: p.recurring,
        commission_duration_months: p.commission_duration_months,
        minimum_payout_cents: p.minimum_payout_cents,
        attribution_window_days: p.attribution_window_days,
        approval_mode: p.approval_mode,
        approval_delay_days: p.approval_delay_days,
        payout_schedule: p.payout_schedule,
        payout_methods: p.payout_methods,
        payout_provider_configured: p.payout_provider_configured,
        eligibility: p.eligibility,
        terms: p.terms,
      });
    }
  }, [data?.program, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "referrals"] });
  const onError = (error: Error) => toast.error(error.message);

  const programMutation = useMutation({
    mutationFn: () => saveProgram({ data: form! }),
    onSuccess: () => {
      toast.success("Referral program updated");
      invalidate();
    },
    onError,
  });

  const commissionMutation = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" | "reverse" }) => reviewCommission({ data: vars }),
    onSuccess: () => {
      toast.success("Commission updated");
      invalidate();
    },
    onError,
  });

  const payoutMutation = useMutation({
    mutationFn: (vars: { id: string; status: "under_review" | "approved" | "processing" | "paid" | "rejected" }) =>
      savePayout({ data: vars }),
    onSuccess: () => {
      toast.success("Payout updated");
      invalidate();
    },
    onError,
  });

  const referrerMutation = useMutation({
    mutationFn: (vars: { id: string; status: "active" | "suspended" }) => setStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Referrer updated");
      invalidate();
    },
    onError,
  });

  const flagMutation = useMutation({
    mutationFn: (vars: { id: string; status: "reviewed" | "dismissed" }) => resolveFlag({ data: vars }),
    onSuccess: () => {
      toast.success("Flag resolved");
      invalidate();
    },
    onError,
  });

  if (isLoading || !form) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList>
        <TabsTrigger value="settings">Program</TabsTrigger>
        <TabsTrigger value="referrers">Referrers</TabsTrigger>
        <TabsTrigger value="commissions">Commissions</TabsTrigger>
        <TabsTrigger value="payouts">Payouts</TabsTrigger>
        <TabsTrigger value="fraud">
          Fraud {data?.flags.length ? <Badge className="ml-2">{data.flags.length}</Badge> : null}
        </TabsTrigger>
        <TabsTrigger value="webhook">Webhook</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>

      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commission rules</CardTitle>
            <CardDescription>These values apply to every new attribution and commission.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Program enabled</p>
                <p className="text-sm text-muted-foreground">When off, no attributions or commissions are created.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => update("enabled", v)} />
            </div>

            <div className="space-y-2">
              <Label>Commission type</Label>
              <Select value={form.commission_type} onValueChange={(v) => update("commission_type", v as "percentage" | "fixed")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of payment</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.commission_type === "percentage" ? (
              <div className="space-y-2">
                <Label>Percentage (%)</Label>
                <Input
                  type="number"
                  value={form.commission_percent}
                  onChange={(e) => update("commission_percent", Number(e.target.value))}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Fixed amount (cents)</Label>
                <Input
                  type="number"
                  value={form.commission_fixed_cents}
                  onChange={(e) => update("commission_fixed_cents", Number(e.target.value))}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
              <div>
                <p className="text-sm font-medium">Recurring</p>
                <p className="text-sm text-muted-foreground">Pay on every renewal, not just the first payment.</p>
              </div>
              <Switch checked={form.recurring} onCheckedChange={(v) => update("recurring", v)} />
            </div>

            <div className="space-y-2">
              <Label>Recurring duration (months, 0 = lifetime)</Label>
              <Input
                type="number"
                value={form.commission_duration_months}
                onChange={(e) => update("commission_duration_months", Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Attribution window (days)</Label>
              <Input
                type="number"
                value={form.attribution_window_days}
                onChange={(e) => update("attribution_window_days", Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Minimum payout (cents)</Label>
              <Input
                type="number"
                value={form.minimum_payout_cents}
                onChange={(e) => update("minimum_payout_cents", Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Approval mode</Label>
              <Select value={form.approval_mode} onValueChange={(v) => update("approval_mode", v as "manual" | "auto")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual review</SelectItem>
                  <SelectItem value="auto">Auto approve</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Hold period (days)</Label>
              <Input
                type="number"
                value={form.approval_delay_days}
                onChange={(e) => update("approval_delay_days", Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label>Payout schedule</Label>
              <Input value={form.payout_schedule} onChange={(e) => update("payout_schedule", e.target.value)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Payout methods</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_METHODS.map((m) => {
                  const active = form.payout_methods.includes(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() =>
                        update(
                          "payout_methods",
                          active ? form.payout_methods.filter((x) => x !== m) : [...form.payout_methods, m],
                        )
                      }
                    >
                      {PAYOUT_METHOD_LABELS[m] ?? m}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Eligibility</Label>
              <Textarea value={form.eligibility} onChange={(e) => update("eligibility", e.target.value)} rows={2} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Program terms (shown publicly)</Label>
              <Textarea value={form.terms} onChange={(e) => update("terms", e.target.value)} rows={5} />
            </div>

            <div className="sm:col-span-2">
              <Button onClick={() => programMutation.mutate()} disabled={programMutation.isPending}>
                {programMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save program
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="referrers">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Signups</TableHead>
                  <TableHead>Customers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.referrers ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.signups}</TableCell>
                    <TableCell>{r.customers}</TableCell>
                    <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          referrerMutation.mutate({ id: r.id, status: r.status === "active" ? "suspended" : "active" })
                        }
                      >
                        {r.status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.referrers ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No referrers yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="commissions">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.commissions ?? []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{c.referrer_email}</TableCell>
                    <TableCell>{c.referred_email}</TableCell>
                    <TableCell>{formatMoney(c.amount_cents, c.currency)}</TableCell>
                    <TableCell className="font-medium">{formatMoney(c.commission_amount_cents, c.currency)}</TableCell>
                    <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => commissionMutation.mutate({ id: c.id, action: "approve" })}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => commissionMutation.mutate({ id: c.id, action: "reject" })}>
                        Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => commissionMutation.mutate({ id: c.id, action: "reverse" })}>
                        Reverse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.commissions ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      No commissions recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="payouts">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payouts ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell>{formatMoney(p.amount_cents, p.currency)}</TableCell>
                    <TableCell>{PAYOUT_METHOD_LABELS[p.method ?? ""] ?? p.method ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Select onValueChange={(v) => payoutMutation.mutate({ id: p.id, status: v as never })}>
                        <SelectTrigger className="ml-auto w-40"><SelectValue placeholder="Set status" /></SelectTrigger>
                        <SelectContent>
                          {["under_review", "approved", "processing", "paid", "rejected"].map((s) => (
                            <SelectItem key={s} value={s}>{PAYOUT_STATUS_LABELS[s] ?? s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.payouts ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      No payout requests.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="fraud">
        <Card>
          <CardContent className="space-y-3 p-5">
            {(data?.flags ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No open fraud flags.</p>
            ) : (
              (data?.flags ?? []).map((f: any) => (
                <div key={f.id} className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 size-4 text-destructive" />
                    <div>
                      <p className="text-sm font-medium">{f.reason.replace(/_/g, " ")}</p>
                      <p className="text-sm text-muted-foreground">{f.detail}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(f.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => flagMutation.mutate({ id: f.id, status: "reviewed" })}>
                      Mark reviewed
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => flagMutation.mutate({ id: f.id, status: "dismissed" })}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="webhook">
        {data?.webhook ? (
          <WebhookHealthPanel health={data.webhook as WebhookHealth} onRefresh={invalidate} />
        ) : null}
      </TabsContent>

      <TabsContent value="audit">
        <Card>
          <CardContent className="space-y-3 p-5">
            {(data?.audit ?? []).map((a: any) => (
              <div key={a.id} className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium">{a.action.replace(/_/g, " ")}</p>
                  <p className="text-sm text-muted-foreground">{a.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.actor_role} · {new Date(a.created_at).toLocaleString()}
                </span>
              </div>
            ))}
            {(data?.audit ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No referral activity yet.</p>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
