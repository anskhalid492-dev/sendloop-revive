import { BarChart3, Building2, Gauge, Info, MailX, ShieldCheck, Shuffle } from "lucide-react";
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
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {impact ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">When on:</span> {impact}
          </p>
        ) : null}
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
    <section className="surface-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-4 space-y-3">{children}</div>
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
  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? "Unlimited" : n.toLocaleString();
  const availableForCampaign =
    allowance?.monthlyRemaining === null
      ? null
      : Math.max((allowance?.monthlyRemaining ?? 0) - (allowance?.campaignSent ?? 0), 0);
  const overAllowance =
    availableForCampaign !== null && settings.emailSendLimit > availableForCampaign;
  const limitReached =
    Boolean(allowance) && (allowance?.campaignSent ?? 0) >= (allowance?.campaignLimit ?? 0);

  const selectedAccountCount = settings.sendingAccountIds.length;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="lg:col-span-2 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What these options control</p>
          <p className="mt-1">
            Options decide <span className="font-medium text-foreground">how</span> this campaign
            sends, not what it says. Inbox rotation spreads volume across mailboxes, stop conditions
            decide when a lead should stop receiving follow-ups, tracking controls what is measured
            (and what deliverability cost you pay for it), and compliance keeps every send opt-out
            friendly. Changes apply to messages that have not been sent yet.
          </p>
        </div>
      </section>
      <section className="surface-card space-y-4 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Shuffle className="size-4 text-primary" />
              Inbox rotation
            </h3>
            <p className="text-sm text-muted-foreground">
              Spread this campaign across the {selectedAccountCount} selected mailbox
              {selectedAccountCount === 1 ? "" : "es"} so no single inbox carries the whole volume.
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
              <Label htmlFor="rotation-cap">Daily cap per mailbox</Label>
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
              <p className="text-xs text-muted-foreground">
                0 uses each mailbox&rsquo;s own daily limit. Set a lower number to stay extra
                conservative on this campaign.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Rotation is off — every email in this campaign sends from a single mailbox, which can
            burn its reputation quickly on larger lists.
          </p>
        )}
      </section>

      <section className="surface-card space-y-4 p-5 lg:col-span-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Gauge className="size-4 text-primary" />
            Campaign sending limit
          </h3>
          <p className="text-sm text-muted-foreground">
            Choose how many total emails this campaign can send, including follow-ups.
          </p>
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
              You have {availableForCampaign.toLocaleString()} emails available this month.
            </p>
          ) : null}
          {overAllowance && availableForCampaign !== null ? (
            <p className="text-xs font-medium text-destructive">
              You only have {availableForCampaign.toLocaleString()} emails available this month.
            </p>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Your campaign will automatically stop when it reaches this limit.
        </p>

        {limitReached ? (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
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
          description="Remaining follow-ups are cancelled as soon as a reply lands."
          impact="The lead moves to Replied, all queued steps for them are cancelled, and the thread appears in your Unified Inbox."
          checked={settings.stopOnReply}
          onChange={(v) => patchSettings({ stopOnReply: v })}
        />
        <Toggle
          title="Stop the whole company on reply"
          description="Pause every other contact at the same company when one person replies."
          impact="Colleagues of the person who replied stop receiving the sequence, so you never pitch one company twice."
          checked={settings.stopOnCompanyReply}
          onChange={(v) => patchSettings({ stopOnCompanyReply: v })}
        />
        <div className="space-y-1.5 rounded-lg border border-border p-4">
          <Label htmlFor="max-company">Max contacts per company</Label>
          <Input
            id="max-company"
            type="number"
            min={1}
            max={50}
            value={settings.maxContactsPerCompany}
            onChange={(e) => patchSettings({ maxContactsPerCompany: Number(e.target.value) || 1 })}
          />
          <p className="text-xs text-muted-foreground">
            Caps how many people at the same company can enter this campaign, so an account never
            receives the same pitch from several contacts at once.
          </p>
        </div>
      </Group>

      <Group
        icon={BarChart3}
        title="Tracking"
        subtitle="What this campaign measures. Every tracker adds a small deliverability cost, so only enable what you will act on."
      >
        <Toggle
          title="Open rate tracking"
          description="Records when a recipient opens an email in this campaign."
          impact="On: unique opens and open rate populate in Analytics. Off: no open events are stored and Analytics shows “Disabled” instead of 0%."
          checked={settings.openTracking}
          onChange={(v) => patchSettings({ openTracking: v })}
        />

        <Toggle
          title="Click tracking"
          description="Rewrites links so clicks are attributed to the campaign."
          impact="Click counts appear per lead and per step. Rewritten links can slightly reduce inbox placement."
          checked={settings.clickTracking}
          onChange={(v) => patchSettings({ clickTracking: v })}
        />
        <Toggle
          title="Send plain text only"
          description="Strips HTML so emails look like a normal 1:1 message."
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
          description="Appends a one-click opt-out footer to every email in the sequence."
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
        <ul className="space-y-2 text-sm text-muted-foreground">
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
