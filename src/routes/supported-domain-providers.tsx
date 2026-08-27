import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Globe,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";

import {
  MarketingLayout,
  PageHero,
  Section,
  FaqBlock,
  CtaBlock,
  WorkflowStrip,
  metaFor,
} from "@/components/site/MarketingPage";

const faqs = [
  { q: "Can I use Namecheap with MunchReach?", a: "Yes. Keep your domain registered at Namecheap and publish the DNS records MunchReach shows you in Namecheap's DNS manager. No transfer is required." },
  { q: "Can I use GoDaddy with MunchReach?", a: "Yes. Add the DNS records MunchReach provides in your GoDaddy DNS management page. Your domain stays at GoDaddy." },
  { q: "Can I use Cloudflare with MunchReach?", a: "Yes. Cloudflare's DNS works with MunchReach. When adding records such as DKIM, leave proxying off for mail-related records so they resolve as plain DNS." },
  { q: "Can I use Hostinger with MunchReach?", a: "Yes. Publish the required records in Hostinger's DNS zone editor. MunchReach checks public DNS and confirms when everything is in place." },
  { q: "Can I use Porkbun with MunchReach?", a: "Yes. Porkbun's DNS management supports the record types MunchReach requires, including TXT and MX records." },
  { q: "Can I use IONOS with MunchReach?", a: "Yes. Add the records shown in MunchReach through the IONOS DNS settings for your domain." },
  { q: "Do I need to transfer my domain to MunchReach?", a: "No. MunchReach never requires a domain transfer. Your domain stays with your current registrar — you only publish a few DNS records there." },
  { q: "Can I use a domain registered somewhere else?", a: "Yes. Any domain works as long as you can edit its DNS records at your provider. MunchReach reads public DNS, so it does not matter where the domain is registered." },
  { q: "Can I keep my existing website?", a: "Yes. Email authentication records such as DKIM, SPF and DMARC do not affect your website. Your site stays exactly where it is." },
  { q: "Can I keep my existing DNS provider?", a: "Yes. You keep managing DNS at your current provider. MunchReach only checks that the required records are published correctly." },
  { q: "Will MunchReach change my DNS automatically?", a: "No. MunchReach shows you the exact records required and verifies them once published, but it never edits or deletes DNS records at your provider. You stay in control." },
  { q: "Can I receive replies on my root domain?", a: "Yes, when your selected email provider supports inbound receiving and your root MX records are configured correctly. A mailbox like john@yourcompany.com can both send and receive campaign replies — no separate replies.yourcompany.com subdomain is required." },
  { q: "What happens if my domain already has MX records?", a: "MX records control where your incoming email is delivered. If you already receive business email through Google Workspace, Microsoft 365, Zoho or another mail provider, replacing the root MX records can redirect that mail. Confirm your email setup before changing existing MX records." },
];

export const Route = createFileRoute("/supported-domain-providers")({
  head: () =>
    metaFor(
      "Supported Domain & DNS Providers | MunchReach",
      "See which domain registrars and DNS providers work with MunchReach. Use your existing domain provider and configure DNS records for email sending and reply receiving.",
      "/supported-domain-providers",
      faqs,
    ),
  component: Page,
});

type Provider = { name: string; description: string; note?: string };

const providers: Provider[] = [
  { name: "Namecheap", description: "Manage your domain and DNS records directly from Namecheap." },
  { name: "GoDaddy", description: "Manage your domain and DNS records directly from GoDaddy." },
  { name: "Cloudflare", description: "Manage DNS at Cloudflare while keeping your existing registrar.", note: "Leave proxying off for mail records." },
  { name: "Hostinger", description: "Manage your domain and DNS records directly from Hostinger." },
  { name: "Porkbun", description: "Manage your domain and DNS records directly from Porkbun." },
  { name: "IONOS", description: "Manage your domain and DNS records directly from IONOS." },
  { name: "Squarespace Domains", description: "Manage your domain and DNS records directly from Squarespace Domains." },
  { name: "Dynadot", description: "Manage your domain and DNS records directly from Dynadot." },
  { name: "Amazon Route 53", description: "Manage DNS in Route 53 hosted zones while keeping your registrar." },
  {
    name: "Other DNS Providers",
    description:
      "If your provider allows you to manage DNS records, you can normally use your domain with MunchReach. MunchReach checks the public DNS records and shows the exact records required by your selected email provider.",
  },
];

const dnsRecords = [
  { name: "DKIM", text: "Helps mailbox providers verify that your emails are authorized." },
  { name: "SPF", text: "Shows which sending infrastructure is allowed to send email for your domain." },
  { name: "MX", text: "Routes incoming email and campaign replies to the receiving service when your selected provider supports inbound receiving." },
  { name: "DMARC", text: "Helps protect your domain from unauthorized email and improves email authentication." },
  { name: "Webhooks", text: "Connect provider events such as delivery and inbound replies to MunchReach when supported by the selected email provider." },
];

const readinessChecks = [
  { icon: "✓", label: "Verified records" },
  { icon: "✗", label: "Missing records" },
  { icon: "⚠", label: "Incorrect records" },
  { icon: "⚠", label: "MX conflicts" },
  { icon: "⏳", label: "DNS propagation" },
  { icon: "✓", label: "Domain readiness" },
];

function ProviderGrid() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(q));
  }, [query]);

  return (
    <div>
      <div className="mx-auto max-w-md">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers — e.g. Namecheap, Cloudflare…"
            aria-label="Search domain and DNS providers"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          No provider matches “{query}”. If your provider lets you manage DNS records, your domain
          normally works with MunchReach.
        </p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <div key={p.name} className="surface-card flex h-full flex-col p-6">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.description}</p>
              {p.note ? <p className="mt-1 text-xs text-muted-foreground">{p.note}</p> : null}
              <dl className="mt-5 space-y-2.5 border-t border-border/70 pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Works with MunchReach</dt>
                  <dd className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                    <CheckCircle2 className="size-3.5" /> Yes
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">DNS setup</dt>
                  <dd className="text-right text-xs">Add the DNS records shown in MunchReach</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Domain transfer required</dt>
                  <dd className="text-xs font-medium">No</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Page() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="DNS & Domain Setup"
        title="Supported Domain &"
        highlight="DNS Providers"
        description="Use MunchReach with the domain provider you already use. Your domain can stay with Namecheap, GoDaddy, Cloudflare, Hostinger, Porkbun, IONOS, or another DNS provider. MunchReach checks your domain's DNS and tells you exactly which records are required for email sending and reply receiving."
        primaryCta="Add Your Domain"
        secondaryCta="View DNS Setup Guide"
        secondaryHref="/deliverability-guide"
      />

      <Section
        title="Supported Domain & DNS Providers"
        description="Every provider below works with MunchReach through its standard DNS management. No domain transfer, no lock-in."
      >
        <ProviderGrid />
      </Section>

      <Section muted title="How MunchReach Works With Your Domain Provider">
        <WorkflowStrip
          steps={[
            { title: "Add your domain", text: "Add your domain to MunchReach." },
            { title: "Choose your email provider", text: "MunchReach determines the DNS requirements for the provider you use." },
            { title: "Publish DNS records", text: "Add the records at your existing DNS provider." },
            { title: "Verify your domain", text: "MunchReach checks public DNS and confirms when everything is ready." },
          ]}
        />
        <p className="mt-8 text-center text-sm font-medium text-primary">
          You remain in control of your domain and DNS.
        </p>
      </Section>

      <Section
        title="What DNS Records Does MunchReach Require?"
        description="Only the records your selected email provider actually requires or supports are shown for your domain."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dnsRecords.map((r) => (
            <div key={r.name} className="surface-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Server className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{r.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section muted title="Receive Replies on Your Main Domain">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-muted-foreground">
            MunchReach supports root-domain reply receiving. A mailbox such as{" "}
            <span className="font-medium text-foreground">john@customer.com</span> on{" "}
            <span className="font-medium text-foreground">customer.com</span> can be used for
            sending and receiving campaign replies when the selected email provider supports
            inbound receiving and the domain's MX records are configured correctly.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            You do not need to create subdomains like{" "}
            <span className="font-medium text-foreground">replies.customer.com</span>,{" "}
            <span className="font-medium text-foreground">inbound.customer.com</span> or{" "}
            <span className="font-medium text-foreground">mail.customer.com</span>.
          </p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl rounded-2xl border border-destructive/20 bg-destructive/5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              Changing MX Records Can Affect Existing Email
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            MX records control where incoming email is delivered. If your domain is already
            receiving normal business email through Google Workspace, Microsoft 365, Hostinger,
            Zoho, or another mail provider, changing the root MX records can redirect incoming
            mail. Confirm your email setup before replacing existing root MX records.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            MunchReach never silently changes or deletes your DNS records — you publish every
            record yourself at your own provider.
          </p>
        </div>
      </Section>

      <Section muted title="Do I Need to Move My Domain to MunchReach?">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">No.</p>
          <p className="mt-4 text-muted-foreground">
            You can keep your domain registered with your current provider. MunchReach does not
            require you to move your domain to another registrar. You simply publish the DNS
            records required for your selected email provider.
          </p>
        </div>
      </Section>

      <Section title="MunchReach Makes DNS Setup Easier">
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-muted-foreground">
            MunchReach automatically checks your public DNS records and shows exactly where your
            domain stands:
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {readinessChecks.map((c) => (
              <li
                key={c.label}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <span aria-hidden="true" className="text-base">{c.icon}</span>
                <span>{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            MunchReach verifies and guides — it does not edit DNS at your provider.
          </p>
        </div>
      </Section>

      <Section muted title="Why DNS Setup Looks Different at Every Provider">
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-muted-foreground">
            Every DNS provider has a different dashboard, but the DNS record itself is the
            important part. One provider may call a field <span className="font-medium text-foreground">Name</span>,
            while another calls it <span className="font-medium text-foreground">Host</span> or{" "}
            <span className="font-medium text-foreground">Hostname</span>.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {["Type", "Host / Name", "Value / Target", "Priority", "TTL"].map((f) => (
              <div
                key={f}
                className="rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-medium"
              >
                {f}
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            MunchReach shows each required value — you enter it in your provider's DNS manager.
          </p>
        </div>
      </Section>

      <Section>
        <FaqBlock
          faqs={faqs}
          eyebrow="FAQ"
          title="Domain & DNS Provider FAQ"
          description="Common questions about using your existing domain provider with MunchReach."
        />
        <div className="mx-auto mt-12 max-w-3xl space-y-3 rounded-2xl border border-border bg-secondary/40 p-6 text-xs leading-relaxed text-muted-foreground">
          <p>
            “Provider support” means your domain can be configured through that provider's DNS
            management system. MunchReach does not require a direct integration with your
            registrar unless explicitly stated.
          </p>
          <p>
            Email capabilities vary by the email provider selected in MunchReach. Sending,
            inbound receiving, delivery tracking, open tracking, click tracking, bounce
            tracking, and webhooks may not be available from every provider.
          </p>
        </div>
      </Section>

      <CtaBlock
        title="Add your domain and see exactly what it needs"
        description="MunchReach checks your DNS and walks you through every record — your domain stays right where it is."
        cta="Add Your Domain"
        secondaryCta="View DNS Setup Guide"
        secondaryHref="/deliverability-guide"
      />
    </MarketingLayout>
  );
}
