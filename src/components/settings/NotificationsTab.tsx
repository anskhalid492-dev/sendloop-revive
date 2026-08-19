import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/settings.functions";

const ITEMS: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: "new_replies", label: "New replies", hint: "A prospect replies to one of your campaigns." },
  { key: "campaign_completed", label: "Campaign completed", hint: "A campaign finishes sending." },
  { key: "bounce_alerts", label: "Bounce alerts", hint: "Bounce rate crosses a safe threshold." },
  {
    key: "deliverability_alerts",
    label: "Deliverability alerts",
    hint: "Domain or mailbox reputation needs attention.",
  },
  { key: "warmup_alerts", label: "Warmup alerts", hint: "Warmup pauses or health drops." },
  { key: "team_activity", label: "Team activity", hint: "Invitations, joins and role changes." },
  { key: "support_updates", label: "Support updates", hint: "A reply lands on one of your tickets." },
  { key: "referral_updates", label: "Referral updates", hint: "New referral signups, commission decisions and payouts." },
];

export function NotificationsTab() {
  const queryClient = useQueryClient();
  const fetchPrefs = useServerFn(getNotificationPreferences);
  const savePrefs = useServerFn(saveNotificationPreferences);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);

  const query = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => fetchPrefs(),
  });

  useEffect(() => {
    if (query.data) setPrefs(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => savePrefs({ data: prefs! }),
    onSuccess: async () => {
      toast.success("Notification preferences saved");
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading || !prefs) {
    return (
      <div className="surface-card flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  const toggle = (key: keyof NotificationPreferences) => (value: boolean) =>
    setPrefs((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-6">
      <section className="surface-card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">Delivery channels</h2>
          <p className="text-sm text-muted-foreground">
            Choose where notifications reach you. In-app alerts appear in your notification bell.
          </p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">In-app notifications</span>
            <Switch checked={prefs.in_app_enabled} onCheckedChange={toggle("in_app_enabled")} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Email notifications</span>
            <Switch checked={prefs.email_enabled} onCheckedChange={toggle("email_enabled")} />
          </label>
        </div>
      </section>

      <section className="surface-card space-y-4 p-6">
        <h2 className="text-base font-semibold">What to notify me about</h2>
        <div className="divide-y divide-border/60">
          {ITEMS.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-4 py-3">
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </span>
              <Switch
                checked={Boolean(prefs[item.key])}
                onCheckedChange={toggle(item.key)}
              />
            </label>
          ))}
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Save preferences
        </Button>
      </section>
    </div>
  );
}
