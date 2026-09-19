import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const TROUBLESHOOTING_ARTICLES: HelpArticle[] = [
  {
    slug: "troubleshooting-start-here",
    title: "Troubleshooting: start here",
    description: "A short triage list that resolves most problems.",
    category: "troubleshooting",
    updated: UPDATED,
    popular: true,
    keywords: ["troubleshooting", "not working", "problem", "help", "broken"],
    related: ["campaign-not-sending", "inbox-missing-replies", "mailbox-troubleshooting", "contact-support"],
    content: `Work through these before anything else. They account for most support tickets.

1. **Is at least one mailbox Active?** Open Email Accounts and check its current status.
2. **Is it inside the sending window right now,** in the campaign's timezone?
3. **Has the daily limit already been used?** Check the mailbox limit popover.
4. **Is the campaign actually Active,** not Draft, Paused or Completed?
5. **Are the remaining recipients eligible,** or suppressed and stopped?

## Important notes
Most "nothing is happening" reports are a closed sending window or no Active mailbox. Check those two first, every time.`,
  },
  {
    slug: "campaign-not-sending",
    title: "Campaign is active but nothing is sending",
    description: "Diagnose an active campaign with no outgoing mail.",
    category: "troubleshooting",
    updated: UPDATED,
    popular: true,
    keywords: ["not sending", "no emails", "stuck", "active", "queue not moving"],
    related: ["why-campaign-not-sending", "sending-window", "campaign-queue", "mailbox-troubleshooting"],
    content: `## Problem
The campaign shows Active and the queue has scheduled messages, but nothing goes out.

## Possible causes
- Outside the sending window
- Daily or hourly limits already consumed for the period
- All assigned mailboxes are warming, paused or in error
- No mailbox assigned
- Every assigned mailbox requires attention
- Every remaining recipient is suppressed or stopped

## How to check
1. Current time versus the window, in the campaign's timezone.
2. Campaign → **Queue**: counts by status and the scheduled times.
3. Campaign → **Email Accounts**: at least one Active mailbox.
4. Email Accounts page: Errors and Alerts tiles.

## How to fix
Open the window, fix or add mailboxes, or accept that limits are pacing you.

## When to contact support
Window open, mailboxes Active, queue full, nothing sent for hours.`,
  },
  {
    slug: "campaign-launch-failed",
    title: "Campaign launch failed or the button is stuck",
    description: "Launch errors and how to recover safely.",
    category: "troubleshooting",
    updated: UPDATED,
    keywords: ["launch failed", "cannot launch", "error launching", "stuck loading"],
    related: ["launch-readiness", "large-campaigns", "campaign-not-sending", "campaign-statuses"],
    content: `## Problem
Launch shows an error, or the button stays in a loading state.

## Possible causes
- A readiness requirement is not met — no mailbox, no eligible leads, missing subject or body
- The audience is very large and is still being queued in batches
- A transient network interruption during launch

## How to check
1. Read the readiness bar on the campaign's **Overview**; it names what is blocking you.
2. Open the **Queue** tab — if scheduled messages are appearing, queueing is working.
3. Refresh the page and re-check the campaign's status.

## How to fix
- Resolve every readiness item and launch again.
- For a large audience, let queueing finish; it runs in batches and resumes rather than starting over.
- Launching again after a partial launch is safe: recipients already queued are not duplicated.

## When to contact support
The readiness bar is clear, no messages appear in the queue, and launch errors repeatedly.`,
  },
  {
    slug: "leads-not-importing",
    title: "Leads are not importing",
    description: "The import finishes with skipped rows or fails outright.",
    category: "troubleshooting",
    updated: UPDATED,
    keywords: ["import failed", "csv error", "skipped rows", "leads missing"],
    related: ["why-import-skipped-rows", "csv-import-guide", "csv-column-mapping", "duplicate-leads"],
    content: `## Problem
Rows are skipped, the file is rejected, or the leads land somewhere you did not expect.

## Possible causes
- No email column mapped, or the email column contains invalid values
- Duplicates of leads that already exist in the workspace
- Suppressed addresses, which are never re-imported
- More than 10,000 rows in one file
- The file is not valid CSV, or uses an unusual encoding or delimiter
- A different list was selected in the import wizard than the folder you opened

## How to check
1. Re-run the wizard and read the **Review** step; it reports what will be skipped and why.
2. Open the CSV in a plain text editor and check the header row and delimiter.
3. Confirm the destination list shown in the wizard is the one you intended.

## How to fix
- Map the email column explicitly, and clean invalid addresses first.
- Split files larger than 10,000 rows.
- Re-save the file as UTF-8 CSV.
- Choose the correct destination list before uploading.

## When to contact support
A clean, correctly mapped file under the row limit fails with no reason given.`,
  },
  {
    slug: "emails-going-to-spam-quickfix",
    title: "Emails suddenly going to spam",
    description: "Immediate actions when placement collapses.",
    category: "troubleshooting",
    updated: UPDATED,
    keywords: ["spam", "placement dropped", "junk folder", "suddenly"],
    related: ["spam-placement-first-checks", "deliverability-basics", "reduce-bounce-rate", "warmup-best-practices"],
    content: `## Immediate actions
1. Pause the campaign. Continuing to send makes it worse.
2. Check Email Accounts for mailbox errors or health warnings.
3. Look at bounce and complaint rates for the last few days.
4. Cut daily volume per mailbox roughly in half before resuming.

## Then
- Clean the list and remove everything that bounced.
- Simplify the first email: one idea, one link at most, no attachments.
- Let warmup run at the reduced volume for a week before ramping again.

## Important notes
Placement recovers slowly. There is no switch that restores it; consistent, low-volume, well-received sending is the only route back.`,
  },
  {
    slug: "cannot-sign-in",
    title: "Cannot sign in",
    description: "Access problems and how to recover your account.",
    category: "troubleshooting",
    updated: UPDATED,
    keywords: ["sign in", "login", "password reset", "locked out", "cannot access"],
    related: ["password-management", "account-security", "team-roles-and-visibility"],
    content: `## Problem
Sign-in fails, or you land in the wrong workspace.

## Possible causes
- Wrong password, or an old one after a reset
- Signing in with a different email than the invited one
- Your workspace access was removed or changed by an owner
- The reset email is in spam

## How to check
1. Confirm the exact email address you were invited with.
2. Search your spam folder for the reset message.
3. Ask a workspace owner whether your access still exists.

## How to fix
- Use the password reset flow and set a new password.
- Sign in with the invited address, not a personal alias.
- Have an owner re-invite you if access was removed.

## When to contact support
Reset emails never arrive at an address you control.`,
  },
  {
    slug: "contact-support",
    title: "Contacting support",
    description: "What to include so the first reply is useful.",
    category: "troubleshooting",
    updated: UPDATED,
    keywords: ["support", "contact", "help", "report a problem", "ticket"],
    related: ["troubleshooting-start-here", "campaign-not-sending", "api-troubleshooting"],
    content: `Include all of this and you will usually get an answer in one round trip:

- What you expected and what happened instead
- The campaign name, and the domain or mailbox involved
- The exact error text, copied rather than described
- When it started, with a rough time and your timezone
- What you already checked from the troubleshooting steps
- A screenshot of the screen showing the problem

## Please do not send
API keys, passwords, or provider credentials. Support never needs them, and any secret shared in a ticket should be rotated afterwards.`,
  },
];
