import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  saveMailboxConnection,
  testMailboxConnection,
  type MailboxConnectionTest,
} from "@/lib/customer-mailboxes.functions";
import { suggestMailboxSettings, type MailSecurity } from "@/lib/mailbox-presets";

export const Route = createFileRoute("/_authenticated/mailboxes/connect")({
  head: () => ({
    meta: [
      { title: "Connect Your Mailbox — MunchReach" },
      {
        name: "description",
        content:
          "Connect your own mailbox to MunchReach with SMTP and IMAP, test both logins live, and save it once each one passes.",
      },
      { property: "og:title", content: "Connect Your Mailbox" },
      {
        property: "og:description",
        content: "Add your SMTP and IMAP details, test both connections and start sending.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectMailboxPage,
});

const SECURITY_OPTIONS: Array<{ value: MailSecurity; label: string }> = [
  { value: "ssl", label: "SSL" },
  { value: "tls", label: "TLS (STARTTLS)" },
  { value: "none", label: "None" },
];

type FormState = {
  emailAddress: string;
  /** Shown as the sender's name in the recipient's inbox. */
  displayName: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: MailSecurity;
  imapUsername: string;
  imapPassword: string;
};

const EMPTY: FormState = {
  emailAddress: "",
  displayName: "",
  smtpHost: "",
  smtpPort: "465",
  smtpSecurity: "ssl",
  smtpUsername: "",
  smtpPassword: "",
  imapHost: "",
  imapPort: "993",
  imapSecurity: "ssl",
  imapUsername: "",
  imapPassword: "",
};

function ConnectMailboxPage() {
  const { workspace } = useWorkspace();
  const runTest = useServerFn(testMailboxConnection);
  const runSave = useServerFn(saveMailboxConnection);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<MailboxConnectionTest | null>(null);
  const [presetNote, setPresetNote] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** Fills hosts, ports and usernames from the email domain. */
  const applySuggestions = (email: string) => {
    const preset = suggestMailboxSettings(email);
    if (!preset) return;
    setPresetNote(preset.note ?? `Settings suggested for ${preset.provider}.`);
    setForm((current) => ({
      ...current,
      smtpHost: preset.smtpHost,
      smtpPort: String(preset.smtpPort),
      smtpSecurity: preset.smtpSecurity,
      imapHost: preset.imapHost,
      imapPort: String(preset.imapPort),
      imapSecurity: preset.imapSecurity,
      smtpUsername: current.smtpUsername || email.trim().toLowerCase(),
      imapUsername: current.imapUsername || email.trim().toLowerCase(),
    }));
  };

  const payload = useMemo(
    () => ({
      workspaceId: workspace?.id ?? "",
      emailAddress: form.emailAddress.trim(),
      ...(form.displayName.trim() ? { displayName: form.displayName.trim() } : {}),
      smtp: {
        host: form.smtpHost.trim(),
        port: Number(form.smtpPort),
        security: form.smtpSecurity,
        username: form.smtpUsername.trim(),
        password: form.smtpPassword,
      },
      imap: {
        host: form.imapHost.trim(),
        port: Number(form.imapPort),
        security: form.imapSecurity,
        username: form.imapUsername.trim(),
        password: form.imapPassword,
      },
    }),
    [form, workspace?.id],
  );

  const complete =
    Boolean(workspace?.id) &&
    payload.emailAddress.includes("@") &&
    Object.values(payload.smtp).every((v) => v !== "" && v !== 0 && !Number.isNaN(v)) &&
    Object.values(payload.imap).every((v) => v !== "" && v !== 0 && !Number.isNaN(v));

  const test = useMutation({
    mutationFn: () => runTest({ data: payload }),
    onSuccess: (data) => {
      setResult(data);
      if (data.ok) toast.success("Both logins succeeded — you can save this mailbox.");
      else toast.error("One or both logins failed. See the details below.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () =>
      runSave({ data: { ...payload, dailySendLimit: 50, warmupEnabled: false } }),
    onSuccess: (data) => {
      setResult(data);
      if (data.status === "connected") {
        toast.success("Mailbox connected and saved.");
        setForm((current) => ({ ...current, smtpPassword: "", imapPassword: "" }));
      } else {
        toast.error("Saved as pending — the logins did not both pass.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = test.isPending || save.isPending;

  return (
    <AppShell
      title="Connect Your Mailbox"
      description="Use your own mailbox over SMTP and IMAP"
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mailbox details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="email-address">Email address</Label>
              <Input
                id="email-address"
                type="email"
                autoComplete="off"
                value={form.emailAddress}
                onChange={(event) => set("emailAddress", event.target.value)}
                onBlur={(event) => applySuggestions(event.target.value)}
                placeholder="you@yourdomain.com"
              />
              {presetNote ? (
                <p className="text-xs text-muted-foreground">{presetNote}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  We suggest the right servers and ports for Gmail, Outlook / Office 365, Zoho,
                  Hostinger and Namecheap Private Email / Titan.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sender-name">Name</Label>
              <Input
                id="sender-name"
                autoComplete="off"
                value={form.displayName}
                onChange={(event) => set("displayName", event.target.value)}
                placeholder="Michael Scott"
              />
              <p className="text-xs text-muted-foreground">
                This is the name recipients see next to your address on campaigns and replies.
                Leave it empty to show only the email address.
              </p>
            </div>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Outgoing mail (SMTP)</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="smtp-host">SMTP host</Label>
                  <Input
                    id="smtp-host"
                    value={form.smtpHost}
                    onChange={(event) => set("smtpHost", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">SMTP port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.smtpPort}
                    onChange={(event) => set("smtpPort", event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>SMTP security</Label>
                  <Select
                    value={form.smtpSecurity}
                    onValueChange={(value) => set("smtpSecurity", value as MailSecurity)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECURITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-username">SMTP username</Label>
                  <Input
                    id="smtp-username"
                    autoComplete="off"
                    value={form.smtpUsername}
                    onChange={(event) => set("smtpUsername", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-password">SMTP password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.smtpPassword}
                    onChange={(event) => set("smtpPassword", event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Incoming mail (IMAP)</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="imap-host">IMAP host</Label>
                  <Input
                    id="imap-host"
                    value={form.imapHost}
                    onChange={(event) => set("imapHost", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-port">IMAP port</Label>
                  <Input
                    id="imap-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.imapPort}
                    onChange={(event) => set("imapPort", event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>IMAP security</Label>
                  <Select
                    value={form.imapSecurity}
                    onValueChange={(value) => set("imapSecurity", value as MailSecurity)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECURITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-username">IMAP username</Label>
                  <Input
                    id="imap-username"
                    autoComplete="off"
                    value={form.imapUsername}
                    onChange={(event) => set("imapUsername", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap-password">IMAP password</Label>
                  <Input
                    id="imap-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.imapPassword}
                    onChange={(event) => set("imapPassword", event.target.value)}
                  />
                </div>
              </div>
            </section>

            {result ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-4">
                <ResultRow label="SMTP" ok={result.smtp.ok} message={result.smtp.message} />
                <ResultRow label="IMAP" ok={result.imap.ok} message={result.imap.message} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!complete || busy}
                onClick={() => test.mutate()}
              >
                {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Test Connection
              </Button>
              <Button type="button" disabled={!complete || busy} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save mailbox
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving re-tests both logins. The mailbox is only marked connected when SMTP and IMAP
              both succeed; otherwise it stays pending with the errors shown above. Passwords are
              stored encrypted and never shown again.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ResultRow({ label, ok, message }: { label: string; ok: boolean; message: string }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      <span>
        <span className="font-medium">{label}:</span> {message}
      </span>
    </p>
  );
}
