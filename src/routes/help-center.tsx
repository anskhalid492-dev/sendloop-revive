import { createFileRoute, Link } from "@tanstack/react-router";
import { LifeBuoy, Mail, Plug, CreditCard, Users, AlertTriangle, Search, MessageCircle } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FaqBlock,
  CtaBlock,
  ResourceList,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  { q: "My SMTP connection test fails — what now?", a: "Check the host and port (587 with STARTTLS is most common), confirm the password is an app password rather than the account password, and make sure the provider allows third-party SMTP for that mailbox." },
  { q: "Why did my import skip rows?", a: "Rows are skipped when the email is invalid, duplicated inside the file, or already exists in the workspace. The import summary lists each reason with counts." },
  { q: "A teammate cannot see a campaign.", a: "Campaign visibility follows workspace roles. Analysts and client viewers get read access; campaign managers and above can edit." },
  { q: "How do I cancel or downgrade?", a: "Open Settings, then Billing, and change the plan. Downgrades take effect at the end of the current period and your data is retained." },
  { q: "How fast is support?", a: "Under one business day on all plans, with priority routing for agency and enterprise workspaces." },
  { q: "Can I get a refund?", a: "Monthly plans are not refunded for partial periods, but annual plans within the first 14 days qualify for a full refund — reach out to support to process it." },
];

export const Route = createFileRoute("/help-center")({
  head: () =>
    metaFor(
      "Help Center — Troubleshooting, Billing & Account Support",
      "Find answers on mailbox connection errors, deliverability issues, billing, roles, imports and account management.",
      "/help-center",
      faqs,
    ),
  component: Help,
});

const topics = [
  { icon: Plug, title: "Connections", text: "SMTP errors, API key failures, IMAP sync and provider limits." },
  { icon: AlertTriangle, title: "Deliverability", text: "Spam placement, bounces, blacklists and authentication failures." },
  { icon: Mail, title: "Campaigns", text: "Sending schedules, stop rules, variables and preview issues." },
  { icon: Users, title: "Team & roles", text: "Invitations, permissions, client access and ownership transfer." },
  { icon: CreditCard, title: "Billing", text: "Plans, seats, invoices, upgrades and cancellations." },
  { icon: LifeBuoy, title: "Account", text: "Password resets, two-factor, data export and deletion." },
];

const popularArticles = [
  { title: "Why is my mailbox stuck in \"warming up\"?", text: "Warmup typically runs 2–4 weeks and adjusts pace automatically based on engagement signals from the warmup network.", meta: "Deliverability" },
  { title: "Fixing a \"550 5.7.1\" SMTP error", text: "This almost always means SPF or DKIM alignment is missing. Walk through the DNS checklist to resolve it.", meta: "Connections" },
  { title: "Understanding stop rules in a sequence", text: "Sequences stop automatically on reply, bounce or unsubscribe — here's how to configure exceptions per step.", meta: "Campaigns" },
  { title: "Transferring workspace ownership", text: "Ownership transfer requires confirmation from both the current and new owner and takes effect immediately.", meta: "Team & roles" },
  { title: "Reading your invoice and seat usage", text: "Invoices break down by seat, mailbox add-ons and any overage — here's what each line item means.", meta: "Billing" },
  { title: "Exporting all your workspace data", text: "Request a full export from Settings → Account; it includes leads, campaigns, and reply history as CSV/JSON.", meta: "Account" },
];

function Help() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Help Center"
        title="Get unblocked"
        highlight="fast"
        description="Answers to the questions our team gets most, plus a direct line to a human when you need one."
        primaryCta="Contact Support"
      />

      <Section muted>
        <div className="mx-auto max-w-2xl">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder='Search articles, e.g. "SPF record" or "invite teammate"'
              className="h-14 w-full rounded-xl border border-border bg-card pr-4 pl-12 text-sm outline-none focus:border-primary"
            />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Try: mailbox warmup, import errors, billing, API key, DMARC
          </p>
        </div>
      </Section>


      <Section title="Browse by topic" muted>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {topics.map((t) => (
            <div key={t.title} className="surface-card p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <t.icon className="size-5" />
              </div>
              <h2 className="mt-4 font-semibold">{t.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <ResourceList items={popularArticles} />
      </Section>

      <Section title="Top questions" muted>
        <FaqBlock faqs={faqs} title="Popular articles" />
        <p className="mt-6 text-sm text-muted-foreground">
          Still stuck?{" "}
          <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
            Contact our support team
          </Link>{" "}
          or read the{" "}
          <Link to="/docs" className="text-primary underline-offset-4 hover:underline">
            documentation
          </Link>
          .
        </p>
      </Section>

      <Section>
        <div className="surface-card flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MessageCircle className="size-6" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Can't find what you need?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Our support team is made up of people who run cold email themselves — not a scripted ticket queue. Reach out and get a real answer within one business day.
          </p>
          <Link
            to="/contact"
            className="mt-2 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Contact Support
          </Link>
        </div>
      </Section>

      <TestimonialCarousel page="help-center" />

      <CtaBlock title="We answer within one business day" description="Real humans who send cold email themselves — not a ticket queue." />
    </MarketingLayout>
  );
}
