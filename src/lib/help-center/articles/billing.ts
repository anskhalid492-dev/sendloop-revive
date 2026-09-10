import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const BILLING_ARTICLES: HelpArticle[] = [
  {
    slug: "plans-and-invoices",
    title: "Plans, subscriptions and invoices",
    description: "Where to see your plan, its limits and your billing history.",
    category: "billing",
    updated: UPDATED,
    popular: true,
    keywords: ["plan", "subscription", "invoice", "receipt", "pricing", "billing"],
    related: ["billing-usage", "upgrade-downgrade", "subscription-statuses", "payment-issues"],
    content: `## Steps
1. Go to **Settings → Billing**.
2. Your current plan, its limits and your subscription state are shown there.
3. Invoices and receipts are available from the same page.

## What a plan controls
Limits such as how many mailboxes, leads and campaigns your workspace can use, and which features — including AI personalization — are enabled.

## Important notes
Plan names, limits and prices are set centrally and can change, so Settings → Billing is the authoritative view for your workspace. Treat any number written in a help article as an example, not a quote.`,
  },
  {
    slug: "subscription-statuses",
    title: "Subscription statuses",
    description: "What each state means for your ability to send.",
    category: "billing",
    updated: UPDATED,
    keywords: ["trial", "active", "past due", "payment failed", "cancelled", "expired", "paused"],
    related: ["payment-issues", "plans-and-invoices", "cancel-downgrade-refunds"],
    content: `- **Trial** — full access for the trial period
- **Active** — paid and current
- **Past due** — a payment is late; access may be restricted
- **Payment failed** — the last charge did not go through
- **Paused** — the subscription is suspended
- **Cancelled** — will not renew; access ends at the period end
- **Expired** — the period has ended
- **No subscription** — nothing active on this workspace

## Important notes
Sending is affected by the state, but your data is not deleted the moment a subscription lapses. Fix the payment and access returns.`,
  },
  {
    slug: "billing-usage",
    title: "Usage and plan limits",
    description: "See what you have used and what happens at the limit.",
    category: "billing",
    updated: UPDATED,
    keywords: ["usage", "limits", "quota", "entitlement", "how much left"],
    related: ["plans-and-invoices", "upgrade-downgrade", "ai-usage-limits", "sending-capacity"],
    content: `## Where to look
**Settings → Billing** shows your usage against the plan's limits.

## What happens at a limit
The action that would exceed it is blocked with an explanation — for example adding another mailbox, importing more leads, or running AI personalization. Existing campaigns keep running.

## Important notes
- AI provider costs are separate: they are billed to you by OpenAI or Anthropic on the key you connected, not by MunchReach.
- Sending capacity is a function of mailboxes and their limits, which is related to but not the same as your plan limits.`,
  },
  {
    slug: "upgrade-downgrade",
    title: "Upgrading or changing your plan",
    description: "Change plan and understand what applies immediately.",
    category: "billing",
    updated: UPDATED,
    keywords: ["upgrade", "change plan", "downgrade", "more mailboxes"],
    related: ["plans-and-invoices", "cancel-downgrade-refunds", "billing-usage"],
    content: `## Steps
1. **Settings → Billing**.
2. Choose the plan you want and confirm.
3. New limits and features apply as soon as the change takes effect.

## Important notes
- If a downgrade would put you over a limit — more mailboxes than the smaller plan allows, for instance — reduce usage first.
- Upgrading mid-cycle is normally prorated; the checkout shows what you will be charged before you confirm.`,
  },
  {
    slug: "cancel-downgrade-refunds",
    title: "Cancelling, downgrading and refunds",
    description: "How to stop billing and what happens to your data.",
    category: "billing",
    updated: UPDATED,
    popular: true,
    keywords: ["cancel", "refund", "stop billing", "downgrade", "end subscription"],
    related: ["subscription-statuses", "export-workspace-data", "delete-account", "upgrade-downgrade"],
    content: `## Cancelling
Cancel from **Settings → Billing**. The subscription stays usable until the end of the paid period, then moves to Cancelled or Expired.

## Before you cancel
1. Pause active campaigns so nothing sends unattended.
2. Export the leads and analytics you want to keep.
3. Note that cancelling billing is not the same as deleting your account or data.

## Refunds
Refunds are handled case by case. Contact support with your workspace and the invoice in question.

## Important notes
Cancelling does not remove your data. If you want it deleted, use the account deletion flow explicitly.`,
  },
  {
    slug: "payment-issues",
    title: "Payment failed or card declined",
    description: "Restore a past-due subscription.",
    category: "billing",
    updated: UPDATED,
    keywords: ["payment failed", "declined", "past due", "card", "billing error"],
    related: ["subscription-statuses", "plans-and-invoices", "upgrade-downgrade"],
    content: `## Problem
Billing shows Payment failed or Past due, and features are restricted.

## Possible causes
- The card expired or was replaced
- Insufficient funds, or the bank declined a recurring charge
- The billing address or country does not match the card
- Additional bank authentication was required and not completed

## How to check
1. **Settings → Billing** — read the exact state and the failure message.
2. Check your bank or card statement for a declined attempt.

## How to fix
- Update the payment method and retry the charge from Settings → Billing.
- Complete any authentication step your bank prompts for.
- If the card is fine and the charge still fails, contact support with the date and amount.

## Important notes
Campaigns may be restricted while past due. Resolve it promptly rather than letting a sequence stall mid-flight.`,
  },
];
