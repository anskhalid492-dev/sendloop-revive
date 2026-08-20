import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, Prose, CtaBlock, metaFor } from "@/components/site/MarketingPage";

export const Route = createFileRoute("/privacy")({
  head: () =>
    metaFor(
      "Privacy Policy — How MunchReach Handles Your Data",
      "What data MunchReach collects, how it is stored and encrypted, who can access it, and how to exercise your GDPR/CCPA rights.",
      "/privacy",
    ),
  component: Privacy,
});

const toc = [
  ["scope", "1. Scope and roles"],
  ["collection", "2. Data we collect"],
  ["use", "3. How we use data"],
  ["credentials", "4. Sending credentials & encryption"],
  ["subprocessors", "5. Sub-processors and international transfers"],
  ["cookies", "6. Cookies and tracking"],
  ["retention", "7. Data retention"],
  ["security", "8. Security"],
  ["billing", "9. Billing data"],
  ["gdpr", "10. GDPR rights (EU/UK)"],
  ["ccpa", "11. CCPA/CPRA rights (California)"],
  ["children", "12. Children's privacy"],
  ["breach", "13. Breach notification"],
  ["changes", "14. Changes to this policy"],
  ["contact", "15. Contact"],
] as const;

const sections = [
  {
    id: "scope",
    heading: "1. Scope and roles",
    body: [
      "This policy describes how MunchReach, Inc. (\"MunchReach\", \"we\", \"us\") collects, uses and protects personal data when you use our website, application and API (together, the \"Service\").",
      "When you use MunchReach to contact your own prospects, you act as the data controller for that prospect data and MunchReach acts as a data processor operating on your documented instructions. When we collect data about you as our customer or user (account, billing, support data), MunchReach is the controller.",
    ],
  },
  {
    id: "collection",
    heading: "2. Data we collect",
    body: [
      "Account data: name, email address, password hash, and authentication provider identifiers (e.g. Google OAuth subject ID).",
      "Workspace data: workspace names, membership, roles, invitations and audit logs of administrative actions.",
      "Campaign data: lead records you import, email content and templates, sending schedules, opens, clicks, replies and bounce/delivery events.",
      "Connected mailbox data: OAuth tokens or SMTP/IMAP credentials, message headers and bodies needed to send and sync replies.",
      "Technical data: IP address, browser type, device identifiers and usage logs collected for security, analytics and abuse prevention.",
      "Support data: the content of tickets, emails or chat messages you send us, including any attachments.",
    ],
  },
  {
    id: "use",
    heading: "3. How we use data",
    body: [
      "To operate the Service: authenticating you, sending email on your behalf, syncing replies, deduplicating leads and producing analytics.",
      "To secure the Service: detecting abuse, fraud, credential stuffing and unauthorised access, and enforcing our Acceptable Use Policy.",
      "To support you: responding to requests, diagnosing issues you report and providing onboarding.",
      "To improve the Service: aggregated, de-identified usage statistics that cannot be tied back to an individual.",
      "We do not sell personal data, and we do not use your lead or campaign content to train shared or third-party models.",
    ],
  },
  {
    id: "credentials",
    heading: "4. Sending credentials & encryption",
    body: [
      "Provider credentials (SMTP passwords, API keys and OAuth refresh tokens) are encrypted with AES-256-GCM before storage, using keys held in a managed key-management service separate from the application database.",
      "Decryption happens only inside server-side sending workers at the moment a send, sync, or connection test is performed, and is never exposed to the browser or logged in plaintext.",
      "Access to decrypt operations is scoped per-workspace and recorded in internal audit logs.",
    ],
  },
  {
    id: "subprocessors",
    heading: "5. Sub-processors and international transfers",
    body: [
      "We rely on a limited set of infrastructure, email-delivery, analytics and customer-support sub-processors to run the Service. A current list, including the purpose and location of each, is available on request at privacy@munchreach.app.",
      "Where personal data is transferred outside the EEA/UK, we rely on Standard Contractual Clauses or an equivalent adequacy mechanism with each relevant sub-processor.",
      "We require every sub-processor to contractually maintain a level of data protection consistent with this policy and applicable law.",
    ],
  },
  {
    id: "cookies",
    heading: "6. Cookies and tracking",
    body: [
      "We use strictly necessary cookies for authentication and session management. These cannot be disabled without breaking core functionality.",
      "We use limited analytics cookies to understand product usage; you can opt out of non-essential analytics from your workspace settings.",
      "Campaign tracking pixels and link-tracking used in emails you send are configured and controlled by you, the sender, not by MunchReach directly.",
    ],
  },
  {
    id: "retention",
    heading: "7. Data retention",
    body: [
      "Workspace data is retained while the workspace is active and for 30 days after deletion to allow recovery from accidental deletion.",
      "Backups are rotated on a 30-day cycle and are purged of deleted workspace data at the end of that cycle.",
      "Suppression records (opt-outs and bounces) are retained indefinitely, even after account closure, so that opt-outs are permanently honoured across the platform.",
      "Billing records are retained for the period required by applicable tax and accounting law, typically 7 years.",
    ],
  },
  {
    id: "security",
    heading: "8. Security",
    body: [
      "Access to workspace data is enforced at the database level with row-level security tied to workspace membership.",
      "All traffic is encrypted in transit with TLS 1.2 or higher, and data is encrypted at rest using provider-managed disk encryption plus field-level encryption for credentials.",
      "We perform regular access reviews, dependency scanning and third-party penetration testing at least annually.",
      "Employee access to production systems requires multi-factor authentication and is logged and reviewed.",
    ],
  },
  {
    id: "billing",
    heading: "9. Billing data",
    body: [
      "Payment card details are collected and processed directly by our PCI-DSS-compliant payment processor; MunchReach does not store full card numbers on its own systems.",
      "We retain invoice metadata (amounts, dates, plan) for accounting and dispute-resolution purposes.",
    ],
  },
  {
    id: "gdpr",
    heading: "10. GDPR rights (EU/UK)",
    body: [
      "If you are located in the EEA or UK, you have the right to access, rectify, export, restrict, object to, or erase your personal data, and the right to lodge a complaint with your local supervisory authority.",
      "Where processing relies on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.",
      "Prospects contacted through a MunchReach customer's campaigns may direct rights requests to us at privacy@munchreach.app; we will forward the request to the responsible workspace controller and, on request, suppress the address across the platform.",
    ],
  },
  {
    id: "ccpa",
    heading: "11. CCPA/CPRA rights (California)",
    body: [
      "California residents have the right to know what personal information is collected, request deletion, correct inaccurate information, and opt out of the sale or sharing of personal information.",
      "MunchReach does not sell or share personal information as those terms are defined under the CCPA/CPRA.",
      "You may submit a verifiable request to privacy@munchreach.app; we will respond within 45 days as required by law.",
    ],
  },
  {
    id: "children",
    heading: "12. Children's privacy",
    body: [
      "The Service is intended for business use by adults. We do not knowingly collect personal data from anyone under 16, and we will delete any such data if discovered.",
    ],
  },
  {
    id: "breach",
    heading: "13. Breach notification",
    body: [
      "In the event of a confirmed data breach affecting your personal data, we will notify affected workspace owners without undue delay and, where required by law, within 72 hours of becoming aware of the breach.",
    ],
  },
  {
    id: "changes",
    heading: "14. Changes to this policy",
    body: [
      "We will notify workspace owners by email at least 14 days before any material change to this policy takes effect. Continued use of the Service after that date constitutes acceptance of the updated policy.",
    ],
  },
  {
    id: "contact",
    heading: "15. Contact",
    body: [
      "Questions about this policy or requests to exercise your rights can be sent to privacy@munchreach.app. We aim to respond to all verified requests within 30 days.",
    ],
  },
];

function Privacy() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Privacy"
        highlight="Policy"
        description="Last updated: August 17, 2026. This policy explains what we collect, why we collect it and the control you have over it."
        primaryCta="Contact Privacy Team"
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
      <CtaBlock title="Questions about your data?" description="Our privacy team is happy to walk through anything in this policy." cta="Start for Free" />
    </MarketingLayout>
  );
}
