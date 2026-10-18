# Public sending and warmup claims review

## Result

Public copy now describes customer-owned connected mailboxes, MunchReach workflow automation, and delivery through the customer's email provider or SMTP server. Provider sending limits and policies remain the customer's responsibility. No sending behavior, warmup logic, prices, settings or production records were changed. Nothing was published or deployed.

No reliable, publicly verified aggregate dataset was available in this review. No customer data was queried and no performance statistics were added. Warmup's actual default configuration is displayed from the same schedule constant used by the product, explicitly labeled as configuration rather than performance.

## Exact claims changed and pages updated

| Page or shared surface | Previous claim | Replacement / correction |
| --- | --- | --- |
| `/pricing` | “Sending is fully managed by MunchReach — there is nothing to set up or maintain on your side.” | Connect your own mailboxes; MunchReach manages campaigns, scheduling and automated follow-ups. Your provider or SMTP server delivers messages, and its limits and policies remain your responsibility. |
| `/pricing` | “Every plan includes managed sending.” | “Every plan includes outreach automation through your connected mailboxes.” |
| `/pricing` FAQ | “Do I need my own SMTP or email API?” / “No…we handle delivery.” | “Do I need my own email mailbox?” / Yes; supported mailbox connection or IMAP/SMTP details are required. No shared rented mailbox pool is supplied. |
| Pricing comparison, also shown on `/lifetime` | “Managed email sending” / “Campaign delivery runs through the MunchReach sending workflow.” | “Connected-mailbox automation”; workflow scheduling is separate from provider/SMTP delivery. |
| `/why-munchreach` | “on sending infrastructure you own” | “through mailboxes you own”; added explicit orchestration/provider-delivery split and provider-policy responsibility. |
| `/why-munchreach` | “Every send, delivery…is recorded…” and generic “delivered” reporting | Recorded sending/engagement events; confirmed delivery only where available, distinct from accepted-minus-bounced estimates and inbox placement. |
| `/why-munchreach` | “Automatic pause on bounce and complaint thresholds”; “Delivery diagnostics on every test and live send” | Configured sending-health safety blocks/pauses; provider responses and send failures for troubleshooting. Example connection and campaign panels labeled as examples, not platform results. |
| `/product/warmup` | Preset-based progression explanation | Independent UTC-day progression, per-mailbox checkpoints, manual daily limits, pause/poor-health freezes and no downtime catch-up jump. |
| `/product/warmup` | Broad “real health signals” description | MunchReach-calculated indicator from recent warmup events and available account/authentication signals—not an external reputation score or placement percentage. |
| `/product/warmup` | Generic activity visualization without sufficient evidence context | Explicit no-verified-platform-benchmark statement; provider acceptance, confirmed arrival and observable placement explained separately. Unknown placement is unavailable, not inbox success. |
| `/product/warmup` | Illustrative Conservative/Balanced/Aggressive settings | Actual default automatic stages: days 1–8: 1–7; days 9–18: 7–15; days 19–25: 15–30 warmup emails/day. These are effective progression days and configured ranges, not achieved volume or results; safeguards/capacity can reduce activity. |
| `/product/warmup` | “Build Mailbox Health Before You Build Sending Volume”; “Ready to scale responsibly” | “Build Sending Activity With Health Safeguards”; “Review signals before scaling.” Complaint protection qualified by feedback availability. |
| Shared warmup visuals on home and warmup pages | Hero figures and “Illustrative product view”; “Reputation monitoring” | “Example data · not platform results”; “Available health signals.” Settings use actual default stages and distinguish example settings from configuration. |
| `/` FAQ and warmup section | “It improves your odds”; “so problems show up before they hurt your campaigns”; “Deliverability warnings” | Gradual activity, available health signals and configured hold/pause controls; no implied prevention or improved placement result. “Sending-health warnings.” Mailbox FAQ states delivery ownership and provider responsibility. |
| `/features` | “Protect your sending reputation”; “gentle, natural activity” | Gradual warmup with per-mailbox progression, manual limits and safeguards; activity/health do not guarantee placement. Connected-mailbox section and FAQ explain provider delivery and policies. |
| `/lifetime` | “Continuous warmup keeps your mailboxes trusted and out of the spam folder.” | Gradual activity, per-mailbox progression and safeguards; no inbox placement guarantee. |
| `/lifetime` | “SPF, DKIM and DMARC checks with domain alerts when something breaks.” | Available authentication/sending-health signals; manual verification where checks are unavailable. Mailbox FAQ clarifies provider delivery and responsibility. |
| `/integrations` | “MunchReach operates/runs the sending infrastructure”; “No email provider setup — ever.” | MunchReach automates through connected mailboxes; connect email providers separately on Email Accounts. Integrations connect the surrounding workflow tools. |
| `/signup` metadata | “handle the sending infrastructure for you”; “no sending setup required” | Connect your own mailbox and automate campaigns through your email provider. |
| All `/solutions/$slug` pages | “Sending reputation built and maintained in the background”; “Sending reputation maintained quietly”; “Sending infrastructure is managed centrally” | Gradual warmup and available signals; no reputation/placement guarantee. Centrally manage your own connected accounts; provider/SMTP performs delivery. |
| Five `/compare/munchreach-vs-*` pages | “or use managed sending”; generic mandatory domain DNS gate; “reputation keeps building”; “so reputation is unaffected”; “without losing sending reputation” | Customer-owned connected mailboxes, provider delivery and policy responsibility; available checks/manual verification; gradual warmup during migration without guaranteed reputation preservation. Shared analytics descriptions distinguish confirmed delivery and estimates. |
| `/resources` | “Everything that decides whether your cold email reaches the inbox.” | “Key factors that can influence email delivery and inbox placement, with practical monitoring guidance.” |
| Shared public inbox preview | “inbox placement is up to 96%” | Review daily warmup volumes and recent mailbox events; no placement percentage. |
| `/community` | Unverified named-reviewer claims: 3%→11% reply rate; 14 meetings from 900 leads; inbox rate restored in the same week | Three explicitly labeled discussion topics, not customer testimonials: reply analysis, follow-up review, and sending-health troubleshooting. Existing three-item section retained. |

### Deliverability guide corrections (`/deliverability-guide`)

- Removed the unsourced placement chart: **78% inbox, 14% promotions, 6% spam, 2% blocked**. Replaced it with acceptance/arrival/placement definitions and observability limits.
- Removed the unsupported quote claiming **40% spam placement** became consistent inbox delivery. The same section now explains measurement period, mailbox sample, recipient providers and observable sample size.
- Removed **“expect 1–3 weeks…before inbox placement fully recovers.”** Recovery varies and cannot be guaranteed.
- Replaced universal **30–50 emails/day** advice with provider-policy/account-specific conservative limits.
- Replaced an invented four-week 5–50-email ramp and **“keeps reputation intact”** with the product's actual default UTC stages, labeled configuration, not a performance result.
- Removed unsourced universal **2% bounce / 0.1% complaint** targets and **three-to-four touches over 10–14 days is the sweet spot** claims. Use provider policies and observed recipient feedback.
- Removed **“authentication and warmup…account for most cases”**, **“route every send straight to spam”**, **“one bad list ruins the domain”**, and guaranteed reputation-isolation/recovery wording.
- Removed the incorrect MunchReach SPF include **`include:_spf.munchreach.app`**. The guide now instructs customers to use their provider's record and labels the displayed placeholder as not safe to publish unchanged.
- Removed the blanket claim that every domain must pass MunchReach DNS verification before a mailbox can become active. Connection checks, provider-supplied authentication and manual verification are explained instead.
- Replaced “Run a free audit” with “Connect your mailbox”; no unsupported audit product implied.
- Clarified that acceptance, confirmed delivery and accepted-minus-bounced estimates do not establish inbox placement or identify a single cause of low replies.

## Validation

- **133 tests passed across 16 files**, covering all warmup regressions plus pricing comparison, mailbox sending provider, campaign dispatch provider and deliverability guards. Existing tests use isolated fixtures/mocked providers; no customer sends.
- Automatic production compilation: **build OK**, latest checked entry `2026-10-18T22:09:22Z`. No manual build or deployment was executed.
- Public browser checks: **19 pages**, no listed obsolete claims, complete title/description/Open Graph/Twitter metadata, and **no page runtime errors**. Includes all five comparison pages and one representative solution page; shared solution text affects every solution slug.
- Warmup pause/progression FAQ expanded successfully. Desktop evidence explanations and the 624×722 warmup view visually checked.
- Pricing's currently rendered public FAQ question reflects the new mailbox wording. Admin-managed FAQ rows can replace defaults; stored rows and SEO overrides were not changed.

## Limits of this review

- Source and mocked tests establish supported behavior, not production provider performance. No verified public aggregate metrics or actual mailbox placement measurements were fetched.
- Database-managed blog articles, FAQ records, testimonials and SEO overrides were not edited or exhaustively audited; future published records should follow the same evidence rules.
- Authenticated application/onboarding messaging was outside this public-copy task and remains unchanged. Platform System Emails have separate provider ownership and were not altered.
- Sending and warmup behavior, prices, layouts, buttons and their destinations remain unchanged except the deliverability guide's misleading audit button label. Relevant sections retain their placement; evidence explanations replace unsupported proof.
- **Not published or deployed.** The live website is unchanged until publication is separately approved.