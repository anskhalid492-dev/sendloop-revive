import type { HelpArticle } from "../types";

/**
 * Long-form answer-engine guides.
 *
 * These articles are written to be quoted directly by search and AI answer
 * engines: a self-contained TL;DR, a snippet-length quick answer, and
 * question-shaped headings whose first sentence answers the question.
 *
 * Every technical claim must match real MunchReach behaviour. Screenshot
 * placeholders use `![alt](placeholder: which screen to capture)`.
 */
const UPDATED = "2026-09-12";

export const GUIDE_ARTICLES: HelpArticle[] = [
  {
    slug: "why-emails-land-in-spam",
    title: "Why are my emails landing in spam?",
    description:
      "The real causes of spam placement in cold outreach, how to diagnose each one in MunchReach, and the order to fix them in.",
    seoTitle: "Why Are My Emails Landing in Spam? (Fix Guide)",
    metaDescription:
      "Cold emails going to spam? Diagnose authentication, reputation, bounce rates and copy in MunchReach — and fix placement in the right order.",
    category: "deliverability",
    updated: UPDATED,
    popular: true,
    keywords: [
      "spam folder",
      "junk folder",
      "emails going to spam",
      "spam placement",
      "spf",
      "dkim",
      "dmarc",
      "sender reputation",
      "blacklist",
      "spam trigger words",
      "domain warmup",
      "engagement rate",
      "inbox placement",
    ],
    related: [
      "mailbox-rotation-explained",
      "custom-tracking-domain-setup",
      "spf-dkim-dmarc",
      "reduce-bounce-rate",
    ],
    tldr: [
      "Emails land in spam for five reasons: failing authentication (SPF, DKIM, DMARC), a domain or mailbox that is too new for the volume, high bounce or complaint rates, low engagement, and spammy copy.",
      "Fix authentication first. Until SPF, DKIM and DMARC all show **Verified** on your domain in MunchReach, nothing else you change will move placement.",
      "Keep hard bounces under 2% and spam complaints under 0.1%. MunchReach automatically pauses a campaign or mailbox once bounces pass 8% or complaints pass 0.5% over a rolling 24 hours.",
      "Volume pattern matters more than volume: send modest amounts per mailbox, let warmup run, and add mailboxes to scale instead of raising one mailbox's limit.",
      "Replies are the strongest positive signal you control. One link, no images and a short, specific first email beats a polished template.",
    ],
    quickAnswer:
      "Your emails are landing in spam because receiving servers do not yet trust the combination of your domain, your mailbox and your sending pattern. In practice that is almost always one of five things: SPF, DKIM or DMARC is failing; the domain or mailbox is too new for the volume being sent; bounce or spam-complaint rates are elevated; recipients are ignoring or deleting your mail; or the copy is templated, link-heavy and image-heavy. Fix them in that order — authentication first, list quality second, volume and copy third — and placement recovers over days, not minutes.",
    content: `Spam placement is not a mystery and it is rarely one big mistake. It is a trust score, and every cause below moves it in a predictable direction.

Delivery and placement are also not the same thing. A message can be accepted by the receiving server, counted as delivered in your [analytics](/help-center/metric-definitions), and still be filed in spam.

## What causes emails to land in spam?

Emails land in spam when the receiving mail server accepts the message but decides it does not trust the sender enough to show it. Filters weigh six signals:

- **Authentication** — SPF, DKIM and DMARC must pass and align with your sending domain.
- **Domain and mailbox reputation** — built slowly by real sending history, lost quickly.
- **List quality** — invalid addresses, spam traps and stale contacts produce bounces and complaints.
- **Engagement rate** — replies and opens weighed against deletions, "mark as spam" and ignores.
- **Volume pattern** — steady and modest beats spiky. A cold mailbox jumping to hundreds of sends a day is the classic trigger.
- **Content** — link count, images, attachments, tracking, and how obviously templated it reads.

No single signal decides placement. A well-authenticated domain with a 12% bounce rate still lands in spam, and a spotless list on an unauthenticated domain does too.

### Which cause is most common in cold outreach?

Authentication and list quality, in that order. Most "the tool has a deliverability problem" reports turn out to be a partially failing DKIM record or a purchased list that was never verified.

## How do I check whether SPF, DKIM and DMARC are passing?

Open **Email Accounts** → your domain row → **DNS records**, then click **Check DNS**. Every record shows **Pending**, **Verified** or **Failed**, and the domain only reaches **Ready to send** when authentication passes.

![Placeholder for the MunchReach DNS records dialog showing SPF, DKIM and DMARC rows each with a Verified status badge](placeholder: Email Accounts → domain row → DNS records dialog, with SPF, DKIM and DMARC verified)

You can confirm independently from a terminal:

- \`dig TXT yourdomain.com\` — your single SPF record
- \`dig TXT selector._domainkey.yourdomain.com\` — DKIM
- \`dig TXT _dmarc.yourdomain.com\` — DMARC

### What breaks authentication most often?

Three things, in order:

1. **Two SPF records.** More than one SPF record on a domain is a hard failure, not redundancy. Merge them into one.
2. **A truncated DKIM value.** The key is long and paste often clips it. Re-copy the whole string.
3. **The domain appended twice.** Some DNS hosts add the domain for you, producing \`selector._domainkey.example.com.example.com\`.

If you changed DNS providers or tidied records recently, re-check the domain — authentication breaks silently. Full detail lives in [SPF, DKIM and DMARC explained](/help-center/spf-dkim-dmarc).

## Is my domain or mailbox too new for the volume I am sending?

Probably, if the domain is under a month old or the mailbox has not completed warmup. A brand-new domain has no reputation at all, so filters default to suspicion and watch how you behave.

What to do:

- Leave **warmup** running on every new mailbox and check its health band in **Warmup**.
- Keep each mailbox's **Daily limit** modest — the default of 50 exists for a reason.
- Scale by adding mailboxes, not by raising one mailbox's limit. See [how mailbox rotation distributes volume](/help-center/mailbox-rotation-explained).
- Use a dedicated outreach domain or subdomain, never your main corporate domain.

### Does a pause in sending hurt reputation?

A short pause does not hurt. Erratic sending does: 400 emails on Monday, nothing for a week, then 600 on Tuesday reads as a burst pattern. Consistency is the signal.

## Are bounces and spam complaints dragging my placement down?

Yes, faster than anything else on this list. Bounces tell the receiver you are mailing addresses you never verified, and complaints tell it recipients do not want your mail.

Targets to hold:

- **Hard bounces:** under 2%
- **Spam complaints:** under 0.1%
- **Unsubscribes:** watch the trend rather than a threshold

MunchReach has a hard safety net on top of those targets. Once a campaign or mailbox exceeds **8% bounces** or **0.5% complaints** across a rolling 24 hours — measured after at least 20 sends — it is paused automatically, with the reason recorded and the workspace notified. If you see a campaign paused with a deliverability reason, that guard fired.

### How do I bring bounce rate down?

1. Verify the list before importing it, and answer **Is this list verified?** honestly during import.
2. Remove everything that has already bounced; a hard bounce never becomes valid later.
3. Drop role addresses (\`info@\`, \`sales@\`, \`support@\`) and anything older than about 12 months.
4. Re-launch at lower volume once the list is clean.

More detail: [reducing your bounce rate](/help-center/reduce-bounce-rate).

## Does my email copy trigger spam filters?

Copy alone rarely sends a well-authenticated email to spam, but it decides borderline cases — and cold first-touch emails are usually borderline. Filters and recipients react to the same things.

For a first email:

- **One link maximum.** Zero is fine.
- **No images, no attachments, no tracking pixels you do not need.**
- **Short.** Under 120 words reads human; a formatted layout reads like marketing.
- **Specific.** A real reason for contacting this person outperforms any subject-line trick.
- **Plain formatting.** Skip coloured buttons, big headers and multi-column HTML.

### Do "spam trigger words" still matter?

Barely, and far less than people believe. Modern filters score behaviour and reputation, not a banned-word list. Writing "free" or "guarantee" will not send a trusted sender to spam — but a message stacked with urgency, capitals and exclamation marks correlates with everything else filters dislike, so restraint still pays.

### Does open and click tracking hurt placement?

Slightly. Tracking adds an image pixel and rewrites links through a redirect, and a redirect on an unrecognised host looks worse than a link to your own domain. Two mitigations: run tracking on your own [custom tracking domain](/help-center/custom-tracking-domain-setup), and consider sending the first email untracked, treating replies as the real signal.

## Am I on a blacklist?

Possibly, and it is worth ruling out — but blacklisting is a symptom, not the root cause. Domains and sending IPs get listed after sustained bounces, complaints or spam-trap hits, so the fix is always the underlying behaviour.

Check your domain and sending IP against a public list checker such as MXToolbox. If you are listed:

1. Stop sending from the affected domain immediately.
2. Clean the list and repair authentication.
3. Follow the list's own delisting request process.
4. Resume at very low volume, and expect weeks rather than days.

## How do I fix spam placement, step by step?

Work in this order. Skipping ahead wastes the effort you spend later.

1. **Repair authentication.** Get SPF, DKIM and DMARC to **Verified** and the domain to **Ready to send**.
2. **Clean the list.** Remove bounces, role addresses and unverified imports.
3. **Cut volume per mailbox** and widen the sending window so sends spread out.
4. **Let warmup run longer** before pushing volume back up.
5. **Rewrite the first email** — one link, no images, under 120 words, specific.
6. **Add mailboxes** rather than raising limits when you need more volume.
7. **Re-test placement** by sending yourself a message at two or three different mail providers.
8. **Watch replies, not opens.** Opens are unreliable in both directions; replies are the honest measure.

![Placeholder for the MunchReach Analytics page showing bounce rate, reply rate and unsubscribe rate for a campaign](placeholder: Analytics page for a single campaign, showing bounce rate, reply rate and unsubscribe trend)

### How long does recovery take?

Usually one to three weeks of clean, modest, consistent sending. Reputation is earned back at the same slow rate it was built, and there is no reset button — which is also why a burned domain is often cheaper to replace than to rehabilitate.

## When should I contact support?

Contact support when authentication is fully verified, your bounce rate is low, mailboxes are warm and inside their limits, volume is modest, and mail still lands in spam consistently across several providers. Include the campaign name, the affected mailbox and where your test messages landed — that is enough to investigate the sending path.`,
    faqs: [
      {
        q: "Is Gmail's Promotions tab the same as spam?",
        a: "No. Promotions is still the inbox and the message was delivered, but plain-text-style formatting, fewer links and no images all push a cold email towards the Primary tab.",
      },
      {
        q: "Will sending fewer emails per day on its own fix spam placement?",
        a: "Only if volume was the problem. Lower volume from a domain with failing SPF or DKIM still lands in spam, so verify authentication before you touch limits.",
      },
      {
        q: "Should I use a separate domain for cold outreach?",
        a: "Yes. Use a dedicated domain or subdomain so that a reputation problem never reaches the domain your invoices, contracts and support email depend on.",
      },
      {
        q: "Does one spam complaint matter?",
        a: "One does not, but the rate does. Complaints above roughly 0.1% of sends are damaging, and MunchReach automatically pauses sending once complaints pass 0.5% over a rolling 24-hour window.",
      },
      {
        q: "Can I test where my email lands before launching a campaign?",
        a: "Send yourself the exact email at two or three providers — one consumer address and one business address — and check the inbox, Promotions and spam folders in each. Placement varies by provider, so a single test address proves little.",
      },
      {
        q: "Why did placement drop suddenly on a campaign that used to work?",
        a: "The usual causes are a DNS change that broke authentication, a newly imported unverified list, or a volume jump. Check the DNS records dialog first, then the bounce rate for the exact days placement fell.",
      },
    ],
  },
];
