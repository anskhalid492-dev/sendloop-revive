import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listMailboxes } from "@/lib/customer-mailboxes.functions";
import { disconnectMicrosoftMailbox, initiateMicrosoftMailboxOAuth } from "@/lib/microsoft-oauth.functions";

import { AppShell } from "@/components/app/AppShell";
import { BackLink } from "@/components/app/BackLink";
import { GuidedMailboxForm } from "@/components/sending/GuidedMailboxForm";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/mailboxes/add-microsoft")({
  head: () => ({
    meta: [
      { title: "Connect Office 365 or Outlook — MunchReach" },
      {
        name: "description",
        content:
          "Connect Microsoft 365 or a free Outlook.com mailbox securely with Microsoft sign-in.",
      },
      { property: "og:title", content: "Connect Office 365 or Outlook" },
      {
        property: "og:description",
        content: "Connect Microsoft 365 or Outlook.com with OAuth, without enabling SMTP AUTH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectMicrosoftPage,
});

const MICROSOFT_DIRECT = [
  "Log into the Microsoft 365 Admin center with an administrator account.",
  "Open Users, then Active Users.",
  "Select the user whose mailbox you want to connect.",
  "Open the Mail tab.",
  "Click Manage email apps.",
  "Tick both Authenticated SMTP and IMAP.",
  "Click Save changes.",
  "Wait up to an hour for the change to take effect before connecting here.",
];

const GODADDY = [
  "Log into your GoDaddy account.",
  "Open My Products.",
  "Scroll to the Email and Office section.",
  "Click Manage All.",
  "Find the user whose mailbox you want to connect.",
  "Click Manage next to that user.",
  "Open Advanced Settings.",
  "Turn on SMTP Authentication.",
  "Wait up to an hour for the change to take effect before connecting here.",
];

function ConnectMicrosoftPage() {
  const [ready, setReady] = useState(false);

  return (
    <AppShell title="Office 365 / Outlook" description="Connect with Microsoft sign-in">
      <BackLink to="/mailboxes/add" />
      <div className="mx-auto max-w-3xl space-y-6">
        <MicrosoftSignInCard />
        <Card>
          <CardHeader>
            <CardTitle>Legacy SMTP / IMAP connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These settings apply only to password-based connections permitted by your organization.
              Microsoft sign-in above does not require SMTP AUTH; use it for free Outlook.com accounts or SMTP 535 5.7.139 errors.
            </p>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="microsoft">
                <AccordionTrigger>
                  Microsoft accounts purchased directly from Microsoft
                </AccordionTrigger>
                <AccordionContent>
                  <Steps items={MICROSOFT_DIRECT} />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="godaddy">
                <AccordionTrigger>
                  Microsoft accounts purchased directly from GoDaddy
                </AccordionTrigger>
                <AccordionContent>
                  <Steps items={GODADDY} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {!ready ? (
              <Button type="button" onClick={() => setReady(true)}>
                Yes, SMTP has been enabled
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {ready ? (
          <GuidedMailboxForm
            title="Connect your Microsoft mailbox"
            passwordLabel="Password"
            passwordHint="If multi-factor authentication is on, use an app password instead of the account password. Server settings are applied for you."
            settings={{
              smtpHost: "smtp.office365.com",
              smtpPort: 587,
              smtpSecurity: "tls",
              imapHost: "outlook.office365.com",
              imapPort: 993,
              imapSecurity: "ssl",
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

function MicrosoftSignInCard() {
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const initiate = useServerFn(initiateMicrosoftMailboxOAuth);
  const disconnect = useServerFn(disconnectMicrosoftMailbox);
  const list = useServerFn(listMailboxes);
  const workspaceId = workspace?.id ?? "";
  const mailboxes = useQuery({
    queryKey: ["mailboxes", workspaceId], enabled: !!workspaceId,
    queryFn: () => list({ data: { workspaceId } }),
  });
  const start = useMutation({
    mutationFn: () => initiate({ data: { workspaceId } }),
    onSuccess: (r) => { window.location.assign(r.authorizationUrl); },
  });
  const stop = useMutation({
    mutationFn: (mailboxId: string) => disconnect({ data: { mailboxId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mailboxes", workspaceId] }),
  });
  const graph = (mailboxes.data ?? []).filter((m) => m.smtp_host === "graph.microsoft.com");
  return (
    <Card>
      <CardHeader><CardTitle>Sign in with Microsoft (recommended)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect Microsoft 365 or free Outlook.com with Microsoft sign-in. No password or SMTP setting is needed.
          Signing in with the same address upgrades an existing Microsoft SMTP connection without removing its history.
        </p>
        <Button type="button" disabled={!workspaceId || start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? "Opening Microsoft…" : "Sign in with Microsoft"}
        </Button>
        {start.error ? <p className="text-sm text-destructive">{start.error.message}</p> : null}
        {graph.length ? (
          <ul className="space-y-2">
            {graph.map((m) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border p-3 text-sm">
                <span className="min-w-0 truncate">{m.email_address} · {m.status === "connected" ? "Connected" : "Not connected"}</span>
                {m.status === "connected" ? (
                  <Button size="sm" variant="outline" disabled={stop.isPending} onClick={() => stop.mutate(m.id)}>Disconnect</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={start.isPending} onClick={() => start.mutate()}>Reconnect</Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {stop.error ? <p className="text-sm text-destructive">{stop.error.message}</p> : null}
      </CardContent>
    </Card>
  );
}
