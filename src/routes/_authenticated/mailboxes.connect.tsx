/**
 * Direct link to the mailbox connection form.
 *
 * Kept as its own route so existing links and bookmarks keep working. It
 * renders the same shared form as the "Advanced Setup" tab, driving the same
 * connection, storage and warm-up services.
 */
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { BackLink } from "@/components/app/BackLink";
import { MailboxConnectForm } from "@/components/mailbox/MailboxConnectForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/mailboxes/connect")({
  head: () => ({
    meta: [
      { title: "Connect Your Mailbox — MunchReach" },
      {
        name: "description",
        content:
          "Connect your own mailbox to MunchReach with IMAP and SMTP, test both connections live, and connect it once each one passes.",
      },
      { property: "og:title", content: "Connect Your Mailbox" },
      {
        property: "og:description",
        content: "Add your incoming and outgoing server details, test both connections and start sending.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConnectMailboxPage,
});

function ConnectMailboxPage() {
  return (
    <AppShell title="Connect Your Mailbox" description="Use your own mailbox over IMAP and SMTP">
      <BackLink to="/mailboxes/add" />
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mailbox details</CardTitle>
          </CardHeader>
          <CardContent>
            <MailboxConnectForm mode="advanced" />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
