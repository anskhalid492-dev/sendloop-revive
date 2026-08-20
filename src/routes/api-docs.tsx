import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Webhook, Gauge, ShieldAlert } from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  CtaBlock,
  PainPoints,
  StatStrip,
  FaqBlock,
  metaFor,
} from "@/components/site/MarketingPage";
import { TestimonialCarousel } from "@/components/site/TestimonialCarousel";

const faqs = [
  {
    q: "Do I need a paid plan to use the API?",
    a: "The API is available on all paid plans. Free trial workspaces get a sandbox key with reduced rate limits for testing.",
  },
  {
    q: "How do I rotate an API key without downtime?",
    a: "Generate a second key, update your integration to send both during a transition window, then revoke the old key once traffic on it drops to zero.",
  },
  {
    q: "What happens if I exceed the rate limit?",
    a: "You'll receive a 429 response with a Retry-After header in seconds. We recommend exponential backoff rather than a fixed retry interval.",
  },
  {
    q: "Are webhook deliveries retried on failure?",
    a: "Yes. We retry with exponential backoff for up to 24 hours if your endpoint returns a non-2xx status or times out, and you can replay any event from the dashboard.",
  },
  {
    q: "Is there a sandbox or test mode?",
    a: "Yes — sandbox keys behave identically to live keys but never send real email; delivery and reply events are simulated so you can test integrations safely.",
  },
  {
    q: "Do you have official client libraries?",
    a: "We publish a Node and Python SDK. For other languages, the REST API is plain JSON over HTTPS and works with any HTTP client.",
  },
];

export const Route = createFileRoute("/api-docs")({
  head: () =>
    metaFor(
      "API Reference — Leads, Campaigns, Events & Webhooks",
      "REST API and webhooks for creating leads, launching campaigns, reading analytics and syncing replies with your own systems.",
      "/api-docs",
      faqs,
    ),
  component: ApiDocs,
});

const painPoints = [
  {
    icon: KeyRound,
    title: "Manual list uploads don't scale",
    text: "If leads come from your own CRM or a form, exporting and re-importing CSVs constantly becomes the bottleneck in your pipeline.",
  },
  {
    icon: Webhook,
    title: "No visibility into reply events",
    text: "Sales teams need replies pushed into their CRM the moment they happen, not discovered during a manual check hours later.",
  },
  {
    icon: Gauge,
    title: "Reporting lives in a silo",
    text: "Campaign performance needs to sit next to pipeline and revenue data, which means pulling it out of MunchReach programmatically.",
  },
];

const endpoints = [
  { method: "GET", path: "/v1/workspaces", desc: "List workspaces the API key can access." },
  { method: "POST", path: "/v1/leads", desc: "Create or upsert a lead with custom fields." },
  { method: "GET", path: "/v1/leads", desc: "Search leads by list, tag, status or email." },
  { method: "POST", path: "/v1/lists", desc: "Create a lead list." },
  { method: "POST", path: "/v1/campaigns", desc: "Create a campaign with steps and schedule." },
  { method: "POST", path: "/v1/campaigns/:id/start", desc: "Start or resume a campaign." },
  { method: "POST", path: "/v1/campaigns/:id/pause", desc: "Pause a running campaign." },
  { method: "GET", path: "/v1/campaigns/:id/stats", desc: "Delivered, opened, clicked, replied and bounced counts." },
  { method: "GET", path: "/v1/replies", desc: "List replies with AI labels and assignment." },
  { method: "POST", path: "/v1/suppressions", desc: "Add an address or domain to the suppression list." },
  { method: "DELETE", path: "/v1/leads/:id", desc: "Permanently remove a lead and its activity history." },
  { method: "GET", path: "/v1/events", desc: "Paginated raw event stream for building custom dashboards." },
];

const webhooks = [
  ["email.sent", "A campaign step was delivered to the provider."],
  ["email.opened", "A tracked open was recorded (bot-filtered)."],
  ["email.clicked", "A tracked link was clicked."],
  ["email.replied", "A human reply arrived and the sequence stopped."],
  ["email.bounced", "A hard or soft bounce was recorded."],
  ["lead.unsubscribed", "A prospect opted out and was suppressed."],
];

const stats = [
  { value: "120/min", label: "Default rate limit per key" },
  { value: "99.98%", label: "API uptime, trailing 12 months" },
  { value: "<180ms", label: "Median response time" },
  { value: "24h", label: "Webhook retry window" },
];

function ApiDocs() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="API"
        title="A REST API for"
        highlight="everything you can click"
        description="Automate lead creation, campaign launches and reply handling. JSON in, JSON out, with signed webhooks for real-time events."
        primaryCta="Get an API Key"
        secondaryCta="View Endpoints"
        secondaryHref="#product"
      />


      <Section title="Authentication" description="Every request needs a workspace-scoped bearer token.">
        <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 text-sm text-foreground">
          <code>{`curl https://api.munchreach.app/v1/leads \\
  -H "Authorization: Bearer sk_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "list_id": "b7c1...",
    "email": "ada@example.com",
    "first_name": "Ada",
    "company": "Example Inc",
    "custom_fields": { "industry": "Fintech" }
  }'`}</code>
        </pre>
        <p className="mt-4 text-sm text-muted-foreground">
          Generate keys from Settings → API. Keys are scoped to a single workspace and can be revoked instantly.
        </p>
      </Section>

      <Section title="Example response" muted>
        <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 text-sm text-foreground">
          <code>{`{
  "id": "lead_9f2a1c",
  "email": "ada@example.com",
  "first_name": "Ada",
  "company": "Example Inc",
  "list_id": "b7c1...",
  "status": "active",
  "custom_fields": { "industry": "Fintech" },
  "created_at": "2026-08-11T14:02:31Z"
}`}</code>
        </pre>
      </Section>

      <Section title="Core endpoints">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.method + e.path} className="border-t border-border bg-card">
                  <td className="px-4 py-3 font-mono text-xs text-primary">{e.method}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.path}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Rate limits" muted description="Limits apply per API key, per workspace.">
        <StatStrip stats={stats} />
      </Section>

      <Section title="Webhooks" description="Signed with HMAC SHA-256 in the x-sendloop-signature header.">
        <div className="grid gap-3 md:grid-cols-2">
          {webhooks.map(([name, desc]) => (
            <div key={name} className="rounded-lg border border-border bg-card px-4 py-3">
              <code className="text-sm text-primary">{name}</code>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Errors" muted>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["400", "Invalid request body or missing field"],
            ["401", "Missing or invalid API key"],
            ["403", "Key lacks access to that workspace"],
            ["404", "Resource not found or already deleted"],
            ["409", "Duplicate resource (e.g. lead already in list)"],
            ["422", "Field failed validation (e.g. malformed email)"],
            ["429", "Rate limit exceeded — retry after the header value"],
            ["500", "Unexpected server error — safe to retry"],
          ].map(([code, text]) => (
            <div key={code} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 font-mono text-lg text-primary">
                <ShieldAlert className="size-4" /> {code}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <FaqBlock faqs={faqs}  />
      </Section>

      <TestimonialCarousel page="api-docs" />

      <CtaBlock
        title="Build on top of MunchReach"
        description="Create a workspace, generate a key and start pushing leads in minutes."
      />
    </MarketingLayout>
  );
}
