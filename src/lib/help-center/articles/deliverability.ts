import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const DELIVERABILITY_ARTICLES: HelpArticle[] = [
  {
    slug: "deliverability-basics",
    title: "Deliverability basics",
    description: "What decides whether your email reaches the inbox.",
    category: "deliverability",
    updated: UPDATED,
    popular: true,
    keywords: ["deliverability", "inbox placement", "reputation", "spam folder"],
    related: ["spam-placement-first-checks", "improve-reply-rate-safely", "warmup-best-practices"],
    content: `Delivery is not the same as placement. A message can be accepted and still land in spam.

## What receivers weigh
- **Mailbox health** — setup and recent sending behaviour must be healthy
- **Reputation** — of your domain and of each mailbox, built over time
- **List quality** — bounces and spam complaints are the fastest way down
- **Engagement** — replies and opens versus deletions and complaints
- **Volume pattern** — steady beats spiky
- **Content** — link count, images, attachments, and how templated it reads

## The practical order of work
1. Confirm each sending mailbox is Active and healthy.
2. Warm the mailboxes.
3. Clean the list before you send to it.
4. Keep volume modest per mailbox and add mailboxes to scale.
5. Write something a human would answer.

## Important notes
No tool can make a bad list deliverable. Most "deliverability problems" are list problems wearing a disguise.`,
  },
  {
    slug: "spam-placement-first-checks",
    title: "Emails are landing in spam",
    description: "The first checks to run when placement drops.",
    category: "deliverability",
    updated: UPDATED,
    popular: true,
    keywords: ["spam folder", "junk", "placement", "not in inbox", "filtered"],
    related: ["deliverability-basics", "reduce-bounce-rate", "warmup-best-practices"],
    content: `## Problem
Mail is delivered but lands in spam or promotions.

## Possible causes
- A sending mailbox has a setup or health warning
- The domain or mailbox is too new for the volume being sent
- Bounce or complaint rates are elevated
- The copy is heavily templated, link-stuffed or image-heavy
- Volume ramped too fast
- The domain has been used for aggressive sending before

## How to check
1. Open **Email Accounts** and confirm each sending mailbox is Active without a health warning.
2. Analytics → bounce rate and unsubscribe rate for the period placement dropped.
3. Warmup → mailbox health bands.
4. Send yourself a test at a couple of different providers and see where it lands.

## How to fix
- Resolve mailbox setup and health warnings first.
- Cut daily volume per mailbox, and widen the sending window.
- Clean and re-verify the list; remove anything that bounced.
- Reduce links to one, drop images and attachments from the first email, and shorten it.
- Let warmup run longer before pushing volume again.

## When to contact support
Mailbox health is good, bounce rate is low, mailboxes are warm and modest volume still lands in spam consistently.`,
  },
  {
    slug: "reduce-bounce-rate",
    title: "Reducing your bounce rate",
    description: "Why bounces matter more than any other metric, and how to cut them.",
    category: "deliverability",
    updated: UPDATED,
    keywords: ["bounce rate", "invalid emails", "verify list", "hard bounce"],
    related: ["hard-vs-soft-bounces", "bounce-complaint-protection", "deliverability-basics", "duplicate-leads"],
    content: `## Target
Keep hard bounces well under two percent. Sustained higher rates damage the domain and can auto-pause mailboxes.

## How to cut them
1. Verify lists before importing; MunchReach gates campaign use on list verification for exactly this reason.
2. Remove role addresses such as info@ and sales@ where they are not your buyer.
3. Drop leads sourced more than a few months ago without re-verifying.
4. Never re-send to an address that hard bounced. It is permanently suppressed for a reason.
5. Deduplicate before launch.

## Important notes
Buying a cheap list and paying to verify it does not make it a good list. It makes it a deliverable bad list.`,
  },
  {
    slug: "hard-vs-soft-bounces",
    title: "Hard bounces vs soft bounces",
    description: "Permanent failures, temporary failures, and what MunchReach does with each.",
    category: "deliverability",
    updated: UPDATED,
    keywords: ["hard bounce", "soft bounce", "deferred", "mailbox full", "does not exist"],
    related: ["reduce-bounce-rate", "smtp-550-5-7-1", "bounce-complaint-protection"],
    content: `## Hard bounce
The address does not exist or the domain rejects it permanently. The lead is suppressed and will not be contacted again.

## Soft bounce
A temporary condition — mailbox full, server unavailable, greylisting. Delivery may be retried.

## Why the distinction matters
Hard bounces are what damage reputation. A run of soft bounces to one domain usually means that receiver is throttling you — slow down rather than push harder.

## Important notes
Repeated soft bounces to the same address eventually behave like a hard bounce. Do not keep a persistently failing address in rotation.`,
  },
  {
    slug: "smtp-550-5-7-1",
    title: "550 5.7.1 and similar rejections",
    description: "What a policy rejection means and how to respond.",
    category: "deliverability",
    updated: UPDATED,
    popular: true,
    keywords: ["550", "5.7.1", "rejected", "blocked", "policy", "smtp error"],
    related: ["hard-vs-soft-bounces", "spam-placement-first-checks", "sending-troubleshooting"],
    content: `## Problem
Messages are rejected with a 550 5.7.1 or a similar policy error.

## What it means
The receiving server accepted the connection and refused the message on policy grounds — not because the address is wrong.

## Possible causes
- The sending mailbox has a setup or policy issue
- The sending domain or its infrastructure is on a blocklist
- The recipient's organisation blocks external cold mail
- Volume from your domain tripped the receiver's rate policy
- The content matched a filtering rule

## How to check
1. Read the exact text of the rejection on the failed message; receivers usually say why.
2. Open **Email Accounts** and check the sending mailbox for setup or policy warnings.
3. Look at whether the rejections are concentrated at one recipient domain or spread across many.

## How to fix
- Resolve the mailbox action shown before sending again.
- If it is one recipient domain only, that organisation is blocking you; remove those leads.
- If it is widespread, reduce volume per mailbox, pause the campaign, and let warmup and reputation recover before resuming.

## When to contact support
Authentication passes, rejections are widespread, and volume is already low.`,
  },
  {
    slug: "improve-reply-rate-safely",
    title: "Improving reply rate without hurting deliverability",
    description: "Changes that raise engagement and lower risk at the same time.",
    category: "deliverability",
    updated: UPDATED,
    keywords: ["reply rate", "engagement", "copy", "improve results"],
    related: ["deliverability-basics", "write-first-email", "generate-opening-lines", "reading-analytics"],
    content: `1. Narrow the audience. A smaller, better-targeted list beats a bigger one on every metric including deliverability.
2. Shorten the first email. Under a hundred words, one idea, one question.
3. Use one link at most in the first email, or none.
4. Make the personalization specific enough that it could not be sent to anyone else.
5. Ask something easy to answer instead of asking for a meeting immediately.
6. Fewer follow-ups, better spaced. Five aggressive chases generate complaints, not replies.
7. Send at a sane local hour in the recipient's timezone.

## Important notes
Engagement and deliverability move together. Anything that makes the email more worth answering also makes it more likely to reach the inbox.`,
  },
];
