import { BarChart3, Building2, MailX, ShieldCheck, Shuffle } from "lucide-react";

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
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MailX;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function OptionsTab({ builder }: { builder: CampaignBuilder }) {
  const { settings, patchSettings } = builder;
  if (!settings) return null;

  const selectedAccountCount = settings.sendingAccountIds.length;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
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
                {INBOX_ROTATION_STRATEGIES.find(
                  (s) => s.value === settings.inboxRotationStrategy,
                )?.hint}
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

      <Group icon={MailX} title="Stop conditions">
        <Toggle
          title="Stop when a lead replies"
          description="Remaining follow-ups are cancelled as soon as a reply lands."
          checked={settings.stopOnReply}
          onChange={(v) => patchSettings({ stopOnReply: v })}
        />
        <Toggle
          title="Stop the whole company on reply"
          description="Pause every other contact at the same company when one person replies."
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
            onChange={(e) =>
              patchSettings({ maxContactsPerCompany: Number(e.target.value) || 1 })
            }
          />
          <p className="text-xs text-muted-foreground">
            Protects accounts from receiving the same pitch from several inboxes.
          </p>
        </div>
      </Group>

      <Group icon={BarChart3} title="Tracking">
        <Toggle
          title="Open tracking"
          description="Adds an invisible pixel. Turn off for the best deliverability."
          checked={settings.openTracking}
          onChange={(v) => patchSettings({ openTracking: v })}
        />
        <Toggle
          title="Click tracking"
          description="Rewrites links so clicks are attributed to the campaign."
          checked={settings.clickTracking}
          onChange={(v) => patchSettings({ clickTracking: v })}
        />
        <Toggle
          title="Send plain text only"
          description="Strips HTML so emails look like a normal 1:1 message."
          checked={settings.textOnly}
          onChange={(v) => patchSettings({ textOnly: v })}
        />
      </Group>

      <Group icon={ShieldCheck} title="Compliance">
        <Toggle
          title="Include unsubscribe link"
          description="Appends a one-click opt-out footer to every email in the sequence."
          checked={settings.unsubscribeEnabled}
          onChange={(v) => patchSettings({ unsubscribeEnabled: v })}
        />
      </Group>

      <Group icon={Building2} title="Deliverability checklist">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            {settings.textOnly ? "✓" : "•"} Plain-text sending is{" "}
            {settings.textOnly ? "on" : "off"} — plain text usually lands in the primary tab.
          </li>
          <li>
            {settings.openTracking ? "•" : "✓"} Open tracking is{" "}
            {settings.openTracking ? "on" : "off"} — tracking pixels can hurt inbox placement.
          </li>
          <li>
            {settings.minDelayMinutes >= 2 ? "✓" : "•"} Minimum delay is{" "}
            {settings.minDelayMinutes} min — 2 minutes or more looks human.
          </li>
          <li>
            {settings.sendingAccountIds.length > 1 ? "✓" : "•"}{" "}
            {settings.sendingAccountIds.length} mailbox
            {settings.sendingAccountIds.length === 1 ? "" : "es"} in rotation — more mailboxes
            spread the volume.
          </li>
        </ul>
      </Group>
    </div>
  );
}
