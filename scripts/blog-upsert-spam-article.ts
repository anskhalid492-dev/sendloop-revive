/**
 * Publishes the "Why are my emails landing in spam?" blog post.
 *
 * Content is authored as HTML (the blog's rich-text format) so it can carry
 * real product screenshots, lists, tables and an FAQ block. Rerunnable: the
 * post is upserted on its slug.
 *
 * Usage: SUPABASE_URL=... SB_SERVICE_ROLE_KEY=... bun run scripts/blog-upsert-spam-article.ts
 */

const url = process.env["SUPABASE_URL"];
const key = process.env["SB_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) throw new Error("SUPABASE_URL and SB_SERVICE_ROLE_KEY are required");
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation,resolution=merge-duplicates",
};

const IMG_DNS = "/api/public/media/blog/2026-09/domain-authentication-statuses.jpg";
const IMG_MAILBOXES = "/api/public/media/blog/2026-09/mailbox-health-sending-limits.jpg";

const content = `
<div class="callout">
<p><strong>TL;DR</strong></p>
<ul>
<li>Emails land in spam for five reasons: failing authentication (SPF, DKIM, DMARC), a domain or mailbox that is too new for the volume, high bounce or complaint rates, low engagement, and spammy copy.</li>
<li>Fix authentication first. Until SPF, DKIM and DMARC all show <strong>Verified</strong> on your domain in MunchReach, nothing else you change will move placement.</li>
<li>Keep hard bounces under 2% and spam complaints under 0.1%. MunchReach automatically pauses a campaign or mailbox once bounces pass 8% or complaints pass 0.5% over a rolling 24 hours.</li>
<li>Volume pattern matters more than volume: send modest amounts per mailbox, let warmup run, and add mailboxes to scale instead of raising one mailbox's limit.</li>
<li>Replies are the strongest positive signal you control. One link, no images and a short, specific first email beats a polished template.</li>
</ul>
</div>

<h2 id="quick-answer">Quick answer</h2>
<p>Your emails are landing in spam because receiving servers do not yet trust the combination of your domain, your mailbox and your sending pattern. In practice that is almost always one of five things: SPF, DKIM or DMARC is failing; the domain or mailbox is too new for the volume being sent; bounce or spam-complaint rates are elevated; recipients are ignoring or deleting your mail; or the copy is templated, link-heavy and image-heavy. Fix them in that order — authentication first, list quality second, volume and copy third — and placement recovers over days, not minutes.</p>

<p>Spam placement is not a mystery and it is rarely one big mistake. It is a trust score, and every cause below moves it in a predictable direction.</p>
<p>Delivery and placement are also not the same thing. A message can be accepted by the receiving server, counted as delivered in your <a href="/help-center/metric-definitions">analytics</a>, and still be filed in spam. Nothing in any sending tool reports placement directly, because receiving providers never tell the sender which folder a message landed in. That is why diagnosis works backwards: you check the signals filters use, in the order they carry weight.</p>

<h2 id="what-causes-emails-to-land-in-spam">What causes emails to land in spam?</h2>
<p>Emails land in spam when the receiving mail server accepts the message but decides it does not trust the sender enough to show it. Filters weigh six signals:</p>
<ul>
<li><strong>Authentication</strong> — SPF, DKIM and DMARC must pass and align with your sending domain.</li>
<li><strong>Domain and mailbox reputation</strong> — built slowly by real sending history, lost quickly.</li>
<li><strong>List quality</strong> — invalid addresses, spam traps and stale contacts produce bounces and complaints.</li>
<li><strong>Engagement rate</strong> — replies and opens weighed against deletions, "mark as spam" and ignores.</li>
<li><strong>Volume pattern</strong> — steady and modest beats spiky. A cold mailbox jumping to hundreds of sends a day is the classic trigger.</li>
<li><strong>Content</strong> — link count, images, attachments, tracking, and how obviously templated it reads.</li>
</ul>
<p>No single signal decides placement. A well-authenticated domain with a 12% bounce rate still lands in spam, and a spotless list on an unauthenticated domain does too.</p>

<h3>Which cause is most common in cold outreach?</h3>
<p>Authentication and list quality, in that order. Most "the tool has a deliverability problem" reports turn out to be a partially failing DKIM record or a purchased list that was never verified.</p>

<h3>How do I narrow it down quickly?</h3>
<p>Answer four questions before changing anything:</p>
<ol>
<li>Does every DNS record show <strong>Verified</strong>, checked today rather than remembered from setup?</li>
<li>What is the campaign's bounce rate over the last seven days?</li>
<li>How old is the domain, and has warmup finished on the mailbox?</li>
<li>Did placement fall on a specific date, or has it always been poor?</li>
</ol>
<p>A sudden drop points to a change — DNS, a new import, a volume jump. Consistently poor placement from day one points to authentication or a domain that is too new.</p>

<h2 id="how-do-i-check-whether-spf-dkim-and-dmarc-are-passing">How do I check whether SPF, DKIM and DMARC are passing?</h2>
<p>Open <strong>Email Accounts</strong> and look at your domain rows. Each domain shows SPF, DKIM and DMARC badges, and only reaches <strong>Ready to send</strong> when all of them pass. Use <strong>DNS records</strong> for the exact values and <strong>Re-check</strong> (or <strong>Verify domain</strong>) to test DNS again.</p>
<figure>
<img src="${IMG_DNS}" alt="MunchReach Email Accounts screen showing two sending domains: go-northwind.com with green SPF, DKIM and DMARC badges and a Ready to send label, and try-northwind.com with a red DKIM badge and a note that DNS changes are still propagating." loading="lazy" />
<figcaption>Two domains in the same workspace: one fully authenticated and ready to send, one with DKIM failing.</figcaption>
</figure>
<p>You can confirm independently from a terminal:</p>
<ul>
<li><code>dig TXT yourdomain.com</code> — your single SPF record</li>
<li><code>dig TXT selector._domainkey.yourdomain.com</code> — DKIM</li>
<li><code>dig TXT _dmarc.yourdomain.com</code> — DMARC</li>
</ul>

<h3>What does each DNS status actually mean?</h3>
<ul>
<li><strong>Pending</strong> — the record has not been found yet. Either it was never added, or DNS has not propagated. Propagation is usually minutes and occasionally up to 48 hours, so re-check after an hour before assuming something is wrong.</li>
<li><strong>Verified</strong> — the record was found and its value matches what MunchReach expects. This is the only status that counts. Verified today does not mean verified next month: DNS edits elsewhere in your account can silently break it.</li>
<li><strong>Failed</strong> — the record exists but its value is wrong, incomplete, or duplicated. A failure is more urgent than a pending record, because it usually means a typo you will not spot by re-reading the dashboard.</li>
</ul>
<p><strong>Ready to send</strong> is a summary of all three, not a fourth record. If it does not appear, one badge beside it is not verified.</p>

<h3>How do I interpret a failure on each specific record?</h3>
<ul>
<li><strong>SPF failed</strong> — most often two SPF records on the same domain, or a lookup limit exceeded because too many services are chained in. A domain is allowed exactly one <code>v=spf1</code> TXT record; merge the include mechanisms into it.</li>
<li><strong>DKIM failed</strong> — nearly always a truncated or wrapped key value, or a host that appended your domain a second time. Compare the first and last 10 characters of the published value against the value shown in MunchReach.</li>
<li><strong>DKIM pending while SPF is verified</strong> — the DKIM record was added at the wrong host name. It must sit at the exact selector shown, not at the root.</li>
<li><strong>DMARC failed</strong> — usually a malformed policy string. Start with <code>v=DMARC1; p=none; rua=mailto:you@yourdomain.com</code>, confirm it verifies, then tighten to <code>p=quarantine</code> once reports look clean.</li>
<li><strong>Everything verified but mail still filed as spam</strong> — authentication is no longer your problem. Move on to list quality and volume; do not keep editing DNS.</li>
</ul>

<h3>What breaks authentication most often?</h3>
<ol>
<li><strong>Two SPF records.</strong> More than one SPF record on a domain is a hard failure, not redundancy. Merge them into one.</li>
<li><strong>A truncated DKIM value.</strong> The key is long and paste often clips it. Re-copy the whole string.</li>
<li><strong>The domain appended twice.</strong> Some DNS hosts add the domain for you, producing <code>selector._domainkey.example.com.example.com</code>.</li>
</ol>
<p>If you changed DNS providers or tidied records recently, re-check the domain — authentication breaks silently. Full detail lives in <a href="/help-center/spf-dkim-dmarc">SPF, DKIM and DMARC explained</a>.</p>

<h2 id="is-my-domain-or-mailbox-too-new">Is my domain or mailbox too new for the volume I am sending?</h2>
<p>Probably, if the domain is under a month old or the mailbox has not completed warmup. A brand-new domain has no reputation at all, so filters default to suspicion and watch how you behave.</p>
<p>What to do:</p>
<ul>
<li>Leave <strong>warmup</strong> running on every new mailbox and check its health band in <strong>Warmup</strong>.</li>
<li>Keep each mailbox's <strong>Daily limit</strong> modest — the default of 50 exists for a reason.</li>
<li>Scale by adding mailboxes, not by raising one mailbox's limit. See <a href="/help-center/sending-limits">how sending limits work</a>.</li>
<li>Use a dedicated outreach domain or subdomain, never your main corporate domain.</li>
</ul>
<figure>
<img src="${IMG_MAILBOXES}" alt="MunchReach mailbox list showing three mailboxes on one domain with sent-today counts against a 50 per day limit, warmup progress, health scores of 96, 92 and 88, and green SPF, DKIM and DMARC authentication badges per mailbox." loading="lazy" />
<figcaption>Volume is spread across three mailboxes rather than pushed through one: each stays inside a 50 per day limit, with warmup and health tracked separately.</figcaption>
</figure>

<h3>Does a pause in sending hurt reputation?</h3>
<p>A short pause does not hurt. Erratic sending does: 400 emails on Monday, nothing for a week, then 600 on Tuesday reads as a burst pattern. Consistency is the signal.</p>

<h3>How do I tell a warmup problem from a reputation problem?</h3>
<p>Warmup problems affect new mailboxes and improve week by week as volume stays flat. Reputation problems affect established mailboxes and follow an event you can date — a bad import, a spike, a broken DNS record. If an older mailbox on the same domain also degraded at the same time, treat it as a domain-level reputation issue and reduce volume across every mailbox on that domain, not just the loudest one.</p>

<h2 id="are-bounces-and-complaints-dragging-placement-down">Are bounces and spam complaints dragging my placement down?</h2>
<p>Yes, faster than anything else on this list. Bounces tell the receiver you are mailing addresses you never verified, and complaints tell it recipients do not want your mail.</p>
<p>Targets to hold:</p>
<ul>
<li><strong>Hard bounces:</strong> under 2%</li>
<li><strong>Spam complaints:</strong> under 0.1%</li>
<li><strong>Unsubscribes:</strong> watch the trend rather than a threshold</li>
</ul>
<p>MunchReach has a hard safety net on top of those targets. Once a campaign or mailbox exceeds <strong>8% bounces</strong> or <strong>0.5% complaints</strong> across a rolling 24 hours — measured after at least 20 sends — it is paused automatically, with the reason recorded and the workspace notified. If you see a campaign paused with a deliverability reason, that guard fired.</p>

<h3>How do I bring bounce rate down?</h3>
<ol>
<li>Verify the list before importing it, and answer <strong>Is this list verified?</strong> honestly during import.</li>
<li>Remove everything that has already bounced; a hard bounce never becomes valid later.</li>
<li>Drop role addresses (<code>info@</code>, <code>sales@</code>, <code>support@</code>) and anything older than about 12 months.</li>
<li>Re-launch at lower volume once the list is clean.</li>
</ol>
<p>More detail: <a href="/help-center/reduce-bounce-rate">reducing your bounce rate</a>.</p>

<h3>What if bounces are concentrated on one provider or domain?</h3>
<p>Group the bounces before reacting. Many bounces at a single recipient domain usually means that company's gateway is blocking you specifically — exclude it and move on. Bounces spread evenly across providers point at the list itself. Bounces that all began on one date point at the import made that day, so remove that batch rather than pruning the whole list.</p>

<h2 id="does-my-copy-trigger-spam-filters">Does my email copy trigger spam filters?</h2>
<p>Copy alone rarely sends a well-authenticated email to spam, but it decides borderline cases — and cold first-touch emails are usually borderline. Filters and recipients react to the same things.</p>
<p>For a first email:</p>
<ul>
<li><strong>One link maximum.</strong> Zero is fine.</li>
<li><strong>No images, no attachments, no tracking pixels you do not need.</strong></li>
<li><strong>Short.</strong> Under 120 words reads human; a formatted layout reads like marketing.</li>
<li><strong>Specific.</strong> A real reason for contacting this person outperforms any subject-line trick.</li>
<li><strong>Plain formatting.</strong> Skip coloured buttons, big headers and multi-column HTML.</li>
</ul>

<h3>Do "spam trigger words" still matter?</h3>
<p>Barely, and far less than people believe. Modern filters score behaviour and reputation, not a banned-word list. Writing "free" or "guarantee" will not send a trusted sender to spam — but a message stacked with urgency, capitals and exclamation marks correlates with everything else filters dislike, so restraint still pays.</p>

<h3>Does open and click tracking hurt placement?</h3>
<p>Slightly. Tracking adds an image pixel and rewrites links through a redirect, and a redirect on an unrecognised host looks worse than a link to your own domain. Two mitigations: run tracking on your own <a href="/help-center/tracking-domains">custom tracking domain</a>, and consider sending the first email untracked, treating replies as the real signal.</p>

<h3>How do I test whether the copy is the cause?</h3>
<p>Isolate one variable. Send the same audience segment two versions from the same warm mailbox on the same day — one as written, one stripped to plain text with no links — and compare reply rate over the following week. If both perform identically, the copy was never the problem and the cause sits upstream in authentication, reputation or list quality.</p>

<h2 id="am-i-on-a-blacklist">Am I on a blacklist?</h2>
<p>Possibly, and it is worth ruling out — but blacklisting is a symptom, not the root cause. Domains and sending IPs get listed after sustained bounces, complaints or spam-trap hits, so the fix is always the underlying behaviour.</p>
<p>Check your domain and sending IP against a public list checker such as MXToolbox. If you are listed:</p>
<ol>
<li>Stop sending from the affected domain immediately.</li>
<li>Clean the list and repair authentication.</li>
<li>Follow the list's own delisting request process.</li>
<li>Resume at very low volume, and expect weeks rather than days.</li>
</ol>

<h2 id="why-only-at-one-provider">Why do my emails land in spam at one provider only?</h2>
<p>Because each provider scores you separately. Placement at Google, Microsoft and smaller business hosts can differ sharply from the same mailbox on the same day.</p>
<ul>
<li><strong>Google only</strong> — usually engagement. Replies are low, deletions are high, or tracking is heavy. Also check the Promotions tab before assuming spam.</li>
<li><strong>Microsoft only</strong> — Outlook and Microsoft 365 weight domain age and volume consistency harder than most. Reduce per-mailbox volume, extend warmup, and be patient; recovery here is slower.</li>
<li><strong>Small business hosts only</strong> — often a strict third-party gateway with its own list. Look for a bounce message naming the filtering service and follow its delisting process.</li>
<li><strong>Every provider</strong> — authentication or list quality. Go back to the domain badges and the bounce rate.</li>
</ul>

<h2 id="how-do-i-fix-spam-placement-step-by-step">How do I fix spam placement, step by step?</h2>
<p>Work in this order. Skipping ahead wastes the effort you spend later.</p>
<ol>
<li><strong>Repair authentication.</strong> Get SPF, DKIM and DMARC to <strong>Verified</strong> and the domain to <strong>Ready to send</strong>.</li>
<li><strong>Clean the list.</strong> Remove bounces, role addresses and unverified imports.</li>
<li><strong>Cut volume per mailbox</strong> and widen the sending window so sends spread out.</li>
<li><strong>Let warmup run longer</strong> before pushing volume back up.</li>
<li><strong>Rewrite the first email</strong> — one link, no images, under 120 words, specific.</li>
<li><strong>Add mailboxes</strong> rather than raising limits when you need more volume.</li>
<li><strong>Re-test placement</strong> by sending yourself a message at two or three different mail providers.</li>
<li><strong>Watch replies, not opens.</strong> Opens are unreliable in both directions; replies are the honest measure.</li>
</ol>
<p>Change one thing at a time and give each change a week. Deliverability moves slowly enough that stacking five simultaneous fixes leaves you unable to tell which one helped.</p>

<h3>How long does recovery take?</h3>
<p>Usually one to three weeks of clean, modest, consistent sending. Reputation is earned back at the same slow rate it was built, and there is no reset button — which is also why a burned domain is often cheaper to replace than to rehabilitate.</p>

<h3>Which numbers should I watch during recovery?</h3>
<p>Reply rate first, bounce rate second, unsubscribe trend third. A recovering domain shows replies returning before any other metric moves. Ignore open rate while you diagnose — privacy proxies inflate it and image blocking suppresses it, so it can rise while placement gets worse.</p>

<h2 id="when-should-i-contact-support">When should I contact support?</h2>
<p>Contact support when authentication is fully verified, your bounce rate is low, mailboxes are warm and inside their limits, volume is modest, and mail still lands in spam consistently across several providers. Include the campaign name, the affected mailbox and where your test messages landed — that is enough to investigate the sending path.</p>

<h2 id="faq">Frequently asked questions</h2>
<section class="faq">
<h3>Is Gmail's Promotions tab the same as spam?</h3>
<p>No. Promotions is still the inbox and the message was delivered, but plain-text-style formatting, fewer links and no images all push a cold email towards the Primary tab.</p>
<h3>Will sending fewer emails per day on its own fix spam placement?</h3>
<p>Only if volume was the problem. Lower volume from a domain with failing SPF or DKIM still lands in spam, so verify authentication before you touch limits.</p>
<h3>Should I use a separate domain for cold outreach?</h3>
<p>Yes. Use a dedicated domain or subdomain so that a reputation problem never reaches the domain your invoices, contracts and support email depend on.</p>
<h3>Does one spam complaint matter?</h3>
<p>One does not, but the rate does. Complaints above roughly 0.1% of sends are damaging, and MunchReach automatically pauses sending once complaints pass 0.5% over a rolling 24-hour window.</p>
<h3>Can I test where my email lands before launching a campaign?</h3>
<p>Send yourself the exact email at two or three providers — one consumer address and one business address — and check the inbox, Promotions and spam folders in each. Placement varies by provider, so a single test address proves little.</p>
<h3>Why did placement drop suddenly on a campaign that used to work?</h3>
<p>The usual causes are a DNS change that broke authentication, a newly imported unverified list, or a volume jump. Check the domain authentication badges first, then the bounce rate for the exact days placement fell.</p>
</section>
`.trim();

const post = {
  slug: "why-emails-land-in-spam",
  title: "Why are my emails landing in spam?",
  subtitle: "The real causes of spam placement in cold outreach, and the order to fix them in.",
  excerpt:
    "Cold emails going to spam? Diagnose authentication, reputation, bounce rates and copy in MunchReach — and fix placement in the right order.",
  content,
  content_format: "html",
  content_type: "guide",
  status: "published",
  featured: false,
  popular_guide: true,
  reading_minutes: 9,
  tags: ["spam-folder", "spf", "dkim", "dmarc", "inbox-placement", "sender-reputation"],
  seo_title: "Why Are My Emails Landing in Spam? (Fix Guide)",
  meta_description:
    "Cold emails going to spam? Diagnose authentication, reputation, bounce rates and copy in MunchReach — and fix placement in the right order.",
  category_id: "e3e0812c-bc77-4ed9-94d7-82b13d12b8ee", // Deliverability
  author_id: "6032c025-cdab-4f0a-8084-2abc936ffcd6", // Sara Lindqvist, Deliverability Lead
  published_at: "2026-09-12T09:00:00+00:00",
  updated_at: new Date().toISOString(),
  cover_image_url: IMG_DNS,
  og_image_url: null,
};

const response = await fetch(`${url}/rest/v1/blog_posts?on_conflict=slug`, {
  method: "POST",
  headers,
  body: JSON.stringify([post]),
});
const text = await response.text();
if (!response.ok) throw new Error(`upsert failed (${response.status}): ${text.slice(0, 400)}`);
const [saved] = JSON.parse(text) as Array<{ id: string; slug: string; status: string }>;
console.log("upserted", saved.id, saved.slug, saved.status, `${content.length} chars`);
