import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { MarketingLayout, PageHero, Section, metaFor } from "@/components/site/MarketingPage";
import { listPublicGuide } from "@/lib/trust-center.functions";
import { ALERT_TYPE_LABEL, ALERT_TYPE_STYLE } from "@/lib/trust-center-model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/user-guide")({
  head: () =>
    metaFor(
      "User Guide & Service Alerts — MunchReach",
      "Step-by-step guides for getting started, sending and deliverability, account and billing — plus live MunchReach service alerts.",
      "/user-guide",
    ),
  component: UserGuidePage,
});

/** Baseline guide shipped with the product; admins can publish more in Admin → User Guide. */
const baseGuide: { category: string; title: string; summary: string; steps: string[] }[] = [
  {
    category: "Getting Started",
    title: "Set up MunchReach end to end",
    summary: "From a new account to a live campaign, step by step.",
    steps: [
      "Create your account and confirm your email address.",
      "Create a workspace — each workspace has its own leads, campaigns, mailboxes and team.",
      "Connect the mailbox you send from — Gmail, Microsoft 365 or any IMAP/SMTP account.",
      "Send a test message from that mailbox to confirm sending and receiving both work.",
      "Import leads from CSV, map the columns to fields, and let duplicate detection clean the list.",
      "Create a campaign: write the sequence, add follow-up steps and delays, and set your sending schedule.",
      "Launch the campaign. Sending starts inside your schedule and respects your plan and mailbox limits.",
    ],
  },
  {
    category: "Sending & Deliverability",
    title: "Protect your sending reputation",
    summary: "Mailbox setup, warmup, limits, bounces, unsubscribes and replies.",
    steps: [
      "Mailbox connection: every mailbox is tested for sending and receiving before it is enabled, and a paused or failing mailbox is never used to send.",
      "Warmup: ramp a new mailbox gradually before real campaigns. Warmup traffic is fully separated from campaign traffic and never counted in campaign analytics.",
      "Sending limits: each mailbox has a daily cap, and your plan has a monthly email allowance. Sending pauses when a cap is reached rather than pushing volume through.",
      "Bounce handling: hard bounces suppress the address automatically so it is never contacted again from your workspace.",
      "Unsubscribe handling: every campaign can include an unsubscribe link; opt-outs are suppressed instantly across the workspace.",
      "Reply handling: replies land in the Unified Inbox, stop the follow-up sequence for that lead, and update the lead's status.",
    ],
  },
  {
    category: "Account & Billing",
    title: "Plans, usage and billing",
    summary: "How allowances, upgrades and downgrades work.",
    steps: [
      "Plans: each plan sets a lead capacity, a monthly email allowance, daily send limits and the number of workspaces you can own.",
      "Usage limits: usage is metered per billing cycle and shown in the dashboard. When an allowance is exhausted, sending stops until the cycle resets or you upgrade.",
      "Upgrades: take effect immediately and raise your limits straight away.",
      "Downgrades: apply from the next billing cycle so nothing in flight is interrupted; usage over the new limits must be reduced before the cycle starts.",
      "Billing: invoices, payment method and subscription state live in Settings → Billing.",
    ],
  },
];

function UserGuidePage() {
  const fetchGuide = useServerFn(listPublicGuide);
  const { data } = useQuery({
    queryKey: ["public-user-guide"],
    queryFn: () => fetchGuide({}),
  });

  const alerts = data?.alerts ?? [];
  const articles = data?.articles ?? [];
  const categories = [...new Set(articles.map((a) => a.category))];

  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Support"
        title="User guide &"
        highlight="service alerts"
        description="Everything you need to launch, send safely and manage your account — plus the current status of the MunchReach platform."
      />

      <Section title="Service alerts">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 px-5 py-6">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-semibold">No active service alerts</p>
              <p className="text-sm text-muted-foreground">
                Maintenance windows, incidents and important platform notices appear here.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                      ALERT_TYPE_STYLE[a.alert_type] ?? ALERT_TYPE_STYLE["information"],
                    )}
                  >
                    {ALERT_TYPE_LABEL[a.alert_type] ?? a.alert_type}
                  </span>
                  <h3 className="text-base font-semibold">{a.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    Started {new Date(a.starts_at).toLocaleString()}
                  </span>
                </div>
                {a.message ? (
                  <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{a.message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {baseGuide.map((section) => (
        <Section key={section.title} title={section.category} muted={section.category === "Sending & Deliverability"}>
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h3 className="text-lg font-semibold">{section.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
            <ol className="mt-5 space-y-3">
              {section.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      ))}

      {categories.map((category) => (
        <Section key={category} title={category}>
          <div className="grid gap-4 md:grid-cols-2">
            {articles
              .filter((a) => a.category === category)
              .map((a) => (
                <article key={a.id} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="text-base font-semibold">{a.title}</h3>
                  {a.summary ? (
                    <p className="mt-1 text-sm text-muted-foreground">{a.summary}</p>
                  ) : null}
                  {a.body ? (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {a.body}
                    </p>
                  ) : null}
                </article>
              ))}
          </div>
        </Section>
      ))}

      <Section muted>
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Still stuck?</p>
              <p className="text-sm text-muted-foreground">
                Open a ticket and a real person on the team will pick it up.
              </p>
            </div>
          </div>
          <a
            href="/contact-support"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Contact support
          </a>
        </div>
      </Section>
    </MarketingLayout>
  );
}
