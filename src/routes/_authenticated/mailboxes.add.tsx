import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Server } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/mailboxes/add")({
  head: () => ({
    meta: [
      { title: "Connect Existing Mailbox — MunchReach" },
      {
        name: "description",
        content:
          "Choose how to connect an existing mailbox to MunchReach: Gmail / G-Suite, Office 365 / Outlook, or any IMAP / SMTP provider.",
      },
      { property: "og:title", content: "Connect Existing Mailbox" },
      {
        property: "og:description",
        content: "Pick your email provider and connect your mailbox in a few steps.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChooseProviderPage,
});

const OPTIONS = [
  {
    to: "/mailboxes/add-google",
    title: "Gmail / G-Suite",
    subtitle: "Google",
    icon: <GoogleIcon className="size-6" />,
  },
  {
    to: "/mailboxes/add-microsoft",
    title: "Office 365 / Outlook",
    subtitle: "Microsoft",
    icon: <Mail className="size-6 text-muted-foreground" />,
  },
  {
    to: "/mailboxes/add-imap",
    title: "IMAP / SMTP",
    subtitle: "Any provider",
    icon: <Server className="size-6 text-muted-foreground" />,
  },
] as const;

function ChooseProviderPage() {
  return (
    <AppShell title="Connect Existing" description="Choose the provider your mailbox is hosted on">
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <Link key={option.to} to={option.to} className="block">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
              <CardContent className="flex h-full flex-col items-start gap-3 p-6">
                {option.icon}
                <div>
                  <p className="font-medium">{option.title}</p>
                  <p className="text-sm text-muted-foreground">{option.subtitle}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
