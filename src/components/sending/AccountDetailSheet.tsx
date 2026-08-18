import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flame, LineChart, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AuthBadgeRow } from "@/components/sending/AuthBadges";
import { getEmailAccountDetail } from "@/lib/sending.functions";
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_STYLE,
  HEALTH_STYLE,
  formatDateTime,
  healthBand,
  rate,
  warmupProgress,
  type EmailAccountRow,
} from "@/lib/sending-model";
import { cn } from "@/lib/utils";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/50 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border/50">{children}</div>
    </section>
  );
}

export function AccountDetailSheet({
  accountId,
  fallback,
  onOpenChange,
}: {
  accountId: string | null;
  fallback: EmailAccountRow | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchDetail = useServerFn(getEmailAccountDetail);
  const detail = useQuery({
    queryKey: ["email-account-detail", accountId],
    queryFn: () => fetchDetail({ data: { id: accountId! } }),
    enabled: Boolean(accountId),
  });

  const account = (detail.data?.account as EmailAccountRow | undefined) ?? fallback;
  const stats = detail.data?.stats ?? account?.stats ?? null;
  const campaigns = detail.data?.campaigns ?? [];
  const warmup = account ? warmupProgress(account) : null;

  return (
    <Sheet open={Boolean(accountId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!account ? (
          <div className="p-6 text-sm text-muted-foreground">Loading account…</div>
        ) : (
          <>
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="break-all text-lg">{account.from_email}</SheetTitle>
              <SheetDescription>
                {account.from_name} · {account.domain}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge
                  variant="outline"
                  className={cn("font-medium", ACCOUNT_STATUS_STYLE[account.accountStatus])}
                >
                  {ACCOUNT_STATUS_LABEL[account.accountStatus]}
                </Badge>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    HEALTH_STYLE[healthBand(account.health_score)],
                  )}
                >
                  Health {account.health_score}
                </span>
              </div>
            </SheetHeader>

            <div className="mt-5 space-y-4 pb-8">
              <Block title="Sending">
                <Row label="Daily limit" value={account.daily_limit} />
                <Row label="Sent today" value={account.sent_today} />
                <Row
                  label="Remaining capacity"
                  value={Math.max(0, account.daily_limit - account.sent_today)}
                />
                <Row label="Hourly limit" value={account.hourly_limit} />
                <div className="pt-3">
                  <Progress
                    value={
                      account.daily_limit > 0
                        ? Math.min(100, (account.sent_today / account.daily_limit) * 100)
                        : 0
                    }
                  />
                </div>
              </Block>

              <Block title="Warmup">
                <Row label="Status" value={warmup?.label ?? "—"} />
                <Row
                  label="Progress"
                  value={
                    warmup?.days
                      ? `${warmup.days} / ${warmup.targetDays} days`
                      : warmup?.percent === 100
                        ? "Complete"
                        : "—"
                  }
                />
                <Row label="Warmup volume" value={`${account.warmup_daily_target} / day`} />
                <Row label="Start date" value={formatDateTime(account.warmup_started_at)} />
                <div className="pt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/warmup">
                      <Flame className="size-4" /> Open warmup
                    </Link>
                  </Button>
                </div>
              </Block>

              <Block title="Deliverability">
                <Row
                  label="Delivery rate"
                  value={stats ? rate(stats.delivered, stats.sent) : "—"}
                />
                <Row label="Bounce rate" value={stats ? rate(stats.bounced, stats.sent) : "—"} />
                <Row label="Reply rate" value={stats ? rate(stats.replies, stats.sent) : "—"} />
                <Row
                  label="Complaint rate"
                  value={stats ? rate(stats.complained, stats.sent) : "—"}
                />
                <Row label="Emails sent (all time)" value={stats ? stats.sent : "—"} />
              </Block>

              <Block title="Authentication">
                <div className="py-2">
                  <AuthBadgeRow
                    spf={account.spf_status}
                    dkim={account.dkim_status}
                    dmarc={account.dmarc_status}
                    mx={account.mx_status}
                  />
                </div>
              </Block>

              <Block title="Campaigns">
                <Row label="Active campaigns" value={account.activeCampaigns} />
                <Row label="Completed campaigns" value={account.completedCampaigns} />
                {campaigns.length > 0 ? (
                  <ul className="space-y-1 pt-2 text-sm">
                    {campaigns.slice(0, 6).map((campaign) => (
                      <li key={campaign.id} className="flex items-center justify-between gap-3">
                        <Link
                          to="/campaigns/$campaignId"
                          params={{ campaignId: campaign.id }}
                          className="truncate text-primary hover:underline"
                        >
                          {campaign.name}
                        </Link>
                        <span className="text-xs capitalize text-muted-foreground">
                          {campaign.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex gap-2 pt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/campaigns">
                      <Send className="size-4" /> Campaigns
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/analytics">
                      <LineChart className="size-4" /> Analytics
                    </Link>
                  </Button>
                </div>
              </Block>

              <Block title="Activity">
                <Row
                  label="Last email sent"
                  value={formatDateTime(stats?.lastSentAt ?? account.last_sent_at)}
                />
                <Row
                  label="Last reply"
                  value={formatDateTime(stats?.lastReplyAt ?? account.last_reply_at)}
                />
                <Row label="Assigned" value={formatDateTime(account.assigned_at)} />
                <Row
                  label="Last error"
                  value={account.accountStatus === "error" ? "Delivery failure reported" : "None"}
                />
              </Block>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
