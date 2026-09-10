import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const COMPLIANCE_ARTICLES: HelpArticle[] = [
  {
    slug: "suppression-lists",
    title: "How suppression works",
    description: "Who is excluded from sending, and why you cannot override it.",
    category: "compliance",
    updated: UPDATED,
    popular: true,
    keywords: ["suppression", "excluded", "do not contact", "blocklist", "opt out"],
    related: ["manage-unsubscribes", "suppressed-leads", "reduce-bounce-rate"],
    content: `Suppression is the workspace's list of addresses that must not be contacted.

## What lands on it
- Anyone who unsubscribed
- Addresses that hard bounced
- Recipients who marked mail as spam
- Anything you add manually

## How it is applied
Suppressed addresses are excluded when a campaign builds its audience, and re-checked before sending. Importing them again does not re-enable them.

## Important notes
This is deliberately not overridable. Contacting someone who opted out is both a legal problem and the fastest route to spam complaints.`,
  },
  {
    slug: "manage-unsubscribes",
    title: "Unsubscribes and opt-outs",
    description: "Offering an exit and honouring it.",
    category: "compliance",
    updated: UPDATED,
    keywords: ["unsubscribe", "opt out", "remove me", "footer link"],
    related: ["suppression-lists", "compliance-basics", "conversation-statuses"],
    content: `## Automatic handling
When someone unsubscribes, they are suppressed workspace-wide and removed from every active sequence immediately.

## Manual opt-outs
Plenty of people simply reply "remove me". Mark the conversation **Unsubscribed** so the lead is suppressed rather than just archived.

## Important notes
- Include a clear way to opt out in cold email. It reduces spam complaints, which cost far more than the unsubscribe does.
- Never argue with an opt-out, and never move an unsubscribed address into a "new" list.`,
  },
  {
    slug: "compliance-basics",
    title: "Cold email compliance basics",
    description: "The obligations that apply wherever you send.",
    category: "compliance",
    updated: UPDATED,
    keywords: ["compliance", "can-spam", "gdpr", "legal", "regulations"],
    related: ["manage-unsubscribes", "suppression-lists", "privacy-basics"],
    content: `Rules vary by jurisdiction — CAN-SPAM in the US, GDPR and PECR in Europe, CASL in Canada, and others. This is guidance, not legal advice; check your obligations for the markets you send to.

## Common requirements
- Identify yourself and your business honestly
- Include a valid physical postal address
- Do not use misleading subject lines or forged headers
- Offer a clear opt-out and honour it promptly
- In several jurisdictions, have a defensible lawful basis for contacting a person at all
- Keep records of consent or legitimate interest where required

## Practical guidance
1. Send business-to-business, to a person whose role makes your message relevant.
2. Say where you got their details if asked.
3. Keep the list of who opted out forever, even if you delete the lead.

## Important notes
Compliance is not the same as deliverability, but they push the same way: relevance, honesty and a working exit.`,
  },
  {
    slug: "bounce-complaint-protection",
    title: "Bounce and complaint protection",
    description: "Automatic guards that pause sending before real damage is done.",
    category: "compliance",
    updated: UPDATED,
    keywords: ["protection", "auto pause", "complaint rate", "bounce threshold", "safety"],
    related: ["warmup-statuses", "reduce-bounce-rate", "mailbox-health", "suppression-lists"],
    content: `MunchReach watches bounce and complaint rates per mailbox and pauses a mailbox that crosses a safety threshold.

## Why
A mailbox with a climbing bounce or complaint rate is destroying reputation with every additional send. Pausing costs you a day; not pausing costs you the domain.

## What to do when it triggers
1. Open Warmup or Email Accounts and read the pause reason.
2. Fix the underlying cause: clean the list, remove the source of bad addresses, repair authentication.
3. Resume only afterwards.

## Important notes
Resuming without fixing anything trips the same guard again and compounds the damage. Treat a protection pause as information, not an obstacle.`,
  },
  {
    slug: "sending-restrictions",
    title: "What you must not send with MunchReach",
    description: "Prohibited use that will get your workspace suspended.",
    category: "compliance",
    updated: UPDATED,
    keywords: ["prohibited", "acceptable use", "banned", "restrictions", "suspended"],
    related: ["compliance-basics", "suppression-lists", "account-security"],
    content: `Do not use MunchReach for:
- Purchased, scraped or otherwise non-consented consumer lists
- Deceptive sender identities, forged headers or misleading subjects
- Phishing, malware, or anything impersonating another business
- Content that is illegal in the markets you send to
- Sending to addresses that have opted out or hard bounced
- Sharing one workspace's mailboxes to send another party's unrelated campaigns

## Important notes
Abuse harms shared sending reputation, so it is enforced. If your programme depends on any of the above, MunchReach is not the right tool.`,
  },
];
