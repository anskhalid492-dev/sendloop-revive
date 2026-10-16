import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Inbox, Search, Send, ShieldCheck } from "lucide-react";

import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { MicrosoftMark } from "@/components/campaign/MailboxTypeBadge";
import { ProviderLogo } from "@/components/mailbox/ProviderLogo";
import {
  MarketingLayout, PageHero, Section, FaqBlock, CtaBlock, WorkflowStrip, metaFor,
} from "@/components/site/MarketingPage";
import { MAILBOX_PROVIDERS } from "@/lib/mailbox-providers";

const faqs = [
  { q: "Which mailboxes can I connect to MunchReach?", a: "Connect Gmail or Google Workspace, Microsoft 365 or Outlook, or a mailbox that supports IMAP and SMTP. Guided settings are available for Zoho, Hostinger, Porkbun, GoDaddy, Namecheap Private Email and Yahoo, with a Custom Domain option for other mailbox hosts." },
  { q: "Do I need an existing mailbox?", a: "Yes. Connect a mailbox you already own and can access. MunchReach does not sell or create mailboxes for you." },
  { q: "Does my domain registrar matter?", a: "Choose the company hosting your email, not necessarily the company where you bought your domain. For example, a domain registered at Namecheap can have its mailbox hosted by Google Workspace." },
  { q: "How do Google and Microsoft connections work?", a: "Choose the Google or Microsoft connection option and authorize access to your mailbox through the provider's sign-in flow. You do not enter IMAP or SMTP server settings for these connections." },
  { q: "What do I need for an IMAP / SMTP connection?", a: "Have your mailbox address, username, password or app password, and your provider's incoming IMAP and outgoing SMTP server settings ready. MunchReach offers editable defaults for the listed hosts." },
  { q: "When should I use an app password?", a: "Yahoo requires an app password. Zoho may require an application-specific password when two-factor sign-in is enabled. Follow your mailbox provider's requirements rather than using your normal account password when an app password is required." },
  { q: "What if my mailbox provider is not listed?", a: "Choose Custom Domain in the IMAP / SMTP connection flow and enter the server details supplied by your mailbox host. Your account must support both protocols and allow access from email clients." },
  { q: "Can I send campaigns and manage replies from the same mailbox?", a: "Yes. Connected mailboxes are used to send campaign emails and bring replies into MunchReach's Unified Inbox. For manual connections, SMTP handles outgoing mail and IMAP provides incoming mailbox access." },
  { q: "Will connecting a mailbox move my domain or website?", a: "No. Connecting an existing mailbox does not transfer your domain or move your website. Your email remains hosted with your current mailbox provider." },
  { q: "Does connecting a mailbox remove its sending limits?", a: "No. Your mailbox and provider's sending limits, rate limits and account restrictions still apply, along with your campaign schedule and mailbox settings. A successful connection is not a guarantee of inbox placement or delivery." },
];

export const Route = createFileRoute("/supported-domain-providers")({
  head: () => metaFor(
    "Supported Mailbox Providers | MunchReach",
    "Connect Gmail, Google Workspace, Microsoft 365, Outlook and IMAP / SMTP mailboxes to MunchReach. Explore supported email hosts and mailbox connection options.",
    "/supported-domain-providers", faqs,
  ),
  component: Page,
});

const providers = [
  { name: "Gmail / Google Workspace", method: "Google authorization", description: "Connect your existing Google mailbox through the Google sign-in flow.", logo: <GoogleIcon className="size-7" /> },
  { name: "Microsoft 365 / Outlook", method: "Microsoft authorization", description: "Connect your existing Microsoft mailbox through the Microsoft sign-in flow.", logo: <MicrosoftMark className="size-7" /> },
  ...MAILBOX_PROVIDERS.map((provider) => ({
    name: provider.id === "namecheap" ? "Namecheap Private Email" : provider.displayName,
    method: "IMAP / SMTP",
    description: provider.notes,
    logo: <ProviderLogo provider={provider.id} name={provider.displayName} className="size-7" />,
  })),
];

function ProviderGrid() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => providers.filter((provider) =>
    `${provider.name} ${provider.method}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query]);

  return (
    <div>
      <div className="mx-auto max-w-md">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search mailbox providers…" aria-label="Search mailbox providers"
            className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60" />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">No mailbox provider matches “{query}”. For another IMAP / SMTP host, use Custom Domain with your provider's server details.</p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((provider) => (
            <div key={provider.name} className="surface-card flex h-full flex-col p-6">
              <div className="flex items-center gap-3">{provider.logo}<h3 className="text-lg font-semibold">{provider.name}</h3></div>
              <p className="mt-3 flex-1 text-sm text-muted-foreground">{provider.description}</p>
              <div className="mt-5 flex items-center gap-2 border-t border-border/70 pt-4 text-sm font-medium text-primary"><CheckCircle2 className="size-4 shrink-0" aria-hidden />{provider.method}</div>
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
      <PageHero eyebrow="Mailbox Connections" title="Supported" highlight="Mailbox Providers"
        description="Bring your existing email accounts to MunchReach. Connect Google or Microsoft mailboxes, or use IMAP / SMTP with your email host to send campaigns and manage replies in one workspace."
        primaryCta="Connect Your Mailbox" primaryHref="/mailboxes/add" secondaryCta="View Pricing" secondaryHref="/pricing" />

      <Section title="Choose Your Mailbox Provider" description="Choose where your email is hosted — not where your domain is registered. Your mailbox stays with its current provider.">
        <ProviderGrid />
      </Section>

      <Section muted title="Connect Your Existing Mailbox">
        <WorkflowStrip steps={[
          { title: "Choose your connection", text: "Select Google, Microsoft, or IMAP / SMTP." },
          { title: "Authorize mailbox access", text: "Sign in with your provider, or enter your mailbox credentials and server settings." },
          { title: "Check the connection", text: "For manual connections, test incoming IMAP and outgoing SMTP access." },
          { title: "Use your mailbox", text: "Add your connected mailbox to campaigns and manage incoming replies." },
        ]} />
      </Section>

      <Section title="What to Have Ready" description="Google and Microsoft use their authorization flows. For other hosts, use the email-client settings supplied by your mailbox provider.">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Inbox, title: "Incoming mail · IMAP", text: "Your incoming server hostname, port and security setting, plus the mailbox username. Enable IMAP access if your provider requires it." },
            { icon: Send, title: "Outgoing mail · SMTP", text: "Your outgoing server hostname, port and security setting. Use your actual mailbox host's settings, even if your domain was purchased elsewhere." },
            { icon: ShieldCheck, title: "Mailbox credentials", text: "Your mailbox password or provider-required app password. Guided server settings can be edited to match your account." },
          ].map((item) => (
            <div key={item.title} className="surface-card p-6">
              <item.icon className="size-6 text-primary" aria-hidden />
              <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section muted title="Send Campaigns. Keep Replies Together.">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-muted-foreground">Use your connected email accounts for campaign messages and follow-ups, then manage replies in the Unified Inbox. Your mailbox remains with your email host — no domain transfer or website move is needed.</p>
          <p className="mt-4 text-sm text-muted-foreground">Your provider's sending restrictions and mailbox limits still apply. Connection checks confirm access, not guaranteed delivery or unlimited provider capacity.</p>
        </div>
      </Section>

      <Section><FaqBlock faqs={faqs} eyebrow="FAQ" title="Mailbox Connection FAQ" description="Common questions about connecting your email accounts to MunchReach." /></Section>
      <CtaBlock title="Bring Your Mailboxes to MunchReach" description="Connect your existing email accounts and keep campaigns, follow-ups and replies in one workspace." cta="Get Started" secondaryCta="Connect Your Mailbox" secondaryHref="/mailboxes/add" />
    </MarketingLayout>
  );
}
