import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const DOMAIN_ARTICLES: HelpArticle[] = [
  {
    slug: "why-domain-verification-matters",
    title: "Why domain verification matters",
    description: "What verification proves and why nothing sends without it.",
    category: "domains",
    updated: UPDATED,
    keywords: ["domain verification", "why verify", "authentication", "ownership"],
    related: ["verify-a-domain", "spf-dkim-dmarc", "deliverability-basics"],
    content: `## Short answer
Verification proves you control the domain and that receiving servers can authenticate mail sent on its behalf. Without it, your mail is unauthenticated — which today means filtered or rejected.

## What verification covers
- Ownership of the domain
- SPF, so receivers know the sending infrastructure is authorised
- DKIM, so messages carry a signature that survives transit
- DMARC, so receivers know what to do when something fails
- Receiving records, so replies reach your unified inbox
- Optionally, a tracking domain

## Important notes
A mailbox cannot be created on an unverified domain, and a domain that loses a record drops out of Ready to send. That is a guard, not an inconvenience: sending unauthenticated mail from a cold domain is the fastest way to burn it.`,
  },
  {
    slug: "verify-a-domain",
    title: "How to verify a sending domain",
    description: "Add a domain, publish its records and get to Ready to send.",
    category: "domains",
    updated: UPDATED,
    popular: true,
    gettingStarted: true,
    keywords: ["add domain", "verify domain", "dns setup", "ready to send", "sending domain"],
    related: ["how-to-check-dns", "spf-dkim-dmarc", "domain-verification-troubleshooting", "dns-propagation"],
    content: `## Steps
1. Go to **Email Accounts** → the **Your domains** panel → **Add domain**.
2. Enter the domain, for example \`outreach.yourcompany.com\`. You can note your DNS host too.
3. Open **DNS records** on the new domain row.
4. Publish every record shown at your DNS provider, exactly as displayed — record type, host and value.
5. Click **Check DNS**, then **Verify domain**.
6. Watch the setup steps: Add your domain, Publish DNS records, SPF, DKIM, DNS verified, Domain verification, Ready to send.

## Domain stages you will see
Pending DNS, Checking, DNS verified, Verifying domain, Ready to send, DNS error, Verification failed, Disabled.

## Important notes
- Use a dedicated outreach domain or subdomain, not your main corporate domain.
- DNS changes are not instant. If a check fails immediately after publishing, wait and click **Check again**.
- Records marked Optional are not required to send, but tracking and inbound features depend on them.

## Common problems
- **Record shows Pending forever** — your provider appended the domain to the host, producing something like \`selector._domainkey.example.com.example.com\`.
- **SPF verified, DKIM failed** — the DKIM value was truncated on paste; re-copy the whole string.`,
  },
  {
    slug: "spf-dkim-dmarc",
    title: "SPF, DKIM and DMARC explained",
    description: "What each record does, in plain language, and what MunchReach needs.",
    category: "domains",
    updated: UPDATED,
    popular: true,
    keywords: ["spf", "dkim", "dmarc", "authentication", "txt record", "alignment"],
    related: ["verify-a-domain", "how-to-check-dns", "dns-troubleshooting", "deliverability-basics"],
    content: `## SPF
A TXT record listing who may send mail for your domain. Receivers check the sending source against it. If MunchReach's sending infrastructure is not included, your mail fails SPF.

Keep exactly one SPF record per domain. Two SPF records is a hard failure, not a redundancy.

## DKIM
A cryptographic signature added to every message, with the public key published as a DNS record. It proves the message was not altered in transit and genuinely came from your domain.

## DMARC
A TXT record telling receivers what to do when SPF and DKIM fail, and where to send reports. Start with monitoring (\`p=none\`) while you confirm everything passes, then tighten to quarantine or reject.

## What MunchReach shows you
The DNS records dialog lists exactly the records to publish, with their type, host, value, priority and TTL, and a status of Pending, Verified or Failed for each.

## Important notes
- All three must pass before a domain reaches Ready to send.
- Changing your DNS later — switching providers, tidying records — can silently break authentication. Re-check the domain after any DNS work.`,
    faqs: [
      {
        q: "Can I keep my existing SPF record?",
        a: "Yes, but it must include the value MunchReach shows. Merge into your one SPF record rather than adding a second.",
      },
      {
        q: "Should I set DMARC to reject straight away?",
        a: "No. Start with p=none, confirm SPF and DKIM pass for all your mail, then tighten.",
      },
    ],
  },
  {
    slug: "how-to-check-dns",
    title: "How to check your DNS records",
    description: "Use the built-in check and verify independently.",
    category: "domains",
    updated: UPDATED,
    keywords: ["check dns", "dns lookup", "dig", "nslookup", "verify records"],
    related: ["verify-a-domain", "dns-propagation", "dns-troubleshooting"],
    content: `## In MunchReach
1. Email Accounts → the domain row → **DNS records**.
2. Click **Check DNS**. Each record shows Pending, Verified or Failed.
3. Click **Verify domain**, then **Check again** after any change.

The records table shows Record, Type, Host / name, Value / target, Priority, TTL, Purpose and Status, so you can compare against your provider line by line.

## Independently
From a terminal:
- \`dig TXT yourdomain.com\` for SPF
- \`dig TXT selector._domainkey.yourdomain.com\` for DKIM
- \`dig TXT _dmarc.yourdomain.com\` for DMARC
- \`dig MX yourdomain.com\` for receiving

## Important notes
Compare character by character. Most failures are a truncated value, a trailing space, or the domain accidentally appended to the host.`,
  },
  {
    slug: "dns-propagation",
    title: "DNS propagation",
    description: "Why a record you just published is not visible yet.",
    category: "domains",
    updated: UPDATED,
    keywords: ["propagation", "ttl", "not visible", "how long", "cache"],
    related: ["how-to-check-dns", "verify-a-domain", "domain-verification-troubleshooting"],
    content: `## Short answer
Usually minutes, sometimes hours. TTL on the old record decides how long caches hold the previous answer.

## What to do
1. Publish the record.
2. Wait — checking every thirty seconds does not speed anything up and can cache a negative answer.
3. Re-run **Check DNS** after 15–30 minutes, then hourly.

## Important notes
- A record that has not appeared after 24 hours is wrong, not slow. Re-read the host field.
- Lowering TTL before a planned change makes future changes propagate faster.`,
  },
  {
    slug: "tracking-domains",
    title: "Tracking domains",
    description: "What a tracking domain does and how to set one up.",
    category: "domains",
    updated: UPDATED,
    keywords: ["tracking domain", "custom tracking", "click tracking", "open tracking", "cname"],
    related: ["tracking-not-working", "verify-a-domain", "reading-analytics"],
    content: `Open and click tracking work by routing through a tracking host. Using your own domain for that keeps links on your brand instead of a shared host.

## Steps
1. Email Accounts → the domain row → **DNS records**.
2. Find the **Tracking** section and publish the record shown.
3. Click **Verify DNS** in that section.

## Important notes
- Tracking is optional. Campaigns send without it; you simply lose open and click data.
- Open tracking is inherently unreliable — mail clients that block images never register an open. Treat replies as the real signal.
- Every tracked link adds a redirect. On a cold first email, fewer links is better.

## Common problems
- **Tracking stays unverified** — the CNAME points at the wrong target, or your provider added the domain to the host twice.`,
  },
  {
    slug: "domain-receiving-setup",
    title: "Setting up receiving so replies reach your inbox",
    description: "MX records, readiness checks and enabling receiving.",
    category: "domains",
    updated: UPDATED,
    keywords: ["mx", "receiving", "inbound", "replies not arriving", "enable receiving"],
    related: ["inbox-missing-replies", "verify-a-domain", "how-to-check-dns"],
    content: `Replies only reach the unified inbox if the domain is set up to receive.

## Steps
1. Email Accounts → the domain row → **DNS records**.
2. In the readiness panel, click **Check DNS**.
3. If an MX conflict is shown, compare **Current MX** with **Required MX** and update your DNS.
4. Click **Enable receiving**.

## Important notes
- MX changes affect all mail for that domain. This is one more reason to use a dedicated outreach domain rather than the domain your team's mailboxes use.
- Sending can work while receiving is misconfigured — which is exactly how people end up with a campaign that appears to get no replies.`,
  },
  {
    slug: "domain-verification-troubleshooting",
    title: "Domain verification troubleshooting",
    description: "Verification fails or the domain drops out of Ready to send.",
    category: "domains",
    updated: UPDATED,
    popular: true,
    keywords: ["verification failed", "dns error", "domain not verified", "stuck pending"],
    related: ["dns-troubleshooting", "verify-a-domain", "spf-dkim-dmarc", "mailbox-troubleshooting"],
    content: `## Problem
The domain shows DNS error or Verification failed, or it was Ready to send and no longer is.

## Possible causes
- A record was edited, replaced or removed at the DNS provider
- Two SPF records now exist on the domain
- The DKIM value was truncated when pasted
- The provider appended the domain name to the host field
- A proxy or CDN setting is intercepting the record
- The change is genuinely still propagating

## How to check
1. Open **DNS records** and read the per-record status.
2. Look up each failing record yourself with \`dig\` and compare exactly.
3. Check whether anyone changed DNS recently — a domain that was verified and is not now almost always means an edit.

## How to fix
- Republish the failing record precisely as shown, with nothing appended to the host.
- Merge multiple SPF records into one.
- Re-copy long DKIM values in full.
- Wait for propagation, then **Check again**.

## When to contact support
Every record resolves correctly in an independent lookup but MunchReach still reports Failed after a fresh check.`,
  },
  {
    slug: "dns-troubleshooting",
    title: "DNS records not detected",
    description: "The record exists at your provider but MunchReach cannot see it.",
    category: "domains",
    updated: UPDATED,
    keywords: ["dns not detected", "record not found", "cannot find record", "pending"],
    related: ["domain-verification-troubleshooting", "how-to-check-dns", "dns-propagation"],
    content: `## Problem
Your DNS provider shows the record, MunchReach shows Pending or Failed.

## Possible causes
- **Host duplication.** Many providers add the domain automatically. Entering \`selector._domainkey.example.com\` produces \`selector._domainkey.example.com.example.com\`. Enter only the sub-part.
- **Wrong record type.** SPF, DKIM and DMARC are TXT; tracking is CNAME; receiving is MX.
- **Quoting.** Some providers require quotes around TXT values, some add them for you. Doubled quotes break the value.
- **Proxying.** A CDN proxy on a CNAME will not resolve as required.
- **Wrong zone.** The record went on the apex when it belongs on the subdomain, or vice versa.

## How to check
Run an independent lookup and read what actually resolves, not what the provider's form shows.

## How to fix
Correct the host or value, wait for propagation, then **Check DNS** and **Verify domain**.`,
  },
];
