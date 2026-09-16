import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  saveMailboxConnection,
  type MailboxSaveResult,
} from "@/lib/customer-mailboxes.functions";
import type { MailSecurity } from "@/lib/mailbox-presets";

export type MailboxServerSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
};

/**
 * Name / Last Name / Email / Password form for a known provider.
 *
 * Server settings are fixed for the provider and never shown as fields; saving
 * goes through the same test-and-save server function as the manual form.
 */
export function GuidedMailboxForm({
  title,
  passwordLabel,
  passwordHint,
  settings,
}: {
  title: string;
  passwordLabel: string;
  passwordHint?: ReactNode;
  settings: MailboxServerSettings;
}) {
  const { workspace } = useWorkspace();
  const runSave = useServerFn(saveMailboxConnection);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<MailboxSaveResult | null>(null);

  const address = email.trim().toLowerCase();
  const ready = Boolean(workspace?.id) && address.includes("@") && password.length > 0;

  const save = useMutation({
    mutationFn: () =>
      runSave({
        data: {
          workspaceId: workspace?.id ?? "",
          emailAddress: address,
          displayName: [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || undefined,
          dailySendLimit: 50,
          warmupEnabled: false,
          smtp: {
            host: settings.smtpHost,
            port: settings.smtpPort,
            security: settings.smtpSecurity,
            username: address,
            password,
          },
          imap: {
            host: settings.imapHost,
            port: settings.imapPort,
            security: settings.imapSecurity,
            username: address,
            password,
          },
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      if (data.status === "connected") {
        toast.success("Mailbox connected.");
        setPassword("");
      } else {
        toast.error("Saved as pending — the logins did not both pass.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mb-first">Name</Label>
            <Input
              id="mb-first"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Jane"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mb-last">Last Name</Label>
            <Input
              id="mb-last"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Doe"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mb-email">Email</Label>
            <Input
              id="mb-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mb-password">{passwordLabel}</Label>
            <Input
              id="mb-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>
        {passwordHint ? (
          <p className="text-xs text-muted-foreground">{passwordHint}</p>
        ) : null}

        {result ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-4">
            <ResultRow label="SMTP" ok={result.smtp.ok} message={result.smtp.message} />
            <ResultRow label="IMAP" ok={result.imap.ok} message={result.imap.message} />
          </div>
        ) : null}

        <Button type="button" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Connect
        </Button>
        <p className="text-xs text-muted-foreground">
          We test the outgoing and incoming logins before saving. The mailbox is only marked
          connected when both pass; otherwise it stays pending with the errors shown above.
        </p>
      </CardContent>
    </Card>
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
