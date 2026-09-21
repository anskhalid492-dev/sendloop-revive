import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";

import { MarketingLayout, PageHero, metaFor } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Compliance Center.
 *
 * Long-form documentation layout (sticky table of contents + a single reading
 * column) rather than a card grid: the page is a reference customers are meant
 * to read, not a marketing overview.
 */

const toc = [
  { id: "why", label: "Why Compliance Matters" },
  { id: "permitted-use", label: "What You May Use MunchReach For" },
  { id: "lead-data", label: "Lead Data and Contact Sources" },
  { id: "data-quality", label: "Contact Data Quality" },
  { id: "verification", label: "Email Verification" },
  { id: "legal-basis", label: "Consent, Legal Basis and Applicable Rules" },
  { id: "unsubscribe", label: "Unsubscribe and Suppression" },
  { id: "bounce-complaint", label: "Bounce and Complaint Protection" },
  { id: "responsible-sending", label: "Responsible Sending" },
  { id: "message-quality", label: "Message Quality" },
  { id: "infrastructure", label: "Email Accounts and Mailbox Authentication" },
  { id: "monitoring", label: "Campaign Monitoring" },
  { id: "restrictions", label: "When MunchReach May Restrict Sending" },
  { id: "responsibilities", label: "User Responsibilities" },
  { id: "prohibited", label: "Prohibited and High-Risk Uses" },
  { id: "checklist", label: "Compliance Checklist" },
  { id: "faq", label: "Frequently Asked Questions" },
  { id: "help", label: "Need Help?" },
];

const faqs = [
  {
    q: "What is MunchReach's approach to compliance?",
    a: "MunchReach provides sending tools together with platform-level controls such as suppression handling, bounce and complaint tracking, sending limits and campaign monitoring. Those controls are designed to reduce risk for everyone using the platform. They do not decide whether a particular campaign is appropriate or legally permitted — that judgement stays with the customer running the campaign.",
  },
  {
    q: "Can I use MunchReach for cold outreach?",
    a: "MunchReach is built for business outreach, including prospecting to business contacts where that is permitted for you. You are responsible for confirming that your contact data, your targeting and your messaging meet the requirements that apply to your business and to the people you are contacting.",
  },
  {
    q: "Is cold email legal?",
    a: "Cold email rules vary significantly by jurisdiction, recipient type, industry, relationship, and purpose. Users should understand the requirements that apply to their specific campaigns and obtain professional legal advice when necessary.",
  },
  {
    q: "Does MunchReach provide legal advice?",
    a: "No. MunchReach publishes practical platform guidance and operates compliance-oriented controls, but nothing on this page or in the product is legal advice. If you are unsure whether a campaign is permitted, speak to a qualified legal professional in the relevant jurisdiction.",
  },
  {
    q: "Where should I get my leads from?",
    a: "From sources you can describe and stand behind: your own research, your own inbound and event data, your CRM, or reputable data providers whose terms allow the use you have in mind. What matters is that you can explain where a contact came from, why they are relevant, and why contacting them is appropriate.",
  },
  {
    q: "Do I need to verify my email list?",
    a: "Verification is strongly recommended before any significant send. It removes malformed and non-existent addresses that would otherwise bounce and damage your sending reputation. Verification is not a guarantee of delivery, and it never tells you whether contacting a person is appropriate.",
  },
  {
    q: "What happens when someone unsubscribes?",
    a: "The contact should be suppressed from further outreach of that kind. Suppression records are meant to persist: deleting a contact and re-importing the same address later does not reset an opt-out, and moving the address into a different campaign to keep contacting them is treated as an attempt to bypass the opt-out.",
  },
  {
    q: "What happens after a hard bounce?",
    a: "A hard bounce indicates a likely permanent failure — typically the address does not exist. The address should be suppressed rather than retried. Repeated sending to addresses that hard-bounce damages sender reputation, and MunchReach may restrict sending when it sees that pattern.",
  },
  {
    q: "What happens after a spam complaint?",
    a: "A complaint is a strong negative signal from the recipient. The complaining contact should be suppressed, and the campaign that produced the complaint should be reviewed for targeting and relevance. A rising complaint rate can trigger campaign or mailbox protection measures.",
  },
  {
    q: "Can MunchReach pause my campaign?",
    a: "Yes. When Sending Activity creates significant risk to Recipients, Connected Mailboxes, other customers or the infrastructure MunchReach relies on, Campaigns or Mailboxes may be paused or restricted. Restrictions may be temporary while a problem is investigated and corrected.",
  },
  {
    q: "Does unsubscribing from marketing emails disable account notifications?",
    a: "Opting out of marketing or outreach communication is not intended to switch off notifications that are necessary to operate an account — for example password resets, security notices, or messages about something critical happening in your workspace. How a specific message is treated depends on its content and purpose.",
  },
  {
    q: "Who is responsible for making sure my campaigns comply with applicable laws?",
    a: "You are. Using MunchReach does not transfer legal or regulatory responsibility for your campaigns, your contact data, or your messaging to MunchReach.",
  },
];

export const Route = createFileRoute("/compliance")({
  head: () =>
    metaFor(
      "MunchReach Compliance | Responsible Email Outreach",
      "Learn how MunchReach approaches responsible outreach, contact data, unsubscribe handling, bounce protection, sending practices, and user responsibilities.",
      "/compliance",
      faqs,
    ),
  component: Compliance,
});

/* ---------- small presentational helpers (documentation, not cards) ---------- */

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-border/60 pt-12 first:border-0 first:pt-0">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-5 space-y-4 text-[0.95rem] leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-4 text-lg font-semibold tracking-tight text-foreground">{children}</h3>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-primary/40 text-primary">
            <CheckCircle2 className="size-3.5" />
          </span>
          <span className="text-foreground/90">{i}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "principle";
  title?: string;
  children: ReactNode;
}) {
  const Icon = tone === "warn" ? AlertTriangle : tone === "principle" ? ShieldCheck : Info;
  const ring =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : tone === "principle"
        ? "border-primary/30 bg-primary/5"
        : "border-border/70 bg-muted/40";
  return (
    <div className={`rounded-2xl border p-5 ${ring}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-2">
          {title ? <p className="font-semibold text-foreground">{title}</p> : null}
          <div className="text-sm leading-6 text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ChecklistGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{title}</h3>
      <div className="mt-4">
        <Checks items={items} />
      </div>
    </div>
  );
}

/* ------------------------------------ page ----------------------------------- */

function Compliance() {
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="MunchReach Compliance"
        title="Send Responsibly."
        highlight="Protect Your Sender Reputation."
        description="MunchReach provides tools for businesses to manage outbound communication responsibly. That means using relevant prospect data, maintaining clean contact lists, respecting unsubscribe requests, monitoring sending health, and following applicable laws, regulations, and provider requirements."
        primaryCta="Contact Support"
        primaryHref="/contact-support"
        secondaryCta="View Help Center"
        secondaryHref="/help-center"
      >
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Last updated: September 2026
          </p>
          <p className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-sm text-foreground/90">
            Compliance is a shared responsibility between MunchReach and every customer using the
            platform.
          </p>
        </div>
      </PageHero>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
          {/* Mobile "On this page" */}
          <details className="mb-8 rounded-2xl border border-border/60 bg-card/60 p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold">On this page</summary>
            <nav className="mt-3 space-y-1.5">
              {toc.map((t, i) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="block text-sm text-muted-foreground hover:text-primary"
                >
                  {i + 1}. {t.label}
                </a>
              ))}
            </nav>
          </details>

          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1.5 border-l border-border/60 pl-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                On this page
              </p>
              {toc.map((t, i) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="block text-sm leading-6 text-muted-foreground transition-colors hover:text-primary"
                >
                  {i + 1}. {t.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="mx-auto w-full max-w-[820px] space-y-12">
            <Doc id="why" title="Why Compliance Matters">
              <p>
                MunchReach exists to help businesses run outbound communication in an organised,
                measurable way. The software handles scheduling, sending, follow-ups, replies and
                reporting. What it cannot do is decide, on your behalf, whether a particular person
                should be receiving a particular message. That judgement belongs to the business
                running the campaign, and it is the part of outreach that determines whether the
                whole exercise works or slowly falls apart.
              </p>
              <p>
                Responsible outreach protects far more than a single campaign. It protects the
                recipients, who should only be receiving messages that are relevant to them. It
                protects your business, because reputation damage caused by careless sending is slow
                and expensive to undo. It protects your sender reputation and the individual
                Mailboxes you connect. It protects the email
                infrastructure MunchReach depends on, along with the provider relationships that
                keep that infrastructure available. And it protects other MunchReach customers,
                since sending behaviour on shared infrastructure is never entirely private in its
                effects.
              </p>
              <p>
                The consequences of poor practice tend to arrive in a predictable order. First
                bounces rise, because the list contains addresses that no longer exist. Then
                complaints appear, because the messages are landing with people who have no reason
                to care. Unsubscribes climb. Filtering systems begin treating the sender and Mailbox
                with suspicion, so open and reply rates fall even for the recipients who would have
                been interested. At that point providers may apply their own restrictions, campaigns
                may be paused, and in serious cases sending access can be limited or withdrawn
                altogether.
              </p>
              <p>
                None of that is triggered by a single mistake. It is the cumulative result of
                sending too much, too fast, to people chosen too loosely. It is also why volume is a
                poor measure of a campaign. Ten thousand emails to a badly assembled list will
                produce fewer conversations than five hundred emails to people who genuinely fit
                what you are offering, and the ten thousand will leave your sender reputation in a worse state
                afterwards.
              </p>
              <p>
                A useful way to think about it: every message you send is a small withdrawal against
                your reputation, and every relevant, well-targeted message is a deposit. Campaigns
                that consistently withdraw more than they deposit stop working, regardless of how
                good the tooling is.
              </p>
              <Callout tone="principle">
                Good outreach starts with relevance, accurate data, responsible sending, and respect
                for the recipient.
              </Callout>
            </Doc>

            <Doc id="permitted-use" title="What You May Use MunchReach For">
              <p>
                MunchReach is built for business communication. It is intended for teams contacting
                other businesses for reasons those businesses would recognise as legitimate — a
                relevant product, a relevant service, a relevant partnership, or a continuation of
                an existing commercial relationship.
              </p>
              <p>Typical, appropriate uses include:</p>
              <Bullets
                items={[
                  "B2B prospecting to companies that plausibly fit your offer",
                  "Business development and new-market exploration",
                  "Sales outreach run by an in-house team",
                  "Partnership, reseller and channel outreach",
                  "Agency prospecting on behalf of the agency or, where permitted, a client",
                  "SaaS prospecting to teams whose work your product supports",
                  "Professional services outreach, such as consulting or recruitment",
                  "Account-based outreach to named target accounts",
                  "Re-engaging appropriate business contacts where doing so is permitted",
                  "Managing legitimate outbound campaigns, sequences and follow-ups in one place",
                ]}
              />
              <p>
                The common thread is a genuine reason to communicate. Before a campaign starts, you
                should be able to answer a simple question about any contact on the list: why this
                person, and why now? If the honest answer is that the address was available and the
                list needed filling, the campaign is unlikely to perform and is more likely to
                generate complaints.
              </p>
              <p>
                Relevance also has a practical edge. A tightly defined audience lets you write a
                specific message, which improves replies and reduces the negative signals that
                damage sending health. Broad audiences force generic messaging, and generic
                messaging is what recipients report.
              </p>
              <p>
                Deciding whether a specific campaign is permitted is your responsibility. The rules
                that apply depend on where your recipients are, where you are, what you are sending
                and who you are sending it to. MunchReach does not make a blanket claim that any
                particular form of outreach is lawful everywhere, because that is not something any
                platform can honestly promise.
              </p>
            </Doc>

            <Doc id="lead-data" title="Lead Data and Contact Sources">
              <p>
                Almost every serious deliverability problem starts with the list. The messaging can
                be excellent and the infrastructure correctly configured, but if the contacts are
                wrong, stale or inappropriate, the campaign will produce bounces and complaints
                instead of conversations.
              </p>
              <p>
                A responsible prospect list is one you can account for. That means knowing, for each
                segment of the list, where the contacts came from and how they were collected;
                whether the source permits the use you have in mind; why the contacts are relevant
                to what you are sending; whether the information is accurate and reasonably current;
                whether the recipient would reasonably expect to hear from a business like yours;
                and whether any consent or legal requirement that applies to those recipients has
                been satisfied.
              </p>
              <p>
                Uploading a large database because it was available is the opposite of that.
                Purchased and scraped datasets vary enormously in quality and in what their terms
                actually allow. Some are assembled carefully and kept current. Many are years old,
                heavily duplicated, full of addresses that no longer resolve, and licensed under
                terms that do not cover bulk outreach at all. Importing one of those without review
                puts your own Sending Accounts at risk long before anyone reviews your messaging.
              </p>
              <p>
                It is also worth separating two ideas that are often confused. Finding an email
                address publicly tells you that the address exists and was published somewhere. It
                does not establish that the person expects commercial contact, that they are the
                right person for your message, or that unlimited follow-up is appropriate. A
                published address is a starting point for judgement, not a substitute for it.
              </p>
              <p>
                Documenting your sources is one of the highest-value habits in outbound. When a list
                underperforms, source records let you see whether the problem is one supplier, one
                scraping run, or one badly defined segment — and remove just that portion instead of
                guessing. If a recipient or a regulator ever asks how you obtained their details,
                the same records are what let you answer.
              </p>
              <H3>Recommended Lead Source Review</H3>
              <p>Before importing a list, work through these questions:</p>
              <Checks
                items={[
                  "Where did this contact information come from?",
                  "Is the source reliable?",
                  "Is the contact relevant to my offer?",
                  "Is the information reasonably current?",
                  "Do I have the appropriate legal basis or permission where required?",
                  "Has this person previously unsubscribed?",
                  "Is the contact already on my suppression list?",
                  "Am I targeting the correct person?",
                  "Is the intended communication appropriate for this recipient?",
                ]}
              />
            </Doc>

            <Doc id="data-quality" title="Keep Your Contact Data Clean">
              <p>
                List hygiene is unglamorous and it decides more outcomes than copywriting does.
                Every message that fails, lands on the wrong person, or arrives at an address nobody
                reads is a small negative signal, and those signals accumulate against the Email
                Account and sender identity you use.
              </p>
              <p>The recurring problems are consistent:</p>
              <Bullets
                items={[
                  "Invalid addresses that were mistyped, malformed or never existed",
                  "Old addresses belonging to people who left the company years ago",
                  "Duplicate contacts that cause the same person to receive a message twice",
                  "Irrelevant contacts who do not match the audience the campaign was written for",
                  "Generic addresses such as info@ or contact@ that route to shared mailboxes",
                  "Role accounts such as sales@, support@ or abuse@, which are poor outreach targets and in some cases actively monitored for unsolicited mail",
                  "Unsubscribed contacts that were reintroduced through a later import",
                  "Suppressed contacts that were excluded for a reason worth respecting",
                  "Addresses producing repeated temporary failures over an extended period",
                ]}
              />
              <H3>Before Import</H3>
              <p>
                Deduplicate the file, standardise the columns you personalise with, drop obviously
                broken rows, and remove role and generic addresses unless there is a specific reason
                to keep them. Check the file against your suppression list before it ever reaches a
                campaign, not after.
              </p>
              <H3>After Import</H3>
              <p>
                Review a sample by hand. Open twenty or thirty records and confirm the company, the
                job title and the personalisation fields make sense together. Broken merge fields
                are usually visible in the first few rows, and catching them here costs nothing
                compared with catching them after two thousand sends.
              </p>
              <H3>During a Campaign</H3>
              <p>
                Suppress hard bounces immediately rather than allowing retries. Watch whether
                failures are concentrated in one imported segment — that pattern points at the
                source, not at the message. Remove contacts that produce complaints, and pause a
                campaign rather than letting a visible data problem keep running to the end of the
                sequence.
              </p>
            </Doc>

            <Doc id="verification" title="Verify Your Email Lists Before Sending">
              <p>
                Verification is the cheapest protection available to an outbound team. It filters
                out a large share of the addresses that would otherwise bounce, and bounces are the
                single fastest routes to damaged sender reputation.
              </p>
              <p>Verification typically looks at several layers:</p>
              <Bullets
                items={[
                  "Syntax validation — is the address correctly formed at all?",
                  "Domain validation — does the domain exist and accept mail?",
                  "Mailbox availability signals — does the receiving system indicate the mailbox is present?",
                  "Invalid addresses — clear failures that should never be sent to",
                  "Disposable addresses — temporary inboxes that are rarely worth contacting",
                  "Risky addresses — accept-all domains and other cases where the result is inconclusive",
                  "Duplicate removal — the same person appearing more than once across imports",
                ]}
              />
              <p>
                What verification cannot do is guarantee delivery. A verified address can still be
                filtered, quarantined, rejected by a policy on the receiving side, or simply ignored
                by a person who never opens it. Verification reduces avoidable failures; it does not
                place mail in an inbox, and any tool claiming otherwise is overstating what the
                check does.
              </p>
              <p>
                Timing matters as well. Contact data ages quickly, and a list verified six months
                ago is not a verified list today. Re-check before a significant send rather than
                relying on an old result.
              </p>
              <Callout tone="warn" title="Verification is not permission">
                Never treat email verification as permission to contact someone. Verification tells
                you about the address; it does not determine whether the communication is
                appropriate or legally permitted.
              </Callout>
            </Doc>

            <Doc id="legal-basis" title="Consent, Legal Basis and Applicable Rules">
              <p>
                There is no single worldwide rulebook for outbound email. Requirements differ by
                country and region, by industry, by whether the recipient is a business or an
                individual, by the nature of the message, and by whether a prior relationship
                exists. Two campaigns that look identical in MunchReach can sit under entirely
                different obligations because their recipients are in different places.
              </p>
              <p>
                Frameworks that are commonly relevant include CAN-SPAM in the United States, the
                GDPR across the EU and EEA, the UK's PECR alongside UK data protection law, and CASL
                in Canada. Many other countries maintain their own privacy and electronic
                communications requirements, and some sectors add rules of their own on top. These
                are mentioned only as examples of the kinds of regimes that may apply; listing them
                is not a statement about which one governs your campaign, and it is not legal
                advice.
              </p>
              <p>The requirements that apply to a given campaign typically depend on:</p>
              <Bullets
                items={[
                  "Where the recipient is located",
                  "Where the sender is established",
                  "The type of communication being sent",
                  "Whether the recipient is a business contact or an individual consumer",
                  "The industry, since some sectors carry additional obligations",
                  "Any existing relationship between sender and recipient",
                  "Whether consent was obtained, and how it was obtained and recorded",
                  "Whether another legal basis, such as legitimate interests, is available and appropriate in that jurisdiction",
                  "Opt-out requirements, including how prominently they must be offered and how quickly they must be honoured",
                  "How contact data must be stored, secured and disclosed on request",
                ]}
              />
              <p>
                Practical implications follow from that. Consent obtained for one purpose does not
                automatically extend to another. A B2B exemption in one jurisdiction does not carry
                over to a recipient in a different one. Rules can change, so a position that was
                sound two years ago may need revisiting. And if you rely on a legal basis other than
                consent where that is permitted, you generally need to be able to show the reasoning
                behind it, not merely assert it after the fact.
              </p>
              <p>
                The most reliable approach is to segment by recipient location and treat the
                strictest applicable standard as your working baseline for that segment. Keep
                records of where data came from and when. Honour opt-outs promptly and permanently.
                Where a campaign sits in genuinely uncertain territory, get advice before it runs
                rather than after the first complaint.
              </p>
              <Callout tone="warn" title="Important">
                MunchReach provides software tools and compliance-oriented controls, but MunchReach
                does not provide legal advice. Customers are responsible for determining which laws
                and requirements apply to their activities.
              </Callout>
            </Doc>

            <Doc id="unsubscribe" title="Respect Unsubscribe Requests">
              <p>
                An unsubscribe is a clear instruction from a recipient. Honouring it quickly and
                permanently is both the right response and the practical one — a suppressed contact
                costs you nothing, while a contact who is emailed after opting out is far more
                likely to report the next message as spam.
              </p>
              <p>What respecting opt-outs looks like in practice:</p>
              <Bullets
                items={[
                  "Every applicable marketing or outreach message should provide an appropriate way to opt out",
                  "The opt-out mechanism should be easy to find and should actually work",
                  "Unsubscribed contacts should be suppressed from future applicable outreach",
                  "Suppression should survive imports, exports and list rebuilds",
                  "Deleting a contact and re-importing the same address later does not reset the opt-out",
                  "Moving an opted-out recipient into a different campaign to keep contacting them is treated as bypassing the opt-out",
                  "Suppression records should be kept accurate rather than periodically cleared",
                ]}
              />
              <p>
                MunchReach may maintain suppression records to help prevent future sending to
                recipients who should no longer receive messages. Those records exist to protect
                both the recipient and your sending reputation, and attempts to work around them are
                treated as a serious problem.
              </p>
              <H3>Marketing and outreach versus transactional messages</H3>
              <p>
                Not every email a system sends is outreach. Marketing and outreach communication is
                sent because you want to start or continue a commercial conversation. Transactional
                and system messages are sent because something happened in an account and the person
                needs to know about it.
              </p>
              <p>
                Opting out of marketing is not intended to switch off messages that are necessary to
                operate an account safely. Examples of the second category include password reset
                emails, security notifications such as a new sign-in alert, account-critical notices
                such as a failed payment that will suspend service, and important platform
                notifications about something affecting the account.
              </p>
              <p>
                That distinction is a matter of judgement, not a label you can apply at will.
                Calling a promotional message "transactional" does not make it one, and the exact
                treatment of a given message depends on its content, its purpose and the rules that
                apply to the recipient. When a message mixes a necessary notice with a promotion, it
                is safer to treat the promotional part as marketing.
              </p>
            </Doc>

            <Doc id="bounce-complaint" title="Bounce &amp; Complaint Protection">
              <p>
                MunchReach tracks delivery outcomes and applies platform-level protections when
                sending behaviour starts to look risky. These controls exist because bounce and
                complaint signals are how receiving systems judge a sender, and a Mailbox can lose
                standing quickly if those signals are ignored.
              </p>
              <H3>Hard Bounces</H3>
              <p>
                A hard bounce indicates a likely permanent delivery failure — usually that the
                mailbox does not exist. There is no benefit to retrying: the address will not start
                working, and repeated attempts are read by receiving systems as a sign that the
                sender does not maintain their list. Hard-bounced contacts should be suppressed and
                prevented from receiving further sends.
              </p>
              <H3>Temporary Failures</H3>
              <p>
                Temporary failures are different. A full mailbox, a server under load, or a
                short-lived policy deferral may resolve on its own, and a limited retry is
                reasonable. What is not reasonable is unlimited retrying. When the same address
                fails repeatedly over an extended period, that pattern should trigger monitoring or
                restriction rather than more attempts, because persistent deferrals often indicate
                the receiving side is throttling the sender deliberately.
              </p>
              <H3>Spam Complaints</H3>
              <p>
                A complaint is the strongest negative signal a recipient can send. It means the
                message was not merely unwanted but unwelcome enough to report. Complaining contacts
                should be suppressed immediately, and the campaign that generated the complaint
                should be reviewed — complaints usually point at targeting or relevance rather than
                at a technical fault. Even a small complaint rate is significant, because receiving
                systems weigh complaints far more heavily than opens or clicks.
              </p>
              <H3>Campaign-Level Protection</H3>
              <p>
                When bounce or complaint rates rise beyond what healthy sending produces, that
                usually indicates one of a small number of causes:
              </p>
              <Bullets
                items={[
                  "Poor list quality, typically an unverified or stale import",
                  "Poor targeting, where the audience does not match the message",
                  "Incorrect campaign setup, such as broken personalisation or the wrong segment",
                  "A Connected Mailbox with missing or misconfigured authentication",
                  "Irrelevant messaging that recipients have no reason to welcome",
                ]}
              />
              <p>
                Affected campaigns, mailboxes, or sending infrastructure may be paused or restricted
                when necessary. That is deliberately conservative: pausing a campaign for a few hours
                is recoverable, whereas damaged sender reputation takes far longer to rebuild.
              </p>
              <Callout tone="principle">
                MunchReach's protections are designed to reduce risk, but they cannot replace
                responsible user behaviour.
              </Callout>
            </Doc>

            <Doc id="responsible-sending" title="Responsible Sending Practices">
              <p>
                Sending patterns matter as much as content. Receiving systems build a picture of a
                sender over time, and sudden changes in that picture are treated with suspicion —
                particularly from Mailboxes and sender identities with little history.
              </p>
              <p>The practices that keep sending healthy are straightforward:</p>
              <Bullets
                items={[
                  "Start with reasonable sending volumes, especially on a new or recently connected Mailbox",
                  "Increase volume gradually, in steady increments rather than jumps",
                  "Monitor sending health continuously instead of reviewing it at the end of a campaign",
                  "Avoid sudden unexplained volume spikes, including adding many mailboxes at once",
                  "Keep campaign targeting focused so each sequence speaks to one clear audience",
                  "Stop contacting people who show negative signals rather than continuing the sequence",
                  "Monitor bounces and suppress hard failures immediately",
                  "Monitor complaints, treating any sustained rise as urgent",
                  "Monitor unsubscribes as a measure of relevance, not just as a compliance task",
                  "Pause campaigns when something looks wrong, and investigate before resuming",
                ]}
              />
              <p>
                Spacing helps too. Messages sent in a natural rhythm across working hours behave
                better than the same volume fired off in a few minutes, and follow-up sequences
                should have a defined end. A prospect who has not responded after a small number of
                well-spaced messages is unlikely to respond to a sixth, and continuing simply
                increases the chance of a complaint.
              </p>
              <H3>Sending Volume Is Not a Quality Metric</H3>
              <p>
                It is tempting to treat emails sent as a measure of effort, but volume on its own
                predicts nothing about revenue. Sending more messages to a weak list produces more
                bounces, more complaints and worse sender reputation — which then reduces results for the
                well-targeted messages that would otherwise have worked.
              </p>
              <p>A healthy campaign is measured by:</p>
              <Bullets
                items={[
                  "Relevant contacts who plausibly need what you offer",
                  "Appropriate targeting at the right person in the right company",
                  "Useful messaging that stands on its own without pressure",
                  "Reasonable volume matched to the capacity and health of the Connected Mailboxes",
                  "Positive engagement, especially replies that lead somewhere",
                  "Low complaint rates sustained across the whole sequence",
                  "Sustainable sending behaviour you could repeat next quarter",
                ]}
              />
            </Doc>

            <Doc id="message-quality" title="Write Messages People Actually Want to Receive">
              <p>
                Recipients decide within a couple of seconds whether a message is worth reading. The
                fastest way to lose that decision is to look like an attempt to manipulate them.
              </p>
              <p>Avoid:</p>
              <Bullets
                items={[
                  "Misleading subject lines that promise something the message does not deliver",
                  "False claims about results, customers or capabilities",
                  "Fake personalisation, such as a merge field dressed up as genuine research",
                  "Pretending to have a relationship that does not exist",
                  "Misrepresenting who the sender is or which company they represent",
                  "Manufactured urgency and artificial deadlines",
                  "Deceptive offers, including terms that change once someone replies",
                  "Irrelevant messages sent to fill a quota",
                  "Excessive follow-ups after a clear lack of interest",
                ]}
              />
              <p>A message that works usually makes four things obvious:</p>
              <Bullets
                items={[
                  "Who is contacting the recipient, including the company behind the message",
                  "Why they are contacting this specific person",
                  "Why the message may be relevant to them right now",
                  "What the recipient can do next, stated as a small, easy step",
                ]}
              />
              <H3>Poor Example</H3>
              <div className="rounded-2xl border border-destructive/25 bg-destructive/5 p-5 text-sm leading-6">
                <p className="font-medium text-foreground">
                  Subject: Re: our conversation last week
                </p>
                <p className="mt-3">
                  Hi {"{{first_name}}"}, following up as discussed. We help companies like{" "}
                  {"{{company}}"} triple revenue in 30 days with a proven system used by industry
                  leaders. This offer expires Friday. Are you free for a quick 15-minute call
                  tomorrow at 2pm or 3pm?
                </p>
                <p className="mt-3 text-muted-foreground">
                  Why it fails: the subject fabricates a prior conversation, the claim is
                  unverifiable, the urgency is invented, and nothing in the message shows why this
                  recipient was chosen.
                </p>
              </div>
              <H3>Better Example</H3>
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 text-sm leading-6">
                <p className="font-medium text-foreground">
                  Subject: Question about Northwind's onboarding docs
                </p>
                <p className="mt-3">
                  Hi Priya — I'm Daniel at Larkfield, we build documentation tooling for support
                  teams. I noticed Northwind published a new self-serve onboarding guide last month,
                  which usually means the support team is fielding a lot of setup questions. We help
                  teams in that position keep help content current without manual rewrites. If
                  that's on your list this quarter, I'm happy to send a short overview — no call
                  needed. If not, no problem, and you can unsubscribe below.
                </p>
                <p className="mt-3 text-muted-foreground">
                  Why it works: the sender identifies themselves, the reason for contact is
                  specific, the relevance is explained, and the next step is small and optional.
                </p>
              </div>
              <p className="text-xs">
                Both examples are fictional and are shown only to illustrate message quality.
              </p>
            </Doc>

            <Doc id="infrastructure" title="Email Accounts and Mailbox Authentication">
              <p>
                MunchReach sends Campaigns through Email Accounts and Mailboxes that customers
                connect and authorize. Customers must control those accounts, keep access secure and
                follow the sending rules and limits that apply to each account.
              </p>
              <p>Responsible Email Account use includes:</p>
              <Bullets
                items={[
                  "Connect only Email Accounts you control or have permission to use",
                  "Keep Mailbox credentials and authorization secure",
                  "Use accurate sender and reply information",
                  "Respect per-Mailbox, daily and plan Sending Limits",
                  "Review Mailbox health, bounce, complaint and authentication signals",
                  "Pause or reduce Sending Activity when a Mailbox shows elevated risk",
                ]}
              />
              <p>
                Connected Mailboxes remain subject to the terms, limits, availability and filtering
                decisions of the services that operate them. MunchReach cannot override those rules
                or guarantee that a message will be accepted or placed in an inbox.
              </p>
              <H3>Mailbox Authentication</H3>
              <p>
                MunchReach may check whether a Connected Mailbox can sign in, send and receive, and
                whether common email-authentication signals are present. Some authentication checks
                depend on domain-level records such as SPF, DKIM and DMARC; those references are
                relevant to email security, but configuring DNS is not the primary MunchReach workflow.
              </p>
              <p>
                Authentication status and a successful connection do not guarantee delivery or inbox
                placement. Outcomes also depend on Recipient data, message quality, sender reputation,
                Sending Activity and receiver-side decisions.
              </p>
              <p>
                Infrastructure credentials, API keys and internal technical details are never shared
                on public pages.
              </p>
            </Doc>

            <Doc id="monitoring" title="Monitor Your Campaigns">
              <p>
                Outbound problems are cheap to fix early and expensive to fix late. Most of them
                announce themselves in the reporting within the first few hundred sends, so the habit
                worth building is checking early and often rather than reviewing at the end.
              </p>
              <p>The signals worth watching:</p>
              <Bullets
                items={[
                  "Sent — how much actually left, compared with what you planned",
                  "Delivered — accepted by the receiving system",
                  "Hard bounces — permanent failures that must be suppressed",
                  "Temporary failures — deferrals that may indicate throttling",
                  "Complaints — the most serious negative signal",
                  "Unsubscribes — a direct measure of relevance",
                  "Replies — including negative ones, which still carry information",
                  "Positive replies — the outcome the campaign actually exists for",
                  "Campaign errors — sends blocked by configuration or validation problems",
                  "Sending account health — per-mailbox limits, pauses and failures",
                ]}
              />
              <p>Patterns are more informative than single numbers:</p>
              <Bullets
                items={[
                  "High bounce rate — most likely a data-quality issue; pause and re-verify the affected segment",
                  "High complaint rate — usually targeting or message relevance rather than a technical fault",
                  "A large number of failures — often an infrastructure or provider issue, such as authentication or a limit being hit",
                  "Very low response with healthy delivery — a targeting, offer or messaging problem, not a deliverability one",
                  "Good results from one segment and poor from another — a list-source problem worth isolating",
                  "Metrics degrading over the course of a sequence — the follow-up cadence is probably too long or too frequent",
                ]}
              />
              <p>
                Compare like with like. A campaign to one industry will not match another, and a new
                mailbox will not match an established one. What matters is the direction of travel
                for a given campaign, and whether a change followed something you did.
              </p>
            </Doc>

            <Doc id="restrictions" title="When MunchReach May Restrict or Pause Sending">
              <p>
                MunchReach may restrict, pause or investigate sending activity when it is necessary
                to protect recipients, other customers, sending reputation, platform infrastructure,
                and the third-party provider relationships that delivery depends on. These measures
                are protective rather than punitive: their purpose is to stop a problem from
                compounding while it is understood.
              </p>
              <p>Activity that may trigger a review or restriction includes:</p>
              <Bullets
                items={[
                  "Excessive hard bounces, usually indicating an unverified or stale list",
                  "Excessive spam complaints across a campaign or mailbox",
                  "Repeated unsubscribe violations, including continuing to contact opted-out recipients",
                  "Suspicious sending behaviour, such as abrupt volume changes without an explanation",
                  "Abnormally high failure rates that suggest a configuration or list problem",
                  "Attempts to bypass suppression, including re-importing suppressed addresses",
                  "Sending to lists that are clearly inappropriate for the campaign or the platform",
                  "Deceptive or misleading campaigns, including false sender identity",
                  "Abuse of platform functionality, including automated misuse of product features",
                  "Activity that violates MunchReach policies or the applicable terms",
                  "Activity that creates significant provider or infrastructure risk",
                ]}
              />
              <p>
                The response is scaled to the situation. A campaign showing a rising bounce rate may
                simply be paused so the list can be cleaned. A single mailbox behaving abnormally may
                be limited while the rest of the workspace continues. Broader restrictions apply
                where the risk extends beyond one campaign, and in serious or repeated cases access
                may be limited for longer or permanently.
              </p>
              <p>
                Not every issue results in account termination, and most are resolved by correcting
                the underlying cause — cleaning a list, fixing authentication, tightening targeting,
                or reducing volume. Where a restriction is applied, the fastest route back is
                usually to address the signal that caused it rather than to restart the same campaign
                unchanged.
              </p>
            </Doc>

            <Doc id="responsibilities" title="Your Responsibilities as a MunchReach User">
              <p>
                MunchReach supplies the tooling and the platform-level protections. The decisions
                that determine whether a campaign is appropriate remain with you. Specifically, you
                are responsible for:
              </p>
              <ol className="ml-5 list-decimal space-y-2 marker:text-primary">
                <li>
                  <span className="text-foreground/90">Your contact sources</span> — knowing where
                  every list came from and whether that source permits your intended use.
                </li>
                <li>
                  <span className="text-foreground/90">Your data collection practices</span> — how
                  contact data is gathered, recorded and kept current.
                </li>
                <li>
                  <span className="text-foreground/90">Your prospect lists</span> — their accuracy,
                  relevance and hygiene before and during a campaign.
                </li>
                <li>
                  <span className="text-foreground/90">Your campaign content</span> — subject lines,
                  body copy, claims, personalisation and attachments.
                </li>
                <li>
                  <span className="text-foreground/90">Your sending practices</span> — volume,
                  cadence, ramp-up and follow-up limits.
                </li>
                <li>
                  <span className="text-foreground/90">Your unsubscribe handling</span> — offering a
                  working opt-out and honouring it promptly.
                </li>
                <li>
                  <span className="text-foreground/90">Your suppression lists</span> — keeping them
                  accurate and applying them across every campaign.
                </li>
                <li>
                  <span className="text-foreground/90">Your compliance with applicable laws</span> —
                  determining which requirements apply and meeting them.
                </li>
                <li>
                  <span className="text-foreground/90">Your use of third-party data</span> —
                  including licence terms and any restrictions attached to purchased data.
                </li>
                <li>
                  <span className="text-foreground/90">Your business claims</span> — ensuring
                  statements about your product, results and customers are accurate.
                </li>
                <li>
                  <span className="text-foreground/90">Your Email Accounts and Mailboxes</span> —
                  authorization, security, Mailbox Authentication and ongoing connection health.
                </li>
                <li>
                  <span className="text-foreground/90">Your account security</span> — access
                  control, credentials and who in your organisation can send.
                </li>
              </ol>
              <p>
                These obligations do not disappear because a task is automated. A sequence that runs
                without supervision is still your campaign, and a list imported by a colleague is
                still your list.
              </p>
              <Callout tone="warn">
                Using MunchReach does not transfer legal or regulatory responsibility for your
                campaigns to MunchReach.
              </Callout>
            </Doc>

            <Doc id="prohibited" title="Prohibited and High-Risk Uses">
              <p>
                Some activity is never acceptable on the platform, regardless of how a campaign is
                configured. The following uses are prohibited:
              </p>
              <Bullets
                items={[
                  "Fraudulent outreach of any kind",
                  "Phishing, or messages designed to trick recipients into disclosing information",
                  "Impersonating another person, business, brand or institution",
                  "Distributing malware, or linking to content that distributes it",
                  "Credential theft, including fake login pages and lookalike domains",
                  "Deceptive campaigns that misrepresent the sender, the offer or the purpose",
                  "Spam campaigns sent to indiscriminate or purchased bulk lists",
                  "Sending to contacts that are suppressed",
                  "Deliberate abuse of unsubscribe mechanisms, including broken or hidden opt-outs",
                  "Repeatedly contacting people who have opted out",
                  "Misleading subject lines, including fabricated reply or forward prefixes",
                  "Using a false identity or a sender address intended to disguise who is sending",
                  "Promoting illegal products or services",
                  "Abuse of MunchReach infrastructure, including attempts to overload it",
                  "Attempts to circumvent platform restrictions, limits or protections",
                  "Activity that violates applicable third-party provider policies",
                ]}
              />
              <p>
                Alongside these, some activity is not automatically prohibited but carries elevated
                risk and attracts closer monitoring: sending at high volume from a newly connected Mailbox,
                importing very large lists that have never been verified, running many Mailboxes with
                near-identical content, and sequences with unusually aggressive follow-up. None of
                these are forbidden, but each raises the chance of triggering protective measures.
              </p>
              <p>
                Suspicious activity may be investigated, and sending may be restricted while that
                happens. Where activity appears to be deliberately abusive rather than a mistake,
                restrictions are applied without waiting for the damage to accumulate.
              </p>
            </Doc>

            <Doc id="checklist" title="MunchReach Compliance Checklist">
              <p>
                A working checklist for teams running outbound. Treat it as a routine rather than a
                one-off exercise.
              </p>
              <div className="grid gap-5">
                <ChecklistGroup
                  title="Before importing leads"
                  items={[
                    "I know where my contacts came from.",
                    "My contacts are relevant to my business purpose.",
                    "I have reviewed applicable legal requirements.",
                    "I have checked for duplicates.",
                    "I have checked my suppression list.",
                    "My data is reasonably current.",
                    "I understand how the list may be used.",
                  ]}
                />
                <ChecklistGroup
                  title="Before launching"
                  items={[
                    "Email addresses are verified.",
                    "Every Connected Mailbox is authorized and ready to send.",
                    "Mailbox Authentication has been reviewed, including domain-level records where applicable.",
                    "My message clearly identifies the sender.",
                    "My message is relevant to the recipient.",
                    "My unsubscribe process works.",
                    "My sending volume is reasonable.",
                    "My follow-up sequence has appropriate limits.",
                    "Bounce and complaint monitoring is enabled.",
                  ]}
                />
                <ChecklistGroup
                  title="During the campaign"
                  items={[
                    "I monitor bounce rates.",
                    "I monitor complaints.",
                    "I monitor unsubscribes.",
                    "I review replies.",
                    "I stop sending to suppressed contacts.",
                    "I investigate unusual sending behaviour.",
                    "I pause campaigns when serious problems appear.",
                  ]}
                />
                <ChecklistGroup
                  title="After the campaign"
                  items={[
                    "Suppression records remain respected.",
                    "Campaign performance is reviewed.",
                    "Poor-quality contacts are removed.",
                    "High-risk segments are reviewed.",
                    "Future campaigns are adjusted based on what was learned.",
                  ]}
                />
              </div>
            </Doc>

            <Doc id="faq" title="Frequently Asked Questions">
              <Accordion type="single" collapsible className="text-left">
                {faqs.map((f) => (
                  <AccordionItem key={f.q} value={f.q} className="border-b border-border/70">
                    <AccordionTrigger className="py-5 text-left text-base font-medium text-foreground hover:no-underline">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-6 text-sm leading-relaxed text-muted-foreground">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Doc>

            <Doc id="help" title="MunchReach Does Not Provide Legal Advice">
              <p>
                MunchReach provides software and compliance-oriented controls. The platform can
                suppress addresses, track bounces and complaints, apply sending limits and surface
                warning signals — but it does not determine whether a specific campaign is legally
                permitted, and nothing published here should be read as legal advice.
              </p>
              <p>
                Compliance requirements vary by jurisdiction, industry, recipient type and use case,
                and they change over time. Two customers using identical settings can have different
                obligations. For that reason, customers remain responsible for:
              </p>
              <Bullets
                items={[
                  "Understanding the laws and regulations that apply to their activities",
                  "Determining an appropriate legal basis where one is required",
                  "Using contact data that is accurate, relevant and appropriately obtained",
                  "Respecting opt-outs and maintaining suppression records",
                  "Following applicable third-party provider rules and sending requirements",
                  "Obtaining professional legal advice when a situation is unclear",
                ]}
              />
              <p>
                If you are unsure whether a campaign is appropriate, the safest sequence is to pause
                it, review the list and the messaging, and get advice before sending. Our support
                team can explain how the platform's controls behave; questions about your specific
                legal obligations should go to a qualified legal professional in the relevant
                jurisdiction.
              </p>
            </Doc>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="hero-glow surface-card px-5 py-10 text-center sm:px-6 sm:py-14">
          <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Have Questions About Using MunchReach Responsibly?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">
            Our support team can help you understand how MunchReach's platform controls work. For
            questions about your specific legal obligations, please consult a qualified legal
            professional.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link to="/help-center">Visit Help Center</Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <Link to="/contact-support">Contact Support</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
