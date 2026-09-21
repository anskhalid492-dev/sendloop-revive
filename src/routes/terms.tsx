import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, CtaBlock, metaFor } from "@/components/site/MarketingPage";

export const Route = createFileRoute("/terms")({
  head: () =>
    metaFor(
      "Terms of Service — MunchReach",
      "The agreement covering use of MunchReach: accounts, billing, SLA, acceptable use, liability, termination and governing law.",
      "/terms",
    ),
  component: Terms,
});

const toc = [
  ["agreement", "1. Agreement to terms"],
  ["accounts", "2. Accounts and eligibility"],
  ["plans", "3. Plans, billing and taxes"],
  ["trials", "4. Trials and refunds"],
  ["use", "5. Acceptable use"],
  ["content", "6. Your content and licence"],
  ["ip", "7. Intellectual property"],
  ["availability", "8. Service availability and SLA"],
  ["suspension", "9. Suspension and termination"],
  ["warranty", "10. Disclaimers"],
  ["liability", "11. Limitation of liability"],
  ["indemnity", "12. Indemnification"],
  ["changes", "13. Changes to these terms"],
  ["law", "14. Governing law and disputes"],
  ["misc", "15. Miscellaneous"],
] as const;

const sections = [
  {
    id: "agreement",
    heading: "1. Agreement to terms",
    body: [
      "MunchReach is an email outreach and campaign management platform for managing Leads and Contacts, Email Accounts, Connected Mailboxes, Campaigns, Sequences, follow-ups, Email Messages, AI Personalization, Analytics and a Unified Inbox (the \"Service\"). By creating an account, accessing or using the Service, you agree to these Terms of Service on behalf of yourself and any organisation you represent. If you do not agree, you may not use the Service.",
      "These terms incorporate by reference our Privacy Policy and Acceptable Use Policy.",
    ],
  },
  {
    id: "accounts",
    heading: "2. Accounts and eligibility",
    body: [
      "You must be at least 18 years old and capable of forming a binding contract to create an account.",
      "You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs in workspaces you own or administer, including activity by team members and connected integrations.",
      "You must provide accurate registration information and keep it up to date.",
    ],
  },
  {
    id: "plans",
    heading: "3. Plans, billing and taxes",
    body: [
      "Paid plans are billed in advance on a monthly or annual cycle and renew automatically until cancelled.",
      "Fees are exclusive of applicable taxes, which we will collect where required by law.",
      "Upgrades take effect immediately with prorated charges; downgrades take effect at the end of the current billing period.",
      "Fees already paid are non-refundable except where required by law or expressly stated in these terms.",
    ],
  },
  {
    id: "trials",
    heading: "4. Trials and refunds",
    body: [
      "Free trials, where offered, convert to a paid subscription automatically unless cancelled before the trial ends.",
      "We do not offer prorated refunds for partial billing periods, except where a jurisdiction's consumer protection law requires otherwise.",
    ],
  },
  {
    id: "use",
    heading: "5. Acceptable use",
    body: [
      "You must comply with our Acceptable Use Policy, Sending Policy and all laws that apply to your Recipients, Leads and Contacts, Campaigns and Email Sending.",
      "You are responsible for the Email Accounts and Connected Mailboxes you connect, your authorization to use them, the Leads and Contacts you upload, the Recipients you contact, and the Campaigns, Sequences and Email Messages you send.",
      "You must establish any required lawful basis, use accurate sender information, honour unsubscribe requests, maintain suppression requirements and comply with applicable privacy, data-protection and anti-spam laws.",
      "You may not send unlawful, deceptive or harmful content; use an Email Account without permission; or circumvent Mailbox, Sending Account, Campaign or workspace limits.",
    ],
  },
  {
    id: "content",
    heading: "6. Your content and licence",
    body: [
      "You retain ownership of the Leads and Contacts, templates, Campaign content, Email Messages and other data you upload to or create in the Service (\"Your Content\").",
      "You grant MunchReach a limited, worldwide, non-exclusive licence to host, process and transmit Your Content solely to operate and support the Service for you.",
      "You represent that you have all rights necessary to grant this licence and that Your Content does not infringe any third party's rights.",
    ],
  },
  {
    id: "ip",
    heading: "7. Intellectual property",
    body: [
      "MunchReach and its licensors retain all right, title and interest in the Service, including its software, design and trademarks.",
      "No rights are granted to you other than the limited right to use the Service in accordance with these terms.",
    ],
  },
  {
    id: "availability",
    heading: "8. Service availability and SLA",
    body: [
      "We target 99.9% monthly uptime for the core application, measured as availability of the login and campaign-sending endpoints, excluding scheduled maintenance.",
      "Scheduled maintenance is announced at least 24 hours in advance where practical and performed during low-traffic windows.",
      "Paid plans with a written SLA agreement may be eligible for service credits for downtime exceeding the committed threshold, subject to a claim submitted within 30 days.",
      "Third-party services used for Email Account connections, mailbox access, delivery, billing or integrations may impose limits or experience outages outside our control, and are excluded from any uptime commitment.",
    ],
  },
  {
    id: "suspension",
    heading: "9. Suspension and termination",
    body: [
      "We may suspend or terminate a workspace that violates these terms, the Sending Policy or the Acceptable Use Policy; generates excessive bounces or complaints; repeatedly ignores unsubscribe or suppression requirements; or puts Recipients, Connected Mailboxes or sending infrastructure at risk.",
      "Where practical, we will provide notice and an opportunity to remedy the issue before suspension, except where immediate action is necessary to protect the Service or other users.",
      "You may cancel at any time from workspace settings; your data remains available for export for 30 days after cancellation, after which it is deleted per our retention schedule.",
    ],
  },
  {
    id: "warranty",
    heading: "10. Disclaimers",
    body: [
      "The Service is provided \"as is\" and \"as available\" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.",
      "We do not warrant that outreach sent through the Service will achieve any particular deliverability, reply rate, or business outcome.",
    ],
  },
  {
    id: "liability",
    heading: "11. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, our aggregate liability arising out of or relating to the Service is limited to the fees you paid in the 12 months preceding the claim.",
      "We are not liable for indirect, incidental, special, consequential or punitive damages, including lost profits, lost data, or lost business opportunities, even if advised of the possibility of such damages.",
      "Nothing in these terms limits liability that cannot be limited under applicable law, including for gross negligence or wilful misconduct.",
    ],
  },
  {
    id: "indemnity",
    heading: "12. Indemnification",
    body: [
      "You agree to indemnify and hold MunchReach harmless from claims, damages and expenses arising from your use of the Service in violation of these terms, applicable law, or third-party rights, including claims arising from Your Content or your outreach practices.",
    ],
  },
  {
    id: "changes",
    heading: "13. Changes to these terms",
    body: [
      "We may update these terms from time to time. We will notify workspace owners by email at least 14 days before material changes take effect. Continued use of the Service after that date constitutes acceptance of the updated terms.",
    ],
  },
  {
    id: "law",
    heading: "14. Governing law and disputes",
    body: [
      "These terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-law principles.",
      "Any dispute arising from these terms will be resolved through binding arbitration on an individual basis, except where prohibited by law or where either party seeks injunctive relief.",
    ],
  },
  {
    id: "misc",
    heading: "15. Miscellaneous",
    body: [
      "If any provision of these terms is found unenforceable, the remaining provisions remain in full effect.",
      "These terms, together with the Privacy Policy and Acceptable Use Policy, constitute the entire agreement between you and MunchReach regarding the Service.",
      "You may not assign these terms without our written consent; we may assign them in connection with a merger, acquisition, or sale of assets.",
    ],
  },
];

function Terms() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Terms of"
        highlight="Service"
        description="Last updated: August 17, 2026. These terms govern your use of MunchReach and all related services."
        primaryCta="Contact Legal"
      />
      <Section>
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Last updated: August 17, 2026</p>
          <div className="surface-card mt-4 p-6">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Contents</h2>
            <ol className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-sm text-primary hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mx-auto max-w-3xl">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="mb-10 scroll-mt-24 border-t border-border/60 pt-8 first:mt-8 first:border-t-0 first:pt-0">
              <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </Section>
      <CtaBlock title="Ready to send with confidence?" description="Start a free workspace and put these terms into practice." cta="Start for Free" />
    </MarketingLayout>
  );
}
