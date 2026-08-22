import { createFileRoute } from "@tanstack/react-router";

import { MarketingLayout, PageHero, Section, Prose, metaFor } from "@/components/site/MarketingPage";

const LAST_UPDATED = "22 August 2026";

export const Route = createFileRoute("/dpa")({
  head: () =>
    metaFor(
      "Data Processing Agreement — MunchReach",
      "The MunchReach Data Processing Agreement: roles, processing instructions, security, subprocessors, breach notification, retention and audit rights.",
      "/dpa",
    ),
  component: DpaPage,
});

const sections = [
  {
    heading: "1. Definitions",
    body: [
      "\"Customer\" means the organisation or individual that has an account with MunchReach. \"MunchReach\", \"we\" or \"us\" means the provider of the MunchReach platform.",
      "\"Personal data\" means information relating to an identified or identifiable person that the Customer uploads to, or generates in, the platform. \"Processing\" means any operation performed on personal data. \"Subprocessor\" means a third party engaged by MunchReach to process personal data on the Customer's behalf.",
      "\"Agreement\" means the MunchReach Terms of Service. This Data Processing Agreement (\"DPA\") forms part of it.",
    ],
  },
  {
    heading: "2. Scope",
    body: [
      "This DPA applies whenever MunchReach processes personal data on behalf of the Customer in the course of providing the platform: contact records, campaign content, email events, replies and account information.",
      "It does not apply to data MunchReach processes for its own purposes, such as billing records and account administration, which are covered by the Privacy Policy.",
    ],
  },
  {
    heading: "3. Roles of the parties",
    body: [
      "The Customer is the controller of the contact and recipient data it uploads and of the emails it sends. The Customer decides what data to collect, who to contact and what to say.",
      "MunchReach is the processor for that data and acts on the Customer's documented instructions. For its own account, billing and security records MunchReach acts as a controller.",
    ],
  },
  {
    heading: "4. Processing instructions",
    body: [
      "MunchReach processes personal data only to provide, secure, support and improve the platform, and only as instructed by the Customer through the product interface, the documentation and this DPA.",
      "MunchReach does not sell customer data, does not use recipient data to build its own contact database, and does not use customer content for purposes unrelated to delivering the service.",
      "If MunchReach believes an instruction is unlawful, it will inform the Customer and may pause the affected processing.",
    ],
  },
  {
    heading: "5. Personal data processed",
    body: [
      "Contact and lead records supplied by the Customer, typically name, email address, company, job title and any custom fields the Customer chooses to import.",
      "Email content authored by the Customer, and the delivery, open, click, bounce, unsubscribe and reply events generated when those emails are sent.",
      "Account data for the Customer's own users: name, email address, role, workspace membership and authentication metadata.",
    ],
  },
  {
    heading: "6. Data subjects",
    body: [
      "The people whose data is processed are the Customer's own users and team members, and the recipients and prospects the Customer chooses to contact through the platform.",
    ],
  },
  {
    heading: "7. Security",
    body: [
      "Access to customer data is restricted to the workspace it belongs to and enforced at the database level, so one workspace cannot read another's records.",
      "Data is transmitted over encrypted connections (TLS) and stored on managed infrastructure that encrypts data at rest. Provider credentials and API keys supplied by the Customer are stored encrypted and are never returned to the browser.",
      "Administrative access is limited to staff who need it for support and operations, and privileged actions are recorded in an audit log.",
      "MunchReach describes only the controls it actually operates. No certification, audit report or compliance attestation is claimed on this page; where a certification is required, contact us before relying on one.",
    ],
  },
  {
    heading: "8. Confidentiality",
    body: [
      "Personnel with access to personal data are bound by confidentiality obligations and only access customer content when needed to operate the service, investigate an incident, or respond to a support request from the Customer.",
    ],
  },
  {
    heading: "9. Subprocessors",
    body: [
      "The Customer authorises MunchReach to engage subprocessors to deliver the service — for example email delivery infrastructure, database hosting and application hosting.",
      "The current list is published on the Subprocessors page and is kept up to date. MunchReach imposes data protection obligations on each subprocessor no less protective than those in this DPA and remains responsible for their performance.",
      "MunchReach will update that page before a new subprocessor begins processing customer personal data. Customers who object may raise the objection through Contact Support.",
    ],
  },
  {
    heading: "10. International data transfers",
    body: [
      "Personal data may be processed in the countries where our subprocessors operate; the location of each is listed on the Subprocessors page.",
      "Where a transfer mechanism such as Standard Contractual Clauses is required for the Customer's jurisdiction, contact MunchReach so the applicable terms can be agreed in writing. This page does not itself incorporate any transfer mechanism.",
    ],
  },
  {
    heading: "11. Data breach notification",
    body: [
      "If MunchReach becomes aware of a security incident that leads to accidental or unlawful destruction, loss, alteration or unauthorised disclosure of customer personal data, it will notify affected Customers without undue delay.",
      "The notification will describe what is known about the incident, the categories of data involved, the measures taken, and the contact point for further information. Confirmed platform-wide incidents are also published on the User Guide & Alerts page.",
    ],
  },
  {
    heading: "12. Data subject requests",
    body: [
      "The Customer can access, export, correct and delete contact records directly in the platform, which is the fastest way to satisfy a request from one of its recipients.",
      "If a data subject contacts MunchReach directly, we will refer them to the relevant Customer unless legally required to respond, and will assist the Customer in responding where the request concerns data we hold.",
      "Individuals can submit a request through the Remove My Data page.",
    ],
  },
  {
    heading: "13. Retention and deletion",
    body: [
      "Customer personal data is retained while the account is active. Contacts, campaigns and messages deleted in the product are removed from the live database.",
      "After an account is closed, remaining customer data is deleted or anonymised within a reasonable period, except where a record must be kept for billing, tax, fraud prevention or legal reasons.",
      "The Customer can request deletion at any time through Contact Support or the Remove My Data page.",
    ],
  },
  {
    heading: "14. Audit rights",
    body: [
      "On reasonable written request and no more than once a year, MunchReach will provide the information reasonably necessary to demonstrate compliance with this DPA, including a written description of the applicable controls.",
      "On-site audits are available only where required by law and must be agreed in advance, scheduled to avoid disruption, and conducted under confidentiality.",
    ],
  },
  {
    heading: "15. Termination",
    body: [
      "This DPA remains in force for as long as MunchReach processes personal data for the Customer. On termination, MunchReach stops processing except as needed to complete deletion, and deletes the data in accordance with section 13.",
    ],
  },
  {
    heading: "16. Liability",
    body: [
      "Each party's liability under this DPA is subject to the limitations and exclusions set out in the Agreement. Nothing in this DPA limits liability that cannot be limited under applicable law.",
    ],
  },
  {
    heading: "17. Contact",
    body: [
      "Questions about this DPA, or a request for a signed copy: support@munchreach.com.",
      `Effective date: ${LAST_UPDATED}. Last updated: ${LAST_UPDATED}.`,
    ],
  },
];

function DpaPage() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Legal"
        title="Data Processing"
        highlight="Agreement"
        description="How MunchReach processes personal data on behalf of its customers, and the commitments that apply when it does."
      />
      <Section>
        <p className="mb-8 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
        <Prose sections={sections} />
      </Section>
    </MarketingLayout>
  );
}
