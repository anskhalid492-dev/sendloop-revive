import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const EMAIL_ACCOUNT_ARTICLES: HelpArticle[] = [
  {
    slug: "connect-a-mailbox",
    title: "How to connect an email account",
    description: "Create a sending mailbox on a verified domain — no credentials to paste.",
    category: "email-accounts",
    updated: UPDATED,
    popular: true,
    gettingStarted: true,
    keywords: ["connect mailbox", "email account", "sending account", "add mailbox", "smtp"],
    related: ["supported-account-types", "verify-a-domain", "mailbox-limits", "mailbox-health"],
    content: `## Short answer
Verify your domain first, then create the mailbox in MunchReach. There are no server settings, passwords or API keys to enter.

## Steps
1. Go to **Email Accounts**.
2. Click **Connect email account** (or **Connect mailbox** on a domain row).
3. Choose the **Verified domain**. Only domains that reached Ready to send appear here.
4. Enter the **Mailbox address** — the part before the @ — and the **Sender name** recipients will see.
5. Set the **Daily limit** (default 50) and the **Hourly limit** (default 20).
6. Leave **Start warmup** on unless you have a specific reason not to.
7. Click **Connect mailbox**.

## Important notes
- MunchReach runs the sending infrastructure for you, which is why there is nothing to configure and no keys to paste.
- A mailbox cannot be created on a domain that has not passed verification. If your domain is not in the picker, finish its DNS setup first.
- Warmup starts immediately and carries very little campaign volume for the first weeks. That is intended.

## Common problems
- **The domain picker is empty** — no domain has reached Ready to send yet.
- **Address already exists** — that mailbox is already connected in this workspace.`,
    faqs: [
      {
        q: "Can I connect my existing Gmail or Outlook mailbox?",
        a: "No. MunchReach creates sending mailboxes on domains you verify inside the platform; there is no Google or Microsoft mailbox connection flow. Use a dedicated outreach domain and create mailboxes on it.",
      },
      {
        q: "Do I need SMTP details from my host?",
        a: "No. Sending and receiving are handled by MunchReach's infrastructure once your domain's DNS records are published and verified.",
      },
    ],
  },
  {
    slug: "supported-account-types",
    title: "Supported email account types",
    description: "What kind of sending accounts MunchReach supports today.",
    category: "email-accounts",
    updated: UPDATED,
    keywords: ["supported", "gmail", "google workspace", "outlook", "microsoft", "oauth", "imap"],
    related: ["connect-a-mailbox", "verify-a-domain", "recommended-setup"],
    content: `## What is supported
Mailboxes created inside MunchReach on a sending domain you have verified. MunchReach handles sending and inbound receiving for those mailboxes.

## What is not supported today
- Connecting an existing Google Workspace / Gmail mailbox by OAuth
- Connecting an existing Microsoft 365 / Outlook mailbox by OAuth
- Adding a mailbox with your own SMTP or IMAP credentials

If those flows matter to your setup, tell support — but do not plan around them being available.

## What this means in practice
Buy or reuse a domain for outreach, point its DNS at the records MunchReach shows you, verify it, and create two to four mailboxes on it. Replies to those mailboxes arrive in the unified inbox.

## Important notes
Keeping outreach on a separate domain also protects your main corporate domain if reputation suffers.`,
  },
  {
    slug: "mailbox-limits",
    title: "Mailbox sending limits",
    description: "Set a daily and hourly limit per mailbox and change it later.",
    category: "email-accounts",
    updated: UPDATED,
    keywords: ["daily limit", "hourly limit", "mailbox cap", "volume per mailbox"],
    related: ["sending-limits", "mailbox-health", "select-mailboxes", "throughput-estimate"],
    content: `Each mailbox carries its own limits, shared across every campaign it sends for.

## Steps
1. Go to **Email Accounts**.
2. Click the daily limit on the mailbox row to open **Daily sending limit**.
3. Enter the **New limit (emails/day)**. The popover shows Limit, Sent today and Remaining.
4. Save.

Hourly limit is set when you connect the mailbox and can be adjusted from the account detail.

## Recommended values
30 to 50 campaign emails a day for a warm mailbox on a healthy domain. Scale by adding mailboxes, not by raising one mailbox's limit.

## Important notes
- The daily limit maximum is 2000, but using anything close to it on cold outreach is a reputation risk, not a feature.
- Campaign limits and mailbox limits both apply — the tighter one wins.
- The Email Accounts page shows a **Daily sending capacity** bar for the whole workspace.`,
  },
  {
    slug: "mailbox-health",
    title: "Checking mailbox health and status",
    description: "What each status and health band means, and what to do about it.",
    category: "email-accounts",
    updated: UPDATED,
    popular: true,
    keywords: ["health", "status", "active", "warming", "paused", "error", "needs attention"],
    related: ["mailbox-troubleshooting", "how-warmup-works", "mailbox-limits", "deliverability-basics"],
    content: `## Statuses
- **Active** — connected, verified and sending
- **Warming** — warmup is ramping this mailbox; campaign volume is limited
- **Paused** — you stopped it
- **Inactive** — not currently usable for sending
- **Error** — something is blocking it; the mailbox is skipped by campaigns

## Health
Each mailbox carries a health score, shown as **good**, **fair** or **poor**. It reflects recent delivery, bounce and complaint behaviour.

## Steps
1. Go to **Email Accounts**.
2. Use the status filter and the warmup filter (All / Warming / Complete / Not started / Needs attention) to find problem mailboxes.
3. Open a mailbox to see its timeline and recent events.

## Important notes
The summary cards at the top of the page show Total Accounts, Total Domains, Warming, Errors and Alerts. If Errors is above zero, fix that before wondering why a campaign is slow.`,
  },
  {
    slug: "assign-mailboxes-to-campaigns",
    title: "Assigning mailboxes to campaigns",
    description: "Control which accounts a campaign sends from.",
    category: "email-accounts",
    updated: UPDATED,
    keywords: ["assign mailbox", "rotation", "which mailbox", "campaign accounts"],
    related: ["select-mailboxes", "mailbox-limits", "throughput-estimate"],
    content: `## Steps
1. Open the campaign → **Email Accounts** tab.
2. Select the mailboxes it may use.
3. Check the Throughput estimate on the Schedule tab for the combined capacity.

## How rotation works
Volume is spread across the selected mailboxes rather than exhausting one at a time, and each mailbox's own daily and hourly limits are respected.

## Important notes
- Mailboxes in an error state are skipped automatically.
- Removing a mailbox mid-campaign re-plans its unsent messages onto the others.`,
  },
  {
    slug: "pause-disconnect-mailbox",
    title: "Pausing, reconnecting and removing a mailbox",
    description: "Take a mailbox out of rotation temporarily or permanently.",
    category: "email-accounts",
    updated: UPDATED,
    keywords: ["pause mailbox", "disconnect", "remove mailbox", "delete account", "reconnect"],
    related: ["mailbox-health", "mailbox-troubleshooting", "assign-mailboxes-to-campaigns"],
    content: `## Pause
Pause a mailbox from the Email Accounts page to take it out of rotation. Campaigns continue on the remaining mailboxes; scheduled messages are re-planned.

## Re-check
If a mailbox has fallen into an error state, fix the underlying cause — usually the domain's DNS — and re-run the checks from the mailbox or the domain row.

## Remove
Removing a mailbox permanently stops it sending and receiving. Replies already threaded in the unified inbox stay there.

## Important notes
Do not remove and recreate a mailbox to "reset" it. Its reputation history goes with it, and the new mailbox starts from zero.`,
  },
  {
    slug: "mailbox-troubleshooting",
    title: "Mailbox troubleshooting",
    description: "A mailbox is not sending, shows an error, or was auto-paused.",
    category: "email-accounts",
    updated: UPDATED,
    keywords: ["mailbox error", "not sending", "disconnected", "auto paused", "authentication failed"],
    related: ["mailbox-health", "domain-verification-troubleshooting", "campaign-not-sending", "bounce-complaint-protection"],
    content: `## Problem
A mailbox shows Error or Paused, or a campaign is skipping it.

## Possible causes
- The sending domain fell out of verification — a DNS record was changed or removed
- Bounce-rate or complaint-rate protection paused the mailbox
- The daily or hourly limit is already used up for the period
- Warmup auto-paused the mailbox on poor health

## How to check
1. Email Accounts → open the mailbox and read its timeline; the reason is recorded there.
2. Open the domain's **DNS records** dialog and click **Check DNS**.
3. Check the mailbox's Sent today against its Limit.
4. Open Warmup and look at the row's status badge.

## How to fix
- Republish any missing DNS record, then click **Verify domain** and re-check.
- If protection paused the mailbox, clean the list before resuming; resuming into the same list repeats the problem.
- If limits are simply exhausted, nothing is broken. Add mailboxes for more capacity.

## When to contact support
The mailbox shows Error with a verified domain, healthy bounce rates and no protection block recorded on its timeline.`,
  },
];
