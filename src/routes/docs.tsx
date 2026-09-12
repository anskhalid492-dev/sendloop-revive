import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingLayout, metaFor } from "@/components/site/MarketingPage";
import {
  DocsPageFrame,
  DocsHero,
  DocsSection,
  DocsSteps,
  DocsGroups,
  DocsMailboxPanel,
  DocsArticleThread,
  DocsFaq,
  DocsCta,
} from "@/components/docs/DocsPrimitives";

const faqs = [
  {
    q: "Is the documentation free to read without an account?",
    a: "Yes, every page here is public. You only need an account when you're ready to connect a mailbox or call the API.",
  },
  {
    q: "Do you have documentation for agencies managing multiple clients?",
    a: "Yes — the Agency Ops section under Sending accounts and Workspaces covers multi-workspace structure, client permissions and white-label reporting.",
  },
  {
    q: "How current is this documentation?",
    a: "Docs are updated the same week a feature ships. Each page shows a last-updated date at the bottom so you know it reflects the current product.",
  },
  {
    q: "What if a doc page doesn't answer my question?",
    a: "Use the chat widget inside the app, or visit the Help Center for troubleshooting articles and a direct line to support.",
  },
  {
    q: "Do you have a changelog?",
    a: "Yes, linked from the app footer. Every release lists new features, fixes and any breaking API changes.",
  },
  {
    q: "Can I request a new doc topic?",
    a: "Absolutely — send a note through the contact page and we'll prioritize it, especially for common setup or integration questions.",
  },
];

export const Route = createFileRoute("/docs")({
  head: () =>
    metaFor(
      "Documentation — Setup, Sending, Campaigns & API",
      "Step-by-step documentation for connecting mailboxes, importing leads, building sequences, managing replies and reporting.",
      "/docs",
      faqs,
    ),
  component: Docs,
});

const groups = [
  {
    title: "Getting started",
    items: [
      "Create your account and first workspace",
      "Invite teammates and choose roles",
      "Workspace settings and branding",
      "Billing, plans and usage limits",
    ],
  },
  {
    title: "Sending accounts",
    items: [
      "Connect SMTP and IMAP mailboxes",
      "Connect SendGrid, SES, Mailgun, Postmark, Resend and ZeptoMail",
      "Publish SPF, DKIM and DMARC records",
      "Set daily limits, warmup and rotation",
    ],
  },
  {
    title: "Leads and lists",
    items: [
      "Import a CSV and map columns",
      "Duplicate detection and email validation",
      "Custom fields, tags and segments",
      "Suppression and do-not-contact lists",
    ],
  },
  {
    title: "Campaigns",
    items: [
      "Build a multi-step sequence",
      "Variables, fallbacks and spintax",
      "Conditional branching and stop rules",
      "Sending windows and timezone scheduling",
    ],
  },
  {
    title: "Inbox and reporting",
    items: [
      "Triage replies with AI labels",
      "Assign conversations and add notes",
      "Campaign, step and variant analytics",
      "Scheduled client reports and exports",
    ],
  },
  {
    title: "Security and compliance",
    items: [
      "Row-level security and workspace isolation",
      "Credential encryption at rest",
      "GDPR and CAN-SPAM guidance",
      "Data export and deletion requests",
    ],
  },
];

const quickstart = [
  { title: "Create a workspace", text: "Sign up, name your workspace, and invite teammates with the right roles." },
  { title: "Connect a mailbox", text: "Link SMTP/IMAP or a provider like SES or Postmark, then let warmup run for a few days." },
  { title: "Import your list", text: "Upload a CSV, map columns to fields, and let verification flag risky addresses." },
  { title: "Launch a sequence", text: "Build a 3–4 step campaign with variables, set a sending window, and start small." },
];

const articles = [
  "Why are my emails landing in spam?",
  "How mailbox rotation distributes volume",
  "Setting up a custom tracking domain",
  "Understanding reply detection and stop rules",
  "Migrating from another cold email tool",
  "Giving a client read-only reporting access",
];

const mailboxes = [
  { address: "sales@acme.com", provider: "SES", detail: "warmup active", status: "Healthy" as const },
  { address: "hello@acme.com", provider: "SMTP", detail: "42/day limit", status: "Healthy" as const },
  { address: "outreach@acmegrowth.io", provider: "Postmark", detail: "ramping", status: "Warming" as const },
];

function Docs() {
  return (
    <MarketingLayout>
      <DocsPageFrame>
        <DocsHero />

        <DocsSection
          title="Quickstart"
          description="From zero to your first sent sequence in four steps."
        >
          <DocsSteps steps={quickstart} />
        </DocsSection>

        <DocsSection id="browse" title="Browse the docs">
          <DocsGroups groups={groups} />
        </DocsSection>

        <DocsSection title="What a connected mailbox looks like">
          <DocsMailboxPanel rows={mailboxes} />
        </DocsSection>

        <DocsSection title="Popular articles">
          <DocsArticleThread articles={articles} />
          <p className="mt-8 text-sm text-docs-slate">
            Building an integration? See the{" "}
            <Link
              to="/api-docs"
              className="text-docs-signal underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-docs-signal focus-visible:outline-none"
            >
              API reference
            </Link>
            .
          </p>
        </DocsSection>

        <DocsSection title="Frequently asked questions">
          <DocsFaq faqs={faqs} />
        </DocsSection>

        <DocsCta
          title="Start sending in ten minutes"
          description="Follow the getting started guide and launch your first sequence today."
        />
      </DocsPageFrame>
    </MarketingLayout>
  );
}
