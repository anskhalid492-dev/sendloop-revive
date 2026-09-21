import { createFileRoute, Link } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, CtaBlock, metaFor } from "@/components/site/MarketingPage";

export const Route = createFileRoute("/legal/sending-policy")({
  head: () =>
    metaFor(
      "MunchReach Sending Policy | Responsible Email Sending",
      "Learn how MunchReach customers are expected to use email outreach responsibly, including sender identity, opt-outs, contact data, deliverability, prohibited activity, and compliance requirements.",
      "/legal/sending-policy",
    ),
  component: SendingPolicy,
});

const toc = [
  ["scope", "1. Who this policy applies to"],
  ["responsible-sending", "2. Responsible sending"],
  ["contact-lists", "3. Recipient data and contact lists"],
  ["opt-outs", "4. Unsubscribe and opt-out requirements"],
  ["sender-identity", "5. Sender identity"],
  ["content", "6. Email content requirements"],
  ["prohibited-behavior", "7. Prohibited sending behavior"],
  ["bounces-suppression", "8. Bounces, complaints and suppression"],
  ["sending-limits", "9. Sending limits and rate controls"],
  ["mailbox-domain", "10. Email account and mailbox responsibility"],
  ["ai-content", "11. AI-generated content"],
  ["legal-compliance", "12. Legal and regulatory compliance"],
  ["monitoring", "13. Monitoring and enforcement"],
  ["evasion", "14. Account evasion"],
  ["reporting-abuse", "15. Reporting abuse"],
  ["enforcement", "16. Policy enforcement"],
  ["related-policies", "17. Related policies"],
] as const;

type PolicySection = {
  id: string;
  heading: string;
  body?: string[];
  list?: string[];
  afterList?: string[];
  list2?: string[];
};

const sections: PolicySection[] = [
  {
    id: "scope",
    heading: "1. Who this policy applies to",
    body: [
      "MunchReach provides tools that help businesses manage Campaigns, Sequences, follow-ups, replies and other email outreach through Connected Mailboxes. Because sending practices directly affect Recipients, sender reputation and the broader email ecosystem, everyone using MunchReach must use the platform responsibly and comply with applicable laws and regulations.",
      "This Sending Policy explains the standards that apply whenever email is sent through MunchReach. Using MunchReach means you agree to follow this policy together with our Terms of Service, Privacy Policy, and all applicable laws and regulations. We may update this policy when necessary to address changes in law, industry standards, abuse patterns, or the operation of our services.",
      "This policy applies to:",
    ],
    list: [
      "All MunchReach customers",
      "Workspace members",
      "Users sending emails through MunchReach",
      "Campaigns and sequences",
      "Connected mailboxes and sending accounts",
      "Email Accounts, Connected Mailboxes and sender addresses used with MunchReach",
      "Automated and AI-assisted email generation",
      "Any other feature that results in messages being sent through MunchReach",
    ],
    afterList: [
      "Customers are responsible for the campaigns, recipients, content, and sending practices associated with their accounts.",
    ],
  },
  {
    id: "responsible-sending",
    heading: "2. Responsible sending",
    body: [
      "Users must send relevant, truthful, and lawful business communications. Users must not use MunchReach to:",
    ],
    list: [
      "Send deceptive or misleading messages",
      "Impersonate another person or organization",
      "Hide the true identity of the sender",
      "Use misleading sender names, Email Accounts or reply-to addresses",
      "Send malicious or fraudulent communications",
      "Send phishing messages",
      "Send malware, malicious links, or harmful attachments",
      "Attempt to bypass spam filters or security systems",
      "Use MunchReach to facilitate illegal activity",
      "Repeatedly contact recipients who have opted out",
    ],
    afterList: ["Messages should clearly identify who is communicating with the recipient."],
  },
  {
    id: "contact-lists",
    heading: "3. Recipient data and contact lists",
    body: [
      "Customers are responsible for ensuring that they have a lawful basis and appropriate authorization to use their contact data. Customers must not knowingly upload or use:",
    ],
    list: [
      "Stolen contact information",
      "Illegally obtained personal information",
      "Data obtained through unauthorized access",
      "Lists containing intentionally deceptive records",
      "Known spam traps",
      "Data that the customer has no legal right to use",
    ],
    afterList: [
      "Customers are responsible for evaluating the source and legality of their contact lists before importing them into MunchReach.",
      "MunchReach may require additional verification or information about a list when necessary to protect recipients, customers, or the platform.",
    ],
  },
  {
    id: "opt-outs",
    heading: "4. Unsubscribe and opt-out requirements",
    body: [
      "Where required by applicable law, campaigns must provide recipients with a clear and functional method to stop receiving future communications.",
      "When a recipient unsubscribes through MunchReach:",
    ],
    list: [
      "The unsubscribe request must be respected",
      "The recipient is added to the appropriate suppression system",
      "Future campaign messages must not be sent to that recipient where applicable",
    ],
    afterList: ["Users must not attempt to circumvent an unsubscribe request by:"],
    list2: [
      "Uploading the same recipient again",
      "Using another campaign to contact the recipient",
      "Using another sending mailbox to bypass suppression",
      "Altering the recipient's email address to avoid suppression",
    ],
  },
  {
    id: "sender-identity",
    heading: "5. Sender identity",
    body: ["Every message must accurately identify the sender. Users must not:"],
    list: [
      "Spoof sender identities",
      "Misrepresent the company sending the message",
      "Use deceptive display names",
      "Use Email Accounts, sender addresses or identities they do not control or have authorization to use",
      "Mislead recipients about the relationship between the sender and another organization",
    ],
    afterList: [
      "From, Reply-To, and related sender information should accurately represent the sending organization or individual.",
    ],
  },
  {
    id: "content",
    heading: "6. Email content requirements",
    body: [
      "Content sent through MunchReach must be lawful and legitimate. Users must not use MunchReach to distribute content involving:",
    ],
    list: [
      "Phishing",
      "Fraud",
      "Malware",
      "Illegal activity",
      "Threats",
      "Harassment",
      "Defamation",
      "Hate or violent extremist content",
      "Child sexual abuse material",
      "Non-consensual sexual content",
      "Illegal goods or services",
      "Credential theft",
      "Identity theft",
      "Financial scams",
      "Fake investment opportunities",
      "Pyramid or Ponzi schemes",
      "Get-rich-quick schemes",
      "Malicious software",
      "Harmful downloads",
    ],
    afterList: [
      "MunchReach may restrict additional categories where necessary to protect users, recipients, infrastructure, or legal compliance.",
    ],
  },
  {
    id: "prohibited-behavior",
    heading: "7. Prohibited sending behavior",
    body: ["Users must not use MunchReach to:"],
    list: [
      "Conduct spam campaigns",
      "Send extremely high-volume campaigns without appropriate controls",
      "Repeatedly send to invalid addresses",
      "Intentionally generate bounces",
      "Intentionally generate spam complaints",
      "Target spam traps",
      "Circumvent sending limits applied to mailboxes, campaigns, or accounts",
      "Create multiple accounts to evade enforcement",
      "Rotate Email Accounts or Mailboxes specifically to evade restrictions",
      "Attempt to bypass MunchReach suppression systems",
      "Manipulate delivery or engagement metrics",
      "Abuse AI personalization to create deceptive messages",
    ],
  },
  {
    id: "bounces-suppression",
    heading: "8. Bounces, complaints and suppression",
    body: [
      "MunchReach uses automated protections to help protect sending reputation. Depending on available signals, MunchReach may:",
    ],
    list: [
      "Suppress hard-bounced addresses",
      "Suppress recipients who submit complaints",
      "Restrict repeated temporary failures",
      "Pause campaigns showing abnormal bounce rates",
      "Pause or restrict mailboxes showing abnormal complaint activity",
      "Restrict sending when abuse signals exceed acceptable levels",
      "Require customers to review or correct their contact data",
    ],
    afterList: [
      "Users must maintain reasonable list quality and should remove invalid or risky contacts.",
      "MunchReach may establish or change internal sending thresholds based on deliverability signals and infrastructure requirements.",
    ],
  },
  {
    id: "sending-limits",
    heading: "9. Sending limits and rate controls",
    body: ["MunchReach may apply limits to:"],
    list: [
      "Individual mailboxes",
      "Campaigns",
      "Workspaces",
      "Email Accounts and Sending Accounts",
      "Daily sending volume",
      "Hourly sending volume",
      "Concurrent sending",
      "New or recently connected mailboxes",
    ],
    afterList: [
      "These limits may change based on account history, sender reputation, bounce rates, complaint rates, Mailbox health, Mailbox Authentication, infrastructure capacity and abuse signals.",
      "Configured limits are controls, not guarantees of delivery. MunchReach may reduce sending capacity when necessary to protect deliverability or prevent abuse.",
    ],
  },
  {
    id: "mailbox-domain",
    heading: "10. Email account and mailbox responsibility",
    body: [
      "Customers are responsible for every Email Account, Connected Mailbox and sender identity they use with MunchReach. Customers must control, or have clear authorization to use:",
    ],
    list: [
      "Sending email addresses",
      "Connected mailboxes",
      "Sending Accounts and their credentials",
      "Mailbox Authentication and sender configuration",
    ],
    afterList: [
      "Where a connected Email Account relies on domain-level authentication records, customers are also responsible for having authority to configure and maintain those records.",
      "MunchReach may prevent Email Sending from accounts that fail required connection, security, authentication or trust checks.",
    ],
  },
  {
    id: "ai-content",
    heading: "11. AI-generated content",
    body: [
      "MunchReach may provide AI-powered personalization and content-generation features. AI-generated content does not remove the customer's responsibility for the final message.",
      "Customers are responsible for reviewing AI-generated content and ensuring that it is:",
    ],
    list: ["Accurate", "Relevant", "Lawful", "Non-deceptive", "Appropriate for the intended recipient"],
    afterList: [
      "Users must not use AI features to generate fraudulent, deceptive, impersonating, or otherwise prohibited communications.",
    ],
  },
  {
    id: "legal-compliance",
    heading: "12. Legal and regulatory compliance",
    body: [
      "Customers are responsible for complying with all laws and regulations applicable to their campaigns, recipients, businesses, and locations. This may include applicable:",
    ],
    list: [
      "Email marketing laws",
      "Anti-spam requirements",
      "Privacy laws",
      "Data protection requirements",
      "Consumer protection laws",
      "Advertising regulations",
      "Industry-specific regulations",
    ],
    afterList: [
      "MunchReach does not determine whether a particular campaign is legally permissible for a customer's specific situation. Customers should obtain appropriate legal advice when necessary.",
    ],
  },
  {
    id: "monitoring",
    heading: "13. Monitoring and enforcement",
    body: [
      "MunchReach may monitor sending activity and account signals for security, abuse prevention, deliverability, and compliance purposes. Where appropriate, MunchReach may:",
    ],
    list: [
      "Warn a customer",
      "Reduce sending limits",
      "Pause a campaign",
      "Pause a mailbox",
      "Suppress recipients",
      "Require additional verification",
      "Restrict specific features",
      "Temporarily suspend an account",
      "Permanently terminate an account",
    ],
    afterList: [
      "MunchReach may take immediate action when necessary to protect recipients, infrastructure, customers, or the security of the platform.",
    ],
  },
  {
    id: "evasion",
    heading: "14. Account evasion",
    body: ["Customers must not attempt to evade enforcement actions. This includes:"],
    list: [
      "Creating new accounts after suspension",
      "Creating duplicate workspaces",
      "Rotating Email Accounts or Mailboxes to bypass restrictions",
      "Using another account to continue prohibited campaigns",
      "Circumventing suppression systems",
      "Misrepresenting business or sender information",
    ],
    afterList: [
      "MunchReach may link and restrict accounts where reasonably necessary to prevent abuse or enforcement evasion.",
    ],
  },
  {
    id: "reporting-abuse",
    heading: "15. Reporting abuse",
    body: [
      "Recipients or other parties who believe messages sent through MunchReach violate this policy may report them to us.",
      "Email support@munchreach.com with details of the message you received, including the sender address and the date it arrived, or use our Contact Support page. We review every report and take action where this policy has been violated.",
    ],
  },
  {
    id: "enforcement",
    heading: "16. Policy enforcement",
    body: ["Violations of this policy may result in:"],
    list: [
      "Warning",
      "Sending restrictions",
      "Campaign suspension",
      "Mailbox suspension",
      "Workspace restrictions",
      "Account suspension",
      "Account termination",
    ],
    afterList: [
      "The severity of the action may depend on the nature of the violation, recipient impact, sending behavior, abuse signals, previous violations, attempts to evade enforcement, and applicable legal requirements.",
    ],
  },
];

const relatedPolicies = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Acceptable Use", href: "/acceptable-use" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Data Processing Agreement", href: "/dpa" },
];

function SendingPolicy() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Sending"
        highlight="Policy"
        description="Last updated: September 10, 2026. The standards that apply when you send email through MunchReach."
        primaryCta="Contact Support"
      />
      <Section>
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Table of contents — sticky on desktop, stacked card on mobile */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="Table of contents" className="surface-card p-6">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Contents</h2>
              <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-1">
                {toc.map(([id, label]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="text-sm text-primary hover:underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="max-w-3xl">
            <p className="text-sm font-medium text-muted-foreground">Last updated: September 10, 2026</p>
            {sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                className="mb-10 scroll-mt-24 border-t border-border/60 pt-8 first:mt-8 first:border-t-0 first:pt-0"
              >
                <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
                {s.body?.map((p) => (
                  <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
                {s.list ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {s.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {s.afterList?.map((p) => (
                  <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
                {s.list2 ? (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {s.list2.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <section id="related-policies" className="mb-10 scroll-mt-24 border-t border-border/60 pt-8">
              <h2 className="text-xl font-semibold tracking-tight">17. Related policies</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                This policy works together with the rest of our legal documentation:
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {relatedPolicies.map((p) => (
                  <li key={p.href}>
                    <Link to={p.href} className="text-primary hover:underline">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <div className="mt-4 text-right">
              <a href="#top" className="text-sm text-primary hover:underline">
                Back to top
              </a>
            </div>
          </div>
        </div>
      </Section>
      <CtaBlock
        title="Ready to send responsibly?"
        description="Start a free workspace and put these practices to work."
        cta="Start for Free"
      />
    </MarketingLayout>
  );
}
