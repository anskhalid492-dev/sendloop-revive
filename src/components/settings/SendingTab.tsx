import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SenderStatusList } from "@/components/settings/SenderStatusList";
import { getSendingSettings, saveSendingSettings } from "@/lib/settings.functions";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function SendingTab({ workspaceId }: { workspaceId: string | null }) {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getSendingSettings);
  const saveFn = useServerFn(saveSendingSettings);

  const [timezone, setTimezone] = useState("UTC");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(17);

  const query = useQuery({
    queryKey: ["sending-settings", workspaceId],
    queryFn: () => fetchSettings({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (!query.data) return;
    setTimezone(query.data.sendingTimezone);
    setDays(query.data.sendDays);
    setStartHour(query.data.sendStartHour);
    setEndHour(query.data.sendEndHour);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          workspaceId: workspaceId!,
          sendingTimezone: timezone,
          sendDays: days,
          sendStartHour: startHour,
          sendEndHour: endHour,
        },
      }),
    onSuccess: async () => {
      toast.success("Sending schedule saved");
      await queryClient.invalidateQueries({ queryKey: ["sending-settings", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!workspaceId) {
    return (
      <div className="surface-card p-6 text-sm text-muted-foreground">
        Create a workspace to configure sending.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sending settings…
      </div>
    );
  }

  const canEdit = query.data?.canEdit ?? false;

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 p-4">
          <div>
            <h2 className="text-base font-semibold">Connected mailboxes</h2>
            <p className="text-sm text-muted-foreground">
              Domain verification and connection status for every sender.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/sending">Manage mailboxes</Link>
          </Button>
        </div>
        <SenderStatusList workspaceId={workspaceId} />
      </section>

      <section className="surface-card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">Sending schedule</h2>
          <p className="text-sm text-muted-foreground">
            Campaigns only send inside this window, in the timezone you choose.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Sending timezone</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([timezone, ...TIMEZONES])).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start-hour">Start hour</Label>
            <Input
              id="start-hour"
              type="number"
              min={0}
              max={23}
              value={startHour}
              disabled={!canEdit}
              onChange={(event) => setStartHour(Number(event.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-hour">End hour</Label>
            <Input
              id="end-hour"
              type="number"
              min={1}
              max={24}
              value={endHour}
              disabled={!canEdit}
              onChange={(event) => setEndHour(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Sending days</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const active = days.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    setDays((current) =>
                      current.includes(day.value)
                        ? current.filter((d) => d !== day.value)
                        : [...current, day.value].sort(),
                    )
                  }
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-60",
                    active
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={!canEdit || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save schedule
          </Button>
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">
              Only workspace owners and admins can change the sending schedule.
            </p>
          ) : null}
        </div>
      </section>

      <section className="surface-card space-y-3 p-6">
        <h2 className="text-base font-semibold">Daily limits and warmup</h2>
        <p className="text-sm text-muted-foreground">
          Average daily limit across your mailboxes:{" "}
          <span className="font-medium text-foreground">
            {query.data?.defaultDailyLimit ?? "—"}
          </span>{" "}
          emails · {query.data?.mailboxes ?? 0} mailbox
          {(query.data?.mailboxes ?? 0) === 1 ? "" : "es"} connected.
        </p>
        <p className="text-sm text-muted-foreground">
          Per-mailbox limits and warmup ramp settings live with each mailbox so you can tune them
          individually. Sending infrastructure is managed by MunchReach.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/sending">Mailbox limits</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/warmup">Warmup preferences</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
