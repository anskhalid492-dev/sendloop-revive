import { BarChart3, Building2, Gauge, Info, MailX, ShieldCheck, Shuffle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getCampaignSendAllowance } from "@/lib/campaigns.functions";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INBOX_ROTATION_STRATEGIES, type InboxRotationStrategy } from "@/lib/campaign-model";
import type { CampaignBuilder } from "./useCampaignBuilder";

function Hint({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="More info" className="inline-flex shrink-0 text-muted-foreground hover:text-foreground">
            <Info className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Toggle({
  title,
  description,
  impact,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  impact?: string | undefined;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          {impact ? <Hint text={impact} /> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof MailX;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" />
        <h3 className="font-semibold">{title}</h3>
        <Hint text={subtitle} />
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

export function OptionsTab({ builder }: { builder: CampaignBuilder }) {
  const { settings, patchSettings } = builder;
  const campaignId = builder.campaign?.id ?? "";
  const fetchAllowance = useServerFn(getCampaignSendAllowance);
  const allowanceQuery = useQuery({
    queryKey: ["campaign-send-allowance", campaignId],
    queryFn: () => fetchAllowance({ data: { id: campaignId } }),
    enabled: Boolean(campaignId),
    refetchInterval: 60_000,
  });
  if (!settings) return null;

  const allowance = allowanceQuery.data;
  const availableForCampaign = allowance?.effectiveRemaining ?? null;
  const overAllowance =
    availableForCampaign !== null && settings.emailSendLimit > availableForCampaign;
  const limitReached =
    Boolean(allowance) && (allowance?.campaignSent ?? 0) >= (allowance?.campaignLimit ?? 0);

  const selectedAccountCount = settings.sendingAccountIds.length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="surface-card space-y-3 p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <Shuffle className="size-4 shrink-0 text-primary" />
              Inbox rotation
              <Hint text="Spreads volume across mailboxes so no single inbox carries the whole campaign. With rotation off, every email sends from one mailbox." />
            </h3>
            <p className="text-xs text-muted-foreground">
              Uses {selectedAccountCount} selected mailbox{selectedAccountCount === 1 ? "" : "es"}.
            </p>
          </div>
          <Switch
            checked={settings.inboxRotationEnabled}
            onCheckedChange={(v) => patchSettings({ inboxRotationEnabled: v })}
            aria-label="Enable inbox rotation"
          />
        </div>

        {settings.inboxRotationEnabled ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Rotation strategy</Label>
              <Select
                value={settings.inboxRotationStrategy}
                onValueChange={(v) =>
                  patchSettings({ inboxRotationStrategy: v as InboxRotationStrategy })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INBOX_ROTATION_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  INBOX_ROTATION_STRATEGIES.find((s) => s.value === settings.inboxRotationStrategy)
                    ?.hint
                }
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rotation-cap" className="flex items-center gap-1.5">
                Daily cap per mailbox
                <Hint text="0 uses each mailbox's own daily limit. Set a lower number to stay extra conservative on this campaign." />
              </Label>
              <Input
                id="rotation-cap"
                type="number"
                min={0}
                max={10000}
                value={settings.rotationDailyCapPerInbox}
                onChange={(e) =>
                  patchSettings({
                    rotationDailyCapPerInbox: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">0 = mailbox&rsquo;s own limit.</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Rotation is off — sends from a single mailbox.</p>
        )}
      </section>

      <section className="surface-card space-y-3 p-4 lg:col-span-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Gauge className="size-4 shrink-0 text-primary" />
            Campaign sending limit
            <Hint text="Total emails this campaign can send, including follow-ups. The campaign stops automatically when it reaches this limit." />
          </h3>
          <p className="text-xs text-muted-foreground">Total emails, including follow-ups.</p>
        </div>

        <div className="max-w-xs space-y-1.5">
          <Input
            id="email-send-limit"
            aria-label="Campaign sending limit"
            type="number"
            min={1}
            max={1000000}
            value={settings.emailSendLimit}
            onChange={(e) =>
              patchSettings({
                emailSendLimit: Math.min(
                  1000000,
                  Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                ),
              })
            }
          />
          {availableForCampaign !== null ? (
            <p className="text-xs text-muted-foreground">
              You have {availableForCampaign.toLocaleString()} emails available to send right now.
            </p>
          ) : null}
          {overAllowance && availableForCampaign !== null ? (
            <p className="text-xs font-medium text-destructive">
              You only have {availableForCampaign.toLocaleString()} emails available right now.
            </p>
          ) : null}
        </div>

        {allowance ? (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/70 p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Campaign email limit</p>
              <p className="text-lg font-semibold tabular-nums">
                {allowance.campaignLimit.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Campaign emails sent</p>
              <p className="text-lg font-semibold tabular-nums">
                {allowance.campaignSent.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Campaign allowance left</p>
              <p className="text-lg font-semibold tabular-nums">
                {allowance.campaignRemaining.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Plan emails left this month</p>
              <p className="text-lg font-semibold tabular-nums">
                {allowance.monthlyRemaining === null
                  ? "Unlimited"
                  : allowance.monthlyRemaining.toLocaleString()}
              </p>
            </div>
          </div>
        ) : null}

        {limitReached ? (
          <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            This campaign reached its limit and stopped sending. Increase the number above to
            continue.
          </p>
        ) : null}
      </section>


      <Group
        icon={MailX}
        title="Stop conditions"
        subtitle="Rules that remove a lead from the remaining sequence so nobody gets chased after they answer."
      >
        <Toggle
          title="Stop when a lead replies"
          description="Cancel follow-ups when they reply."
          impact="The lead moves to Replied, all queued steps for them are cancelled, and the thread appears in your Unified Inbox."
          checked={settings.stopOnReply}
          onChange={(v) => patchSettings({ stopOnReply: v })}
        />
        <Toggle
          title="Stop the whole company on reply"
          description="Pause colleagues when one person replies."
          impact="Colleagues of the person who replied stop receiving the sequence, so you never pitch one company twice."
          checked={settings.stopOnCompanyReply}
          onChange={(v) => patchSettings({ stopOnCompanyReply: v })}
        />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <Label htmlFor="max-company" className="flex items-center gap-1.5">
            Max contacts per company
            <Hint text="Caps how many people at the same company can enter this campaign, so an account never receives the same pitch from several contacts at once." />
          </Label>
          <Input
            id="max-company"
            type="number"
            min={1}
            max={50}
            value={settings.maxContactsPerCompany}
            onChange={(e) => patchSettings({ maxContactsPerCompany: Number(e.target.value) || 1 })}
            className="h-8 w-20 shrink-0"
          />
        </div>
      </Group>

      <Group
        icon={BarChart3}
        title="Tracking"
        subtitle="What this campaign measures. Every tracker adds a small deliverability cost, so only enable what you will act on."
      >
        <Toggle
          title="Open rate tracking"
          description="Record email opens."
          impact="On: unique opens and open rate populate in Analytics. Off: no open events are stored and Analytics shows “Disabled” instead of 0%."
          checked={settings.openTracking}
          onChange={(v) => patchSettings({ openTracking: v })}
        />

        <Toggle
          title="Click tracking"
          description="Track link clicks."
          impact="Click counts appear per lead and per step. Rewritten links can slightly reduce inbox placement."
          checked={settings.clickTracking}
          onChange={(v) => patchSettings({ clickTracking: v })}
        />
        <Toggle
          title="Send plain text only"
          description="Send without HTML formatting."
          impact="Best deliverability option — no images, no styling, and open tracking cannot be applied."
          checked={settings.textOnly}
          onChange={(v) => patchSettings({ textOnly: v })}
        />
      </Group>

      <Group
        icon={ShieldCheck}
        title="Compliance"
        subtitle="Legal and reputation safeguards applied automatically to every message in the sequence."
      >
        <Toggle
          title="Include unsubscribe link"
          description="Add a one-click opt-out footer."
          impact="Opt-outs are suppressed instantly across this workspace and never receive another campaign email."
          checked={settings.unsubscribeEnabled}
          onChange={(v) => patchSettings({ unsubscribeEnabled: v })}
        />
      </Group>

      <Group
        icon={Building2}
        title="Deliverability checklist"
        subtitle="A live read of your current option mix against cold-email best practice."
      >
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>
            {settings.textOnly ? "✓" : "•"} Plain-text sending is {settings.textOnly ? "on" : "off"}{" "}
            — plain text usually lands in the primary tab.
          </li>
          <li>
            {settings.openTracking ? "•" : "✓"} Open tracking is{" "}
            {settings.openTracking ? "on" : "off"} — tracking pixels can hurt inbox placement.
          </li>
          <li>
            {settings.minDelayMinutes >= 2 ? "✓" : "•"} Minimum delay is {settings.minDelayMinutes}{" "}
            min — 2 minutes or more looks human.
          </li>
          <li>
            {settings.sendingAccountIds.length > 1 ? "✓" : "•"} {settings.sendingAccountIds.length}{" "}
            mailbox
            {settings.sendingAccountIds.length === 1 ? "" : "es"} in rotation — more mailboxes
            spread the volume.
          </li>
        </ul>
      </Group>
    </div>
  );
}
