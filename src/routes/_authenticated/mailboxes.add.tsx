import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ServerCog, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { MicrosoftMark } from "@/components/campaign/MailboxTypeBadge";

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

/** The three connection routes stay exactly as they are — presentation only. */
const OPTIONS = [
  {
    to: "/mailboxes/add-google",
    title: "Gmail / G-Suite",
    company: "Google",
    description: "Connect your Google mailbox securely with MunchReach.",
    method: "OAuth connection",
    cta: "Connect Google",
    logo: <GoogleIcon className="size-8" />,
  },
  {
    to: "/mailboxes/add-microsoft",
    title: "Office 365 / Outlook",
    company: "Microsoft",
    description: "Connect your Microsoft mailbox securely with MunchReach.",
    method: "OAuth connection",
    cta: "Connect Microsoft",
    logo: <MicrosoftMark className="size-7" />,
  },
  {
    to: "/mailboxes/add-imap",
    title: "IMAP / SMTP",
    company: "Any provider",
    description: "Connect mailboxes from other supported email providers.",
    method: "Manual mailbox connection",
    cta: "Connect with IMAP/SMTP",
    logo: <ServerCog className="size-8 text-muted-foreground" strokeWidth={1.75} />,
  },
] as const;

function ChooseProviderPage() {
  return (
    <AppShell title="Connect Existing" description="Choose the provider your mailbox is hosted on">
      <div className="mx-auto w-full max-w-[1160px] px-1 py-2 sm:py-6">
        <div className="grid gap-5 md:grid-cols-3 md:gap-6">
          {OPTIONS.map((option) => (
            <Link
              key={option.to}
              to={option.to}
              aria-label={option.cta}
              className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm outline-none transition-all duration-200 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring sm:p-7"
            >
              <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-background transition-colors duration-200 group-hover:border-primary/40">
                {option.logo}
              </span>

              <h2 className="mt-6 text-lg font-semibold tracking-tight text-foreground">
                {option.title}
              </h2>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {option.company}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {option.description}
              </p>

              <div className="mt-auto pt-7">
                <p className="text-xs font-medium text-muted-foreground">{option.method}</p>
                <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {option.cta}
                  <ArrowRight
                    className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Your credentials are securely encrypted and never exposed to other users.
        </p>
      </div>
    </AppShell>
  );
}
