import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { BackLink } from "@/components/app/BackLink";
import { GuidedMailboxForm } from "@/components/sending/GuidedMailboxForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/mailboxes/add-google")({
  head: () => ({
    meta: [
      { title: "Connect Gmail or G-Suite — MunchReach" },
      {
        name: "description",
        content:
          "Create a Google App password and connect your Gmail or G-Suite mailbox to MunchReach in three steps.",
      },
      { property: "og:title", content: "Connect Gmail or G-Suite" },
      {
        property: "og:description",
        content: "Enable 2-Step Verification, create an App password, and connect your mailbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectGooglePage,
});

const STEPS = [
  {
    label: "Go to your Google Account's Security Settings",
    href: "https://myaccount.google.com/security",
  },
  {
    label: "Enable 2-Step Verification",
    href: "https://myaccount.google.com/signinoptions/two-step-verification",
  },
  {
    label: "Create an App password",
    href: "https://myaccount.google.com/apppasswords",
    note: 'Select "Other" for both App and Device.',
  },
] as const;

function ConnectGooglePage() {
  return (
    <AppShell title="Gmail / G-Suite" description="Connect with a Google App password">
      <BackLink to="/mailboxes/add" />
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          to="/mailboxes/add"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All providers
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Create your App password</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {STEPS.map((step, index) => (
                <li key={step.href} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/70 text-xs font-medium">
                    {index + 1}
                  </span>
                  <span>
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium underline underline-offset-4"
                    >
                      {step.label}
                    </a>
                    {"note" in step && step.note ? (
                      <span className="block text-xs text-muted-foreground">{step.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <GuidedMailboxForm
          title="Connect your Google mailbox"
          passwordLabel="App Password"
          passwordHint="Use the 16-character App password, not your normal Google password. Server settings are applied for you."
          settings={{
            smtpHost: "smtp.gmail.com",
            smtpPort: 465,
            smtpSecurity: "ssl",
            imapHost: "imap.gmail.com",
            imapPort: 993,
            imapSecurity: "ssl",
          }}
        />
      </div>
    </AppShell>
  );
}
