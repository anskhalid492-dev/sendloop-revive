import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const EMAIL_ACCOUNT_ARTICLES: HelpArticle[] = [
  {
    slug: "connect-a-mailbox",
    title: "How to connect an email account",
    description: "Connect a mailbox and prepare it for sending.",
    category: "email-accounts",
    updated: UPDATED,
    popular: true,
    gettingStarted: true,
    keywords: ["connect mailbox", "email account", "sending account", "add mailbox", "smtp"],
    related: ["supported-account-types", "mailbox-limits", "mailbox-health"],
    content: `## Short answer
Connect your mailbox from Email Accounts, then confirm its status is Active before assigning it to a campaign.

## Steps
1. Go to **Email Accounts**.
2. Click **Connect email account**.
3. Follow the connection steps shown for your mailbox.
4. Enter the **Sender name** recipients will see when prompted.
5. Set the **Daily limit** and **Hourly limit**.
6. Leave **Start warmup** on unless you have a specific reason not to.
7. Finish the connection and confirm the mailbox appears in Email Accounts.

## Important notes
- The mailbox details page shows any setup action still required before sending.
- Warmup starts immediately and carries very little campaign volume for the first weeks. That is intended.

## Common problems
- **Setup is incomplete** — open the mailbox details and follow the action shown there.
- **Address already exists** — that mailbox is already connected in this workspace.`,
    faqs: [
      {
        q: "Can I connect my existing Gmail or Outlook mailbox?",
        a: "Use the connection options shown under Email Accounts. The available flow depends on the mailbox type supported by your workspace.",
      },
      {
        q: "Do I need SMTP details from my host?",
        a: "Follow the connection steps shown in Email Accounts. The mailbox details page will show whether anything else is required.",
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
    related: ["connect-a-mailbox", "recommended-setup"],
    content: `## What is supported
Use the mailbox connection options shown under **Email Accounts**. MunchReach then shows the mailbox's sending status and any action it needs.

## What is not supported today
- Connecting an existing Google Workspace / Gmail mailbox by OAuth
- Connecting an existing Microsoft 365 / Outlook mailbox by OAuth
- Adding a mailbox with your own SMTP or IMAP credentials

If those flows matter to your setup, tell support — but do not plan around them being available.

## What this means in practice
Connect the mailboxes you plan to use, confirm they are Active, warm them gradually, and assign them to campaigns from the **Email Accounts** tab.

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
If a mailbox has fallen into an error state, open its details, follow the action shown, and re-run the mailbox check.

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
    related: ["mailbox-health", "campaign-not-sending", "bounce-complaint-protection"],
    content: `## Problem
A mailbox shows Error or Paused, or a campaign is skipping it.

## Possible causes
- The mailbox requires setup or attention
- Bounce-rate or complaint-rate protection paused the mailbox
- The daily or hourly limit is already used up for the period
- Warmup auto-paused the mailbox on poor health

## How to check
1. Email Accounts → open the mailbox and read its timeline; the reason is recorded there.
2. Open the mailbox details and read the setup or error action shown.
3. Check the mailbox's Sent today against its Limit.
4. Open Warmup and look at the row's status badge.

## How to fix
- Complete the mailbox action shown, then re-check its status.
- If protection paused the mailbox, clean the list before resuming; resuming into the same list repeats the problem.
- If limits are simply exhausted, nothing is broken. Add mailboxes for more capacity.

## When to contact support
The mailbox shows Error with no setup action, healthy bounce rates and no protection block recorded on its timeline.`,
  },
];
