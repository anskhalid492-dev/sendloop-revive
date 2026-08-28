import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getSesSystemStatus, sendSesTestEmail } from "@/lib/transactional-email.functions";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * Amazon SES posture + explicit enable control for system email delivery.
 * Templates, senders and tracking are unchanged — SES only carries the message.
 */
export function SesSystemEmailPanel({
  enabled,
  onToggle,
  toggling,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  toggling: boolean;
}) {
  const statusFn = useServerFn(getSesSystemStatus);
  const testFn = useServerFn(sendSesTestEmail);
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["admin", "ses-status"],
    queryFn: () => statusFn({}),
  });
  const status = statusQuery.data;

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { from: from || (status?.senders?.[0] ?? ""), to } }),
    onSuccess: (res) => {
      setResult(res.ok ? `SES Message ID: ${res.messageId ?? "—"}` : res.detail);
      if (res.ok) toast.success("Test email sent through Amazon SES");
      else toast.error(res.detail || "SES test failed");
      void queryClient.invalidateQueries({ queryKey: ["admin", "ses-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quota = status?.quota ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Amazon SES</CardTitle>
          <CardDescription>
            Connection posture. Configuring SES never switches production sending on its own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking SES…</p>
          ) : (
            <>
              <Row
                label="Connection status"
                value={
                  <Badge variant={status?.connected ? "default" : "secondary"}>
                    {status?.connected ? "Connected" : "Not connected"}
                  </Badge>
                }
              />
              <Row label="AWS region" value={status?.region ?? "—"} />
              <Row
                label="Sending identities"
                value={
                  status?.identities?.length
                    ? status.identities.map((i) => `${i.domain} (${i.state})`).join(", ")
                    : "—"
                }
              />
              <Row
                label="Verification status"
                value={
                  status?.identities?.length
                    ? status.identities.every((i) => i.state === "verified")
                      ? "Verified"
                      : "Pending"
                    : "Unknown"
                }
              />
              <Row
                label="Sandbox / production"
                value={quota?.productionAccess ? "Production access" : "Sandbox"}
              />
              <Row label="Sending limit (24h)" value={quota?.max24HourSend ?? "—"} />
              <Row label="Rate limit (per second)" value={quota?.maxSendRate ?? "—"} />
              <Row label="Sent in last 24h" value={quota?.sentLast24Hours ?? "—"} />
              <div className="mt-4 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Enable Amazon SES for system emails</p>
                  <p className="text-xs text-muted-foreground">
                    When off, the existing provider keeps sending exactly as before.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  disabled={toggling || !status?.connected}
                  onCheckedChange={onToggle}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send SES test email</CardTitle>
          <CardDescription>
            Uses a MunchReach sender identity and reports the SES Message ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Sender identity</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={from || (status?.senders?.[0] ?? "")}
              onChange={(e) => setFrom(e.target.value)}
            >
              {(status?.senders ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Recipient</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            onClick={() => sendTest.mutate()}
            disabled={!to || sendTest.isPending || !status?.connected}
          >
            {sendTest.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send test email
          </Button>
          {result ? (
            <p className="break-all rounded-md bg-muted p-3 text-xs">{result}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
