import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
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
          "Enable SMTP access on your Microsoft 365 or GoDaddy-hosted mailbox, then connect it to MunchReach.",
      },
      { property: "og:title", content: "Connect Office 365 or Outlook" },
      {
        property: "og:description",
        content: "Turn on Authenticated SMTP and IMAP, then connect your Microsoft mailbox.",
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
    <AppShell title="Office 365 / Outlook" description="Enable SMTP access, then connect">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          to="/mailboxes/add"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All providers
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Enable SMTP access on your mailbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Microsoft blocks app sign-ins until SMTP and IMAP are switched on for the mailbox.
              Follow the steps that match where you bought the account.
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
