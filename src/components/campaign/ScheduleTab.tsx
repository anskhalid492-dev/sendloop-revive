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
import { DAY_LABELS, TIMEZONES } from "@/lib/campaign-schedule";
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

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleTab({ builder }: { builder: CampaignBuilder }) {
  const { settings, patchSettings } = builder;
  if (!settings) return null;

  const toggleDay = (day: number) => {
    const next = settings.sendDays.includes(day)
      ? settings.sendDays.filter((d) => d !== day)
      : [...settings.sendDays, day].sort();
    patchSettings({ sendDays: next });
  };

  const windowHours = Math.max(0, settings.sendEndHour - settings.sendStartHour);
  const perHourCeiling = Math.min(
    settings.maxPerHour,
    settings.minDelayMinutes > 0 ? Math.floor(60 / settings.minDelayMinutes) : settings.maxPerHour,
  );
  const theoreticalDaily = Math.min(settings.dailyCap, windowHours * perHourCeiling);

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
              <Label htmlFor="daily-cap">Daily cap for this campaign</Label>
              <Input
                id="daily-cap"
                type="number"
                min={1}
                max={100000}
                value={settings.dailyCap}
                onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-hour">Max emails per hour</Label>
              <Input
                id="max-hour"
                type="number"
                min={1}
                max={5000}
                value={settings.maxPerHour}
                onChange={(e) => patchSettings({ maxPerHour: Number(e.target.value) || 1 })}
              />
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
                value={toLocalInput(settings.startAt)}
                onChange={(e) =>
                  patchSettings({
                    startAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-at">Stop sending on</Label>
              <Input
                id="end-at"
                type="datetime-local"
                value={toLocalInput(settings.endAt)}
                onChange={(e) =>
                  patchSettings({
                    endAt: e.target.value ? new Date(e.target.value).toISOString() : null,
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
              <dt className="text-muted-foreground">Sending days / week</dt>
              <dd className="font-medium tabular-nums">{settings.sendDays.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Window length</dt>
              <dd className="font-medium tabular-nums">{windowHours}h</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Max per hour</dt>
              <dd className="font-medium tabular-nums">{perHourCeiling}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-muted-foreground">Emails per sending day</dt>
              <dd className="font-semibold tabular-nums">{theoreticalDaily}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Emails per week</dt>
              <dd className="font-semibold tabular-nums">
                {theoreticalDaily * settings.sendDays.length}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            MunchReach still respects the limits of the managed mailboxes assigned to your workspace,
            so real volume can be lower than this ceiling.
          </p>
        </div>
      </aside>
    </div>
  );
}
