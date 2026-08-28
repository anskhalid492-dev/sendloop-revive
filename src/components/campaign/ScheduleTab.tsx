import { CalendarClock, Clock, Gauge, Repeat } from "lucide-react";

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
import {
  DAY_LABELS,
  TIMEZONES,
  formatZonedDateTime,
  campaignScheduleState,
  parseZonedDateTimeLocal,
  zonedDateTimeLocalValue,
} from "@/lib/campaign-schedule";
import {
  MAX_MAILBOX_EMAILS_PER_HOUR,
  MAX_MAILBOX_HOURLY_MESSAGE,
  clampMailboxHourlyLimit,
  effectiveMailboxHourlyLimit,
  exceedsMailboxHourlyCap,
} from "@/lib/mailbox-hourly-cap";
import { cn } from "@/lib/utils";
import type { CampaignBuilder } from "./useCampaignBuilder";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

export function ScheduleTab({ builder }: { builder: CampaignBuilder }) {
  const { settings, patchSettings, accounts, delivery, leadTotal } = builder;
  if (!settings) return null;

  // Server-returned truth: emails this campaign sent today, and the leads still
  // waiting. Remaining daily capacity is limit − sent today, never lead-based.
  const sentToday = delivery?.sentToday ?? 0;
  const totalLeads = delivery?.totalLeads ?? leadTotal ?? 0;

  const toggleDay = (day: number) => {
    const next = settings.sendDays.includes(day)
      ? settings.sendDays.filter((d) => d !== day)
      : [...settings.sendDays, day].sort();
    patchSettings({ sendDays: next });
  };

  const windowHours = Math.max(0, settings.sendEndHour - settings.sendStartHour);

  // Mailbox ceiling: what the selected mailboxes can actually handle.
  const selectedAccounts = accounts.filter((a) => settings.sendingAccountIds.includes(a.id));
  const mailboxDailyCeiling = selectedAccounts.reduce((sum, a) => sum + (a.daily_limit ?? 0), 0);
  const mailboxHourlyCeiling = selectedAccounts.reduce(
    (sum, a) => sum + effectiveMailboxHourlyLimit(a.hourly_limit),
    0,
  );

  // Customer-selected volume first — mailbox capacity only ever trims it.
  const selectedDaily = Math.max(0, settings.dailyCap);
  let effectiveDaily = mailboxDailyCeiling > 0
    ? Math.min(selectedDaily, mailboxDailyCeiling)
    : selectedDaily;

  // Hourly throughput is derived from the daily volume spread over the window.
  let hourly = windowHours > 0 ? Math.ceil(effectiveDaily / windowHours) : effectiveDaily;
  if (mailboxHourlyCeiling > 0 && hourly > mailboxHourlyCeiling) {
    hourly = mailboxHourlyCeiling;
    if (windowHours > 0) effectiveDaily = Math.min(effectiveDaily, hourly * windowHours);
  }

  // Hard platform ceiling: a stored value above 70 is displayed and saved capped.
  const hourlyCapHit = exceedsMailboxHourlyCap(settings.maxPerHour)
    || clampMailboxHourlyLimit(settings.maxPerHour) === MAX_MAILBOX_EMAILS_PER_HOUR;

  const cappedByMailboxes = effectiveDaily < selectedDaily;
  const weekly = effectiveDaily * settings.sendDays.length;
  const nextWindowBase = settings.startAt ? new Date(settings.startAt) : new Date();
  const nextWindow = campaignScheduleState(
    nextWindowBase.getTime() > Date.now() ? nextWindowBase : new Date(),
    {
      timezone: settings.timezone,
      sendDays: settings.sendDays,
      startHour: settings.sendStartHour,
      endHour: settings.sendEndHour,
    },
  ).eligibleWindowStart;


  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        <Section
          icon={CalendarClock}
          title="Sending days"
          description="Emails only leave the queue on the days you pick, in the campaign timezone."
        >
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((label, index) => {
              const active = settings.sendDays.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(index)}
                  className={cn(
                    "h-10 w-14 rounded-lg border text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Business days only</p>
              <p className="text-xs text-muted-foreground">
                Skip weekends even if follow-ups land there.
              </p>
            </div>
            <Switch
              checked={settings.businessDaysOnly}
              onCheckedChange={(v) => patchSettings({ businessDaysOnly: v })}
              aria-label="Business days only"
            />
          </div>
        </Section>

        <Section
          icon={Clock}
          title="Sending window"
          description="The daily time range when the queue is allowed to send."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Select
                value={String(settings.sendStartHour)}
                onValueChange={(v) => patchSettings({ sendStartHour: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Select
                value={String(settings.sendEndHour)}
                onValueChange={(v) => patchSettings({ sendEndHour: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h === 24 ? "12:00 AM (next day)" : hourLabel(h)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(v) => patchSettings({ timezone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {settings.sendEndHour <= settings.sendStartHour ? (
            <p className="mt-3 text-sm text-destructive">
              The end of the window must be later than the start.
            </p>
          ) : null}
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">Next sending window</span>
              <span className="font-semibold tabular-nums text-primary">
                {formatZonedDateTime(nextWindow, settings.timezone)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Messages are released only between {hourLabel(settings.sendStartHour)} and{" "}
              {settings.sendEndHour === 24 ? "12:00 AM" : hourLabel(settings.sendEndHour)} in{" "}
              {settings.timezone.replace("_", " ")}.
            </p>
          </div>
        </Section>

        <Section
          icon={Repeat}
          title="Pacing"
          description="Human-like gaps between sends protect your domain reputation."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="min-delay">Minimum delay between emails (minutes)</Label>
              <Input
                id="min-delay"
                type="number"
                min={0}
                max={240}
                value={settings.minDelayMinutes}
                onChange={(e) => patchSettings({ minDelayMinutes: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rand-delay">Random extra delay (minutes)</Label>
              <Input
                id="rand-delay"
                type="number"
                min={0}
                max={240}
                value={settings.randomDelayMinutes}
                onChange={(e) => patchSettings({ randomDelayMinutes: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-cap">Daily email sending limit</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="daily-cap"
                  type="number"
                  min={1}
                  max={100000}
                  value={settings.dailyCap}
                  onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) || 1 })}
                />
                <span className="shrink-0 text-sm text-muted-foreground">emails/day</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Choose how many emails this campaign can send each day. Your mailbox limits and plan
                limits may reduce the actual number. Leads stay in the campaign until they are sent —
                this does not limit how many leads you can add.
              </p>

            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-hour">Max emails per hour</Label>
              <Input
                id="max-hour"
                type="number"
                min={1}
                max={MAX_MAILBOX_EMAILS_PER_HOUR}
                value={clampMailboxHourlyLimit(settings.maxPerHour)}
                onChange={(e) =>
                  patchSettings({ maxPerHour: clampMailboxHourlyLimit(e.target.value) })
                }
              />
              <p
                className={cn(
                  "text-xs",
                  hourlyCapHit ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {MAX_MAILBOX_HOURLY_MESSAGE}
              </p>
            </div>
          </div>
        </Section>

        <Section
          icon={CalendarClock}
          title="Campaign dates"
          description="Optionally schedule a start date and an automatic stop."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="start-at">Start sending on</Label>
              <Input
                id="start-at"
                type="datetime-local"
                value={zonedDateTimeLocalValue(settings.startAt, settings.timezone)}
                onChange={(e) =>
                  patchSettings({
                    startAt: e.target.value
                      ? parseZonedDateTimeLocal(e.target.value, settings.timezone)?.toISOString() ?? null
                      : null,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Interpreted in {settings.timezone.replace("_", " ")}; the queue starts at the next allowed window.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-at">Stop sending on</Label>
              <Input
                id="end-at"
                type="datetime-local"
                value={zonedDateTimeLocalValue(settings.endAt, settings.timezone)}
                onChange={(e) =>
                  patchSettings({
                    endAt: e.target.value
                      ? parseZonedDateTimeLocal(e.target.value, settings.timezone)?.toISOString() ?? null
                      : null,
                  })
                }
              />
            </div>
          </div>
        </Section>
      </div>

      <aside className="space-y-4">
        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-primary" />
            <h3 className="font-semibold">Throughput estimate</h3>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Total leads</dt>
              <dd className="font-medium tabular-nums">{totalLeads.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Daily sending limit</dt>
              <dd className="font-medium tabular-nums">
                {selectedDaily > 0 ? `${selectedDaily.toLocaleString()}/day` : "Not set"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Sent today</dt>
              <dd className="font-medium tabular-nums">{sentToday.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Remaining today</dt>
              <dd className="font-medium tabular-nums">
                {selectedDaily > 0 ? Math.max(0, selectedDaily - sentToday).toLocaleString() : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Mailbox capacity / day</dt>
              <dd className="font-medium tabular-nums">
                {mailboxDailyCeiling > 0 ? mailboxDailyCeiling.toLocaleString() : "No mailboxes selected"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Sending days / week</dt>
              <dd className="font-medium tabular-nums">{settings.sendDays.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Window length</dt>
              <dd className="font-medium tabular-nums">{windowHours}h</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Estimated per hour</dt>
              <dd className="font-medium tabular-nums">{hourly.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-muted-foreground">Emails per sending day</dt>
              <dd className="font-semibold tabular-nums">{effectiveDaily.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Emails per week</dt>
              <dd className="font-semibold tabular-nums">{weekly.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            {cappedByMailboxes
              ? `You selected ${selectedDaily.toLocaleString()} emails a day, but the mailboxes on this campaign can only handle ${effectiveDaily.toLocaleString()} a day right now. Add or select more mailboxes to reach your target.`
              : mailboxDailyCeiling > 0
                ? "Your selected daily volume fits inside the capacity of the mailboxes on this campaign."
                : "Select mailboxes on the Accounts tab to see the real sending ceiling for this campaign."}
          </p>

        </div>
      </aside>
    </div>
  );
}
