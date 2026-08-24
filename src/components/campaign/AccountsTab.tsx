import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Mail, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { CampaignBuilder } from "./useCampaignBuilder";

export function AccountsTab({ builder }: { builder: CampaignBuilder }) {
  const { accounts, settings, patchSettings } = builder;
  if (!settings) return null;

  const selectedIds = settings.sendingAccountIds;
  const toggle = (id: string) =>
    patchSettings({
      sendingAccountIds: selectedIds.includes(id)
        ? selectedIds.filter((v) => v !== id)
        : [...selectedIds, id],
    });

  const selected = accounts.filter((a) => selectedIds.includes(a.id));
  const dailyCapacity = selected.reduce((sum, a) => sum + (a.daily_limit ?? 0), 0);
  const usedToday = selected.reduce((sum, a) => sum + (a.sent_today ?? 0), 0);

  // Eligible = usable by this workspace right now: enabled, not paused, not failed/disabled.
  const eligible = accounts.filter(
    (a) => a.customer_enabled && !a.paused && a.status !== "failed" && a.status !== "disabled",
  );
  const eligibleIds = eligible.map((a) => a.id);
  const selectedEligible = eligibleIds.filter((id) => selectedIds.includes(id));
  const allSelected = eligibleIds.length > 0 && selectedEligible.length === eligibleIds.length;
  const someSelected = selectedEligible.length > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      // Deselect every mailbox (including any ineligible leftovers).
      patchSettings({ sendingAccountIds: [] });
      return;
    }
    const merged = Array.from(new Set([...selectedIds, ...eligibleIds]));
    patchSettings({ sendingAccountIds: merged });
  };

  return (
    <div className="space-y-5">
      <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h3 className="font-semibold">Mailbox rotation</h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            MunchReach rotates every email across the mailboxes you select here, keeping each one
            inside its own daily and hourly limits.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected</p>
            <p className="text-2xl font-semibold tabular-nums">{selected.length}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Daily capacity</p>
            <p className="text-2xl font-semibold tabular-nums">{dailyCapacity}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Used today</p>
            <p className="text-2xl font-semibold tabular-nums">{usedToday}</p>
          </div>
        </div>
      </div>

      {eligible.length > 0 ? (
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleAll}
              aria-label={allSelected ? "Deselect all inboxes" : "Select all inboxes"}
            />
            {allSelected ? "Deselect all" : "Select all inboxes"}
          </label>
          <p className="text-xs text-muted-foreground">
            {selectedEligible.length} of {eligibleIds.length} eligible inboxes selected
          </p>
        </div>
      ) : null}


      {accounts.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 p-12 text-center">
          <Inbox className="size-8 text-muted-foreground" />
          <div>
            <p className="font-semibold">No email accounts assigned yet</p>
            <p className="text-sm text-muted-foreground">
              Managed mailboxes are assigned to your workspace by MunchReach.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/sending">Open Email Accounts</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => {
            const checked = selectedIds.includes(account.id);
            const used = account.sent_today ?? 0;
            const limit = account.daily_limit || 1;
            const unhealthy = account.paused || account.status === "failed";
            return (
              <label
                key={account.id}
                className={cn(
                  "surface-card flex cursor-pointer items-start gap-3 p-4 transition-colors",
                  checked && "ring-1 ring-primary",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(account.id)}
                  aria-label={`Use ${account.from_email}`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Mail className="size-3.5 text-muted-foreground" />
                    <span className="truncate font-medium">{account.from_email}</span>
                    {unhealthy ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/20 bg-amber-500/10 text-amber-700"
                      >
                        <AlertTriangle className="mr-1 size-3" />
                        {account.paused ? "Paused" : "Needs attention"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                      >
                        <ShieldCheck className="mr-1 size-3" /> Healthy
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {account.from_name} · {account.label}
                  </p>
                  <div className="mt-3 space-y-1">
                    <Progress value={Math.min(100, (used / limit) * 100)} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">
                      {used} / {account.daily_limit} sent today · {account.hourly_limit}/hour ·
                      health {account.health_score}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
