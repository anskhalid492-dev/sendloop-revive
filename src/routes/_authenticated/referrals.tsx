/**
 * Customer referral dashboard: link, live performance, commissions and payouts.
 * Every figure comes from the referrer's own tracked events via RLS-scoped
 * queries — nothing here is mocked.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Gift, Loader2, MousePointerClick, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { useReferralRealtime } from "@/hooks/useReferralRealtime";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getReferralOverview,
  joinReferralProgram,
  requestReferralPayout,
  saveAffiliatePayoutDetails,
} from "@/lib/referral.functions";
import { affiliateRules } from "@/lib/affiliate-rules";
import {
  PAYOUT_METHOD_LABELS,
  PAYOUT_STATUS_LABELS,
  conversionRate,
  formatMoney,
  referralLink,
} from "@/lib/referral-model";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — MunchReach" },
      { name: "description", content: "Track your MunchReach referral link, referred customers, commissions and payouts." },
      { property: "og:title", content: "Referrals — MunchReach" },
      { property: "og:description", content: "Your referral link, live performance and payout history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsPage,
});

const statusTone: Record<string, string> = {
  pending: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  approved: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  paid: "bg-primary/12 text-primary",
  rejected: "bg-muted text-muted-foreground",
  reversed: "bg-destructive/12 text-destructive",
};

function ReferralsPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getReferralOverview);
  const join = useServerFn(joinReferralProgram);
  const requestPayout = useServerFn(requestReferralPayout);
  const saveDetails = useServerFn(saveAffiliatePayoutDetails);
  const detailsMutation = useMutation({ mutationFn: () => saveDetails({ data: { method, details: destination } }), onSuccess: () => { toast.success("Payout details saved"); invalidate(); }, onError: (error: Error) => toast.error(error.message) });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [destination, setDestination] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["referrals", "overview"],
    queryFn: () => fetchOverview(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["referrals", "overview"] });

  // Live refresh when a click, signup, commission or payout status changes.
  useReferralRealtime(["referrals", "overview"], "customer");

  const joinMutation = useMutation({
    mutationFn: () => join(),
    onSuccess: () => {
      toast.success("Your referral link is ready");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      requestPayout({
        data: {
          amountCents: Math.round(Number(amount) * 100),
          method,
          ...(destination.trim() ? { destinationHint: destination.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Payout requested. MunchReach will review it shortly.");
      setAmount("");
      setDestination("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const link = useMemo(() => {
    if (!data?.profile) return "";
    const origin = typeof window === "undefined" ? "https://munchreach.com" : window.location.origin;
    return referralLink(origin, data.profile.code);
  }, [data?.profile]);

  const program = data?.program;
  const stats = data?.stats;
  const rules = affiliateRules(program);
  const commissionText = program ? `${rules.monthly_commission_percent}% for ${rules.monthly_paid_periods} paid monthly periods · ${rules.lifetime_commission_percent}% lifetime · ${rules.annual_commission_percent}% first annual payment` : "Settings unavailable";
  const earned = (stats?.pending_cents ?? 0) + (stats?.approved_cents ?? 0) + (stats?.paid_cents ?? 0);
  const history = new Map<string, number>();
  for (const c of data?.commissions ?? []) { const key = `${c.created_at.slice(0, 7)} ${c.currency.toUpperCase()}`; if (!["rejected", "reversed"].includes(c.status)) history.set(key, (history.get(key) ?? 0) + c.commission_amount_cents - (c.reversed_cents ?? 0)); }
  const nextHold = data?.commissions.filter((c) => c.status === "approved" && c.payable_at && new Date(c.payable_at).getTime() > Date.now()).map((c) => c.payable_at as string).sort()[0];

  return (
    <AppShell title="Affiliate Dashboard" description="Share MunchReach, earn commission on verified payments.">
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.profile ? (
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-5 text-primary" /> Apply to the affiliate program
            </CardTitle>
            {program?.enabled && program ? (
              <CardDescription>{commissionText}</CardDescription>
            ) : null}

          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{program?.eligibility}</p>
            <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
              {joinMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Submit affiliate application
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {data.profile.status === "suspended" ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4 text-sm text-destructive">
                Your referral account is suspended. Contact support if you think this is a mistake.
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{data.profile.status === "active" ? "Approved" : data.profile.status === "pending" ? "Pending" : data.profile.status === "rejected" ? "Rejected" : "Suspended"}</Badge><p className="text-sm text-muted-foreground">{commissionText}</p></div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your referral link</CardTitle>
              <CardDescription>
                {program?.enabled && program ? commissionText : "Commissions start once the program goes live."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Input readOnly value={link} className="font-mono text-sm" />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    toast.success("Referral link copied");
                  }}
                >
                  <Copy className="mr-2 size-4" /> Copy link
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(data.profile?.code ?? "");
                    toast.success("Referral code copied");
                  }}
                >
                  Copy code {data.profile.code}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Clicks", value: String(stats?.clicks ?? 0), icon: MousePointerClick, hint: "Unique visits per hour" },
              { label: "Signups", value: String(stats?.signups ?? 0), icon: Users, hint: `${conversionRate(stats?.signups ?? 0, stats?.customers ?? 0)}% converted` },
              { label: "Paying customers", value: String(stats?.customers ?? 0), icon: Gift, hint: "Verified payments" },
              { label: "Available balance", value: formatMoney(stats?.available_cents ?? 0), icon: Wallet, hint: `${formatMoney(stats?.pending_cents ?? 0)} pending` },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="space-y-1 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{card.label}</span>
                    <card.icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
            ["Total earned (USD)", earned], ["Pending commission", stats?.pending_cents ?? 0], ["Approved commission", stats?.approved_cents ?? 0], ["Paid commission", stats?.paid_cents ?? 0],
          ].map(([label, value]) => <Card key={label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{formatMoney(Number(value))}</p></CardContent></Card>)}</div>
          <p className="text-sm text-muted-foreground">Next payout eligibility: {(stats?.available_cents ?? 0) >= (program?.minimum_payout_cents ?? Infinity) ? "Threshold met — subject to payout readiness and review" : nextHold ? `Next hold release ${new Date(nextHold).toLocaleDateString()}` : `${formatMoney(Math.max((program?.minimum_payout_cents ?? 0) - (stats?.available_cents ?? 0), 0))} more approved, settled earnings needed`}. Tax, refunds and chargebacks are excluded. Failed payments earn nothing; cancellation stops future earnings only.</p>
          <Tabs defaultValue="commissions">
            <TabsList>
              <TabsTrigger value="commissions">Commissions</TabsTrigger>
              <TabsTrigger value="referrals">Referrals</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="history">Monthly history</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
            </TabsList>

            <TabsContent value="commissions" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.commissions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                            No commissions yet. They appear as soon as a referred customer pays.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.commissions.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{c.plan_name ?? "—"}</TableCell>
                            <TableCell className="font-medium">{formatMoney(c.commission_amount_cents - (c.reversed_cents ?? 0), c.currency)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={statusTone[c.status] ?? ""}>
                                {c.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals" className="mt-4">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referral</TableHead>
                        <TableHead>Signed up</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Converted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.referrals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                            No referred signups yet. Share your link to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.referrals.map((r, index) => (
                          <TableRow key={r.id}>
                            <TableCell>Referral {index + 1}</TableCell>
                            <TableCell>{new Date(r.signed_up_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{r.status}</Badge>
                            </TableCell>
                            <TableCell>{r.converted_at ? new Date(r.converted_at).toLocaleDateString() : "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <p className="mt-3 text-xs text-muted-foreground">
                Referred customers stay anonymous — MunchReach never shares their identity or account data.
              </p>
            </TabsContent>

            <TabsContent value="payouts" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Request a payout</CardTitle>
                  <CardDescription>
                    Available {formatMoney(stats?.available_cents ?? 0)} · minimum {formatMoney(program?.minimum_payout_cents ?? 0)} ·
                    paid {program?.payout_schedule ?? "monthly"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="payout-amount">Amount (USD)</Label>
                    <Input
                      id="payout-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="100.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose method" />
                      </SelectTrigger>
                      <SelectContent>
                        {(program?.payout_methods ?? []).map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYOUT_METHOD_LABELS[m] ?? m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payout-destination">Payout details</Label>
                    <Input
                      id="payout-destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="PayPal email or bank reference"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      onClick={() => payoutMutation.mutate()}
                      disabled={payoutMutation.isPending || !amount || !method || !destination || data.profile.status !== "active" || !program?.enabled || !program?.payout_provider_configured || Number(amount) * 100 > (stats?.available_cents ?? 0) || Number(amount) * 100 < (program?.minimum_payout_cents ?? Infinity)}
                    >
                      {payoutMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Request payout
                    </Button>
                    <Button className="ml-3" variant="outline" disabled={detailsMutation.isPending || !method || destination.trim().length < 3} onClick={() => detailsMutation.mutate()}>Save payout details</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payouts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                            No payouts requested yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.payouts.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{new Date(p.requested_at).toLocaleDateString()}</TableCell>
                            <TableCell>{formatMoney(p.amount_cents, p.currency)}</TableCell>
                            <TableCell>{PAYOUT_METHOD_LABELS[p.method ?? ""] ?? p.method ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history"><Table><TableHeader><TableRow><TableHead>Month / currency</TableHead><TableHead>Net earnings</TableHead></TableRow></TableHeader><TableBody>{[...history].map(([key, value]) => <TableRow key={key}><TableCell>{key}</TableCell><TableCell>{formatMoney(value, key.split(" ")[1])}</TableCell></TableRow>)}</TableBody></Table><p className="mt-3 text-xs text-muted-foreground">Latest 100 commission records. Amounts are grouped by currency and exclude reversals.</p></TabsContent>
            <TabsContent value="resources"><div className="space-y-5 py-5"><h2 className="text-xl font-semibold">Promotional resources</h2><div className="flex flex-wrap gap-3"><Button variant="outline" asChild><Link to="/features">Product overview</Link></Button><Button variant="outline" asChild><Link to="/pricing">Pricing</Link></Button><Button variant="outline" asChild><Link to="/referral/agencies">Agency partners</Link></Button></div><p className="text-sm text-muted-foreground">Suggested disclosure: “I may earn a commission if you purchase MunchReach through my link, at no extra cost to you.”</p><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(`MunchReach helps teams connect mailboxes, manage campaigns and follow up with prospects. ${link} I may earn a commission if you purchase through my link, at no extra cost to you.`); toast.success("Promotional copy copied"); }}><Copy className="mr-2 size-4" />Copy promotional text</Button></div></TabsContent>
            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardContent className="space-y-3 p-5">
                  {data.activity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No referral activity recorded yet.</p>
                  ) : (
                    data.activity.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{a.action.replace(/_/g, " ")}</p>
                          <p className="text-sm text-muted-foreground">{a.detail}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}
