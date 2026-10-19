/**
 * Staff referral console: program rules, referrers, commissions, payouts and
 * fraud review. Every mutation re-checks the platform admin role server-side.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, ShieldAlert } from "lucide-react";
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
  updateReferralProgram,
} from "@/lib/referral.functions";
import { AdminCryptoPayouts } from "@/components/referral/AdminCryptoPayouts";
import { affiliateRules } from "@/lib/affiliate-rules";
import { PAYOUT_METHOD_LABELS, PAYOUT_STATUS_LABELS, formatMoney } from "@/lib/referral-model";

export const Route = createFileRoute("/_authenticated/mranuskhalid/referrals")({
  head: () => ({
    meta: [
      { title: "Affiliate Management — MunchReach Admin" },
      { property: "og:title", content: "Affiliate Management — MunchReach Admin" },
      { property: "og:description", content: "Manage MunchReach affiliate rules, approvals and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Configure commissions, review referral activity and approve affiliate payouts." },
    ],
  }),
  component: AdminReferralsPage,
});

type ProgramForm = {
  monthly_commission_percent: number; monthly_paid_periods: number; lifetime_commission_percent: number; annual_commission_percent: number; cookie_duration_days: number; affiliate_approval_required: boolean;
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


function AdminReferralsPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getAdminReferralOverview);
  const saveProgram = useServerFn(updateReferralProgram);
  const reviewCommission = useServerFn(reviewReferralCommission);
  const setStatus = useServerFn(setReferrerStatus);
  const resolveFlag = useServerFn(resolveFraudFlag);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "referrals"],
    queryFn: () => fetchOverview(),
  });

  // Clicks, signups, commissions and payout statuses stream in live.
  useReferralRealtime(["admin", "referrals"], "admin");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reason, setReason] = useState("");
  const [form, setForm] = useState<ProgramForm | null>(null);
  useEffect(() => {
    if (data?.program && !form) {
      const p = data.program as unknown as ProgramForm;
      setForm({
        ...affiliateRules(p),
        enabled: p.enabled,
        commission_type: p.commission_type,
        commission_percent: Number(p.commission_percent),
        commission_fixed_cents: p.commission_fixed_cents,
        recurring: p.recurring,
        commission_duration_months: p.commission_duration_months,
        minimum_payout_cents: 10000,
        attribution_window_days: p.attribution_window_days,
        approval_mode: p.approval_mode,
        approval_delay_days: p.approval_delay_days,
        payout_schedule: "within 60 days",
        payout_methods: ["crypto"],
        payout_provider_configured: p.payout_provider_configured,
        eligibility: p.eligibility,
        terms: p.terms,
      });
    }
  }, [data?.program, form]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "referrals"] });
  const onError = (error: Error) => toast.error(error.message);

  const programMutation = useMutation({
    mutationFn: () => { if (!form) throw new Error("Settings unavailable"); return saveProgram({ data: form }); },
    onSuccess: () => {
      toast.success("Referral program updated");
      invalidate();
    },
    onError,
  });

  const commissionMutation = useMutation({
    mutationFn: (vars: { id: string; action: "approve" | "reject" | "reverse" }) => reviewCommission({ data: { ...vars, notes: reason } }),
    onSuccess: () => {
      toast.success("Commission updated");
      invalidate();
    },
    onError,
  });

  const referrerMutation = useMutation({
    mutationFn: (vars: { id: string; status: "pending" | "active" | "suspended" | "rejected" }) => setStatus({ data: vars }),
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
      <div className="flex flex-wrap gap-3">
        <Input className="max-w-xs" aria-label="Search affiliates" placeholder="Search affiliates" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["all","pending","active","suspended","rejected"].map((value) => <SelectItem key={value} value={value}>{value === "active" ? "Approved" : value}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" onClick={() => {
          const rows = data?.referrers ?? [];
          const csv = ["Code,Status,Registrations,Customers", ...rows.map((r) => `${r.code},${r.status},${r.signups},${r.customers}`)].join("\n");
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          const a = document.createElement("a"); a.href = url; a.download = "munchreach-affiliates.csv"; a.click(); URL.revokeObjectURL(url);
        }}><Download className="mr-2 size-4" />Export affiliates</Button>
      </div>
      <Input aria-label="Review reason" placeholder="Required reason for commission review" value={reason} onChange={(e) => setReason(e.target.value)} />
      <TabsList className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="settings">Affiliate Settings</TabsTrigger>
        <TabsTrigger value="referrers">Affiliates</TabsTrigger>
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

            {([
              ["monthly_commission_percent", "Monthly commission (%)"], ["monthly_paid_periods", "Eligible paid monthly periods"],
              ["lifetime_commission_percent", "Lifetime commission (%)"], ["annual_commission_percent", "First annual payment commission (%)"],
              ["cookie_duration_days", "Cookie duration (days)"],
            ] as const).map(([key, label]) => <div className="space-y-2" key={key}><Label>{label}</Label><Input type="number" min={0} value={form[key]} onChange={(e) => update(key, Number(e.target.value))} /></div>)}
            <div className="flex items-center justify-between"><Label>Require affiliate application approval</Label><Switch checked={form.affiliate_approval_required} onCheckedChange={(v) => update("affiliate_approval_required", v)} /></div>
            <div className="flex items-center justify-between"><Label>Team is ready for manual crypto payouts</Label><Switch checked={form.payout_provider_configured} onCheckedChange={(v) => update("payout_provider_configured", v)} /></div>
            <p className="text-sm text-muted-foreground sm:col-span-2">Activation remains blocked until payment attribution, commission creation and an administrator payout review are verified. Annual renewals never earn commission.</p>
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
                value={10000}
                readOnly
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

            <p className="text-sm text-muted-foreground sm:col-span-2">Crypto payouts only: USDC on Ethereum or USDT on Tron (TRC20). Minimum $100; eligible requests are manually processed within 60 days. No automatic transfers.</p>

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
                {(data?.referrers ?? []).filter((r) => (statusFilter === "all" || r.status === statusFilter) && `${r.email} ${r.code}`.toLowerCase().includes(search.toLowerCase())).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.signups}</TableCell>
                    <TableCell>{r.customers}</TableCell>
                    <TableCell><Badge variant="secondary">{r.status === "active" ? "Approved" : r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          referrerMutation.mutate({ id: r.id, status: r.status === "active" ? "suspended" : "active" })
                        }
                      >
                        {r.status === "active" ? "Suspend" : r.status === "pending" ? "Approve" : "Reactivate"}
                      </Button>
                      {r.status === "pending" ? <Button size="sm" variant="ghost" onClick={() => referrerMutation.mutate({ id: r.id, status: "rejected" })}>Reject</Button> : null}
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

      <TabsContent value="payouts"><AdminCryptoPayouts payouts={(data?.payouts ?? []) as any} referrers={data?.referrers ?? []} /></TabsContent>

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
