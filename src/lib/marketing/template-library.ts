/**
 * Built-in marketing template library.
 *
 * Built-ins live in code, never in the database. That is what makes the
 * "built-in templates cannot be edited, deleted or overwritten" rule
 * structural rather than a permission check someone can get wrong: there is
 * no row to update. Admins duplicate a built-in, which writes a NEW custom
 * row in `marketing_templates` that they then own.
 *
 * Bodies use the shared block syntax understood by `renderMarketingEmail`:
 *   `# Heading`, `## Subheading`, `- bullet`, `::button Label|https://url`,
 *   blank-line separated paragraphs, and `{{variable}}` placeholders.
 */
import type { MarketingTemplate, TemplateCategory } from "./types";

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "user_education", label: "User Education" },
  { id: "free_user_activation", label: "Free User Activation" },
  { id: "customer_education", label: "Customer Education" },
  { id: "product_updates", label: "Product Updates" },
  { id: "customer_success", label: "Customer Success" },
  { id: "re_engagement", label: "Re-engagement" },
  { id: "conversion", label: "Conversion" },
  { id: "retention", label: "Retention" },
  { id: "newsletter", label: "Newsletter" },
  { id: "promotional", label: "Promotional" },
];

export function categoryLabel(id: string): string {
  return TEMPLATE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

type Spec = {
  key: string;
  name: string;
  category: TemplateCategory;
  subject: string;
  preview: string;
  body: string;
};

const APP = "::button Open MunchReach|https://munchreach.com/dashboard";

function lesson(title: string, intro: string, points: string[], close: string): string {
  return [
    `# ${title}`,
    "Hi {{first_name}},",
    intro,
    ...points.map((p) => `- ${p}`),
    close,
    APP,
  ].join("\n\n");
}

const SPECS: Spec[] = [
  /* ------------------------------------------------------------- welcome */
  {
    key: "welcome-to-munchreach",
    name: "Welcome to MunchReach",
    category: "welcome",
    subject: "Welcome to MunchReach, {{first_name}}",
    preview: "Everything you need to send your first campaign.",
    body: lesson(
      "Welcome to MunchReach",
      "You now have sending, warmup, a unified inbox, a CRM and analytics in one workspace. Here is the shortest path to your first reply:",
      [
        "Connect a mailbox and pass domain authentication.",
        "Turn on warmup so reputation builds from day one.",
        "Import a small, well-targeted list before a large one.",
        "Write a three-step sequence and run a test send.",
      ],
      "Reply to this email if anything is unclear — a real person reads it.",
    ),
  },
  {
    key: "welcome-newsletter",
    name: "Welcome Newsletter",
    category: "welcome",
    subject: "You're on the list",
    preview: "Practical outbound guidance, twice a month.",
    body: lesson(
      "You're on the list",
      "Thanks for subscribing, {{first_name}}. Every issue covers one concrete outbound problem and how to fix it.",
      [
        "Deliverability that survives volume.",
        "Sequences that earn replies rather than opens.",
        "Reporting you can act on.",
      ],
      "No fluff, no daily sends — you can unsubscribe at any time.",
    ),
  },
  {
    key: "getting-started",
    name: "Getting Started",
    category: "welcome",
    subject: "Your MunchReach setup checklist",
    preview: "Five steps to a live campaign.",
    body: lesson(
      "Your setup checklist",
      "Work through these in order — each one unblocks the next.",
      [
        "Add your sending domain and complete SPF, DKIM and DMARC.",
        "Connect at least one mailbox.",
        "Start warmup and leave it running.",
        "Import a list with the fields your templates use.",
        "Build a sequence and check the variable report.",
      ],
      "Most teams finish this in an afternoon.",
    ),
  },
  {
    key: "your-first-steps",
    name: "Your First Steps",
    category: "welcome",
    subject: "First steps inside MunchReach",
    preview: "Where to click first.",
    body: lesson(
      "First steps",
      "A quick orientation so nothing feels hidden:",
      [
        "Campaigns — build sequences, schedules and audiences.",
        "Inbox — every reply from every mailbox in one thread view.",
        "CRM — pipeline that updates itself from replies.",
        "Analytics — sent, delivered, opened and replied, per mailbox.",
      ],
      "Explore in that order and the product will make sense quickly.",
    ),
  },
  {
    key: "resource-delivery",
    name: "Resource Delivery",
    category: "welcome",
    subject: "Here's your download",
    preview: "The resource you requested.",
    body: [
      "# Your resource is ready",
      "Hi {{first_name}},",
      "Thanks for requesting it — the link below is yours to keep.",
      "::button Get the resource|https://munchreach.com/resources",
      "If you have questions after reading it, just reply.",
    ].join("\n\n"),
  },

  /* ------------------------------------------------------ user education */
  {
    key: "edu-first-campaign",
    name: "How to Create Your First Campaign",
    category: "user_education",
    subject: "How to create your first campaign",
    preview: "From empty workspace to scheduled send.",
    body: lesson(
      "Create your first campaign",
      "A campaign is an audience, a sequence and a schedule. Get those three right and the rest follows.",
      [
        "Pick a narrow audience — 100 well-matched leads beats 5,000 vague ones.",
        "Write three steps: a reason to reply, a different angle, a short close.",
        "Set sending days, a window and a daily limit per mailbox.",
        "Run the readiness check before launching.",
      ],
      "Launch small, read the replies, then scale what works.",
    ),
  },
  {
    key: "edu-icp",
    name: "How to Build a Good ICP",
    category: "user_education",
    subject: "Build an ICP that actually converts",
    preview: "Targeting beats copy every time.",
    body: lesson(
      "Building a good ICP",
      "Nothing rescues a bad list. Define your ideal customer profile before writing a word:",
      [
        "Which companies already got value from you fastest?",
        "What trigger makes the problem urgent this quarter?",
        "Who feels the pain, and who signs?",
        "What disqualifies a prospect immediately?",
      ],
      "Write the answers down and filter every list against them.",
    ),
  },
  {
    key: "edu-better-cold-emails",
    name: "How to Write Better Cold Emails",
    category: "user_education",
    subject: "Write cold emails people answer",
    preview: "Short, specific, one ask.",
    body: lesson(
      "Writing better cold emails",
      "The best-performing cold emails share the same shape:",
      [
        "One specific observation about them, not about you.",
        "One sentence on the outcome you create.",
        "One low-friction ask.",
        "No attachments, no images, no walls of text.",
      ],
      "If the email cannot be read on a phone in ten seconds, cut it.",
    ),
  },
  {
    key: "edu-cold-email-fundamentals",
    name: "Cold Email Fundamentals",
    category: "user_education",
    subject: "Cold email fundamentals",
    preview: "The rules that do not change.",
    body: lesson(
      "Cold email fundamentals",
      "Tools change, fundamentals do not:",
      [
        "Authenticate every sending domain.",
        "Warm every mailbox before it carries volume.",
        "Keep daily volume per mailbox conservative.",
        "Remove bounces and complaints immediately.",
        "Make unsubscribing easy and instant.",
      ],
      "Every one of these is enforced for you inside MunchReach.",
    ),
  },
  {
    key: "edu-deliverability-basics",
    name: "Deliverability Basics",
    category: "user_education",
    subject: "Deliverability basics every sender needs",
    preview: "Reach the inbox, not the folder.",
    body: lesson(
      "Deliverability basics",
      "Deliverability is mostly discipline, not tricks:",
      [
        "SPF, DKIM and DMARC on every sending domain.",
        "A warmup ramp that lasts weeks, not days.",
        "Volume split across mailboxes with per-mailbox caps.",
        "Clean lists — verified addresses, no scraped junk.",
      ],
      "MunchReach blocks a launch until authentication passes for exactly this reason.",
    ),
  },
  {
    key: "edu-follow-up-strategy",
    name: "Follow-Up Strategy",
    category: "user_education",
    subject: "Most replies come from follow-ups",
    preview: "How many, how far apart, and when to stop.",
    body: lesson(
      "Follow-up strategy",
      "First touches rarely win. Design the follow-ups deliberately:",
      [
        "Three to four steps is usually the sweet spot.",
        "Leave two to four working days between them.",
        "Change the angle each time — never resend the same pitch.",
        "Stop instantly on a reply, an unsubscribe or a bounce.",
      ],
      "MunchReach cancels the rest of the sequence automatically when a prospect engages.",
    ),
  },
  {
    key: "edu-reply-management",
    name: "Reply Management",
    category: "user_education",
    subject: "Handle replies before they go cold",
    preview: "Speed is the whole game.",
    body: lesson(
      "Reply management",
      "Interest decays fast. Build a routine:",
      [
        "Answer positive replies within a few hours.",
        "Reply from the mailbox that sent, so the thread stays intact.",
        "Move the contact to the right pipeline stage immediately.",
        "Log objections — they are your next campaign's copy.",
      ],
      "The unified inbox puts every reply and its contact record on one screen.",
    ),
  },
  {
    key: "edu-campaign-optimization",
    name: "Campaign Optimization",
    category: "user_education",
    subject: "Optimize a campaign that is already running",
    preview: "Change one thing at a time.",
    body: lesson(
      "Optimizing a live campaign",
      "Use the funnel to find the actual bottleneck:",
      [
        "Low delivered — a deliverability or list problem.",
        "Delivered but no opens — subject lines and sender reputation.",
        "Opens but no replies — the offer or the ask.",
        "Replies but no meetings — qualification and follow-through.",
      ],
      "Fix the earliest broken stage first; later stages cannot compensate.",
    ),
  },
  {
    key: "edu-personalization",
    name: "Email Personalization",
    category: "user_education",
    subject: "Personalization that is worth the effort",
    preview: "Relevance beats first-name tokens.",
    body: lesson(
      "Personalization done properly",
      "A merge tag is not personalization. Relevance is:",
      [
        "Reference a real trigger — hiring, launch, funding, expansion.",
        "Tie it to a specific outcome for their role.",
        "Keep it to one sentence.",
        "Always test with the variable report so nothing renders empty.",
      ],
      "AI personalization in MunchReach can draft this per lead at list scale.",
    ),
  },
  {
    key: "edu-outbound-best-practices",
    name: "Outbound Best Practices",
    category: "user_education",
    subject: "Outbound best practices",
    preview: "What consistently works.",
    body: lesson(
      "Outbound best practices",
      "The habits behind consistent pipeline:",
      [
        "Small, sharply targeted lists refreshed weekly.",
        "Steady daily volume rather than bursts.",
        "One clear offer per campaign.",
        "Weekly review of the funnel, not daily panic.",
      ],
      "Consistency compounds; volume alone does not.",
    ),
  },

  /* ------------------------------------------------ free user activation */
  {
    key: "activation-complete-setup",
    name: "Complete Your Setup",
    category: "free_user_activation",
    subject: "Your MunchReach setup is almost done",
    preview: "A few minutes to finish.",
    body: lesson(
      "Finish your setup",
      "You are close. What is left:",
      ["Verify your sending domain.", "Connect a mailbox.", "Start warmup."],
      "Once those are green you can launch a campaign the same day.",
    ),
  },
  {
    key: "activation-connect-mailbox",
    name: "Connect Your Mailbox",
    category: "free_user_activation",
    subject: "Connect a mailbox to start sending",
    preview: "Two minutes, then you're live.",
    body: lesson(
      "Connect your mailbox",
      "MunchReach sends from your own accounts, so nothing happens until one is connected.",
      [
        "Add SMTP/IMAP details or connect through your provider.",
        "Complete SPF, DKIM and DMARC on the domain.",
        "Warmup begins automatically once the mailbox is healthy.",
      ],
      "You keep full control of the mailbox and the domain.",
    ),
  },
  {
    key: "activation-create-campaign",
    name: "Create Your First Campaign",
    category: "free_user_activation",
    subject: "Ready to build your first campaign?",
    preview: "Audience, sequence, schedule.",
    body: lesson(
      "Build your first campaign",
      "You have a mailbox connected — the next step is a campaign:",
      ["Import a short list.", "Write three sequence steps.", "Pick sending days and a window."],
      "The readiness check will tell you if anything is missing before launch.",
    ),
  },
  {
    key: "activation-launch-campaign",
    name: "Launch Your First Campaign",
    category: "free_user_activation",
    subject: "Your campaign is ready to launch",
    preview: "One click away.",
    body: lesson(
      "Launch when you're ready",
      "Your campaign passed the readiness checks. Before you press launch:",
      [
        "Send a test to yourself and read it on a phone.",
        "Confirm no variable renders empty.",
        "Start at a conservative daily limit.",
      ],
      "You can pause at any time without losing the queue.",
    ),
  },
  {
    key: "activation-campaign-ready",
    name: "Your Campaign Is Ready",
    category: "free_user_activation",
    subject: "Your campaign is live",
    preview: "Here's what happens next.",
    body: lesson(
      "Your campaign is live",
      "Sending follows your schedule, timezone and per-mailbox limits. From here:",
      [
        "Watch delivered and bounce rates for the first two days.",
        "Answer replies from the unified inbox.",
        "Increase volume only once the numbers hold.",
      ],
      "Nothing sends outside the window you configured.",
    ),
  },
  {
    key: "activation-first-reply",
    name: "Your First Reply",
    category: "free_user_activation",
    subject: "You got your first reply 🎉",
    preview: "Now make it count.",
    body: lesson(
      "Your first reply",
      "This is the moment outbound becomes pipeline. Do these three things:",
      [
        "Answer quickly, from the same mailbox.",
        "Move the contact into the right pipeline stage.",
        "Note the objection or interest signal for future copy.",
      ],
      "The rest of the sequence for that contact stopped automatically.",
    ),
  },
  {
    key: "activation-more-from-free",
    name: "Get More From Your Free Account",
    category: "free_user_activation",
    subject: "Getting more from your free account",
    preview: "Features you may not have tried.",
    body: lesson(
      "More from your free account",
      "Things free accounts often miss:",
      [
        "Warmup runs continuously, not just at setup.",
        "The unified inbox works across every connected mailbox.",
        "Analytics separate today, this run and lifetime.",
      ],
      "All of it is available before you pay anything.",
    ),
  },

  /* --------------------------------------------------- customer education */
  {
    key: "cust-advanced-features",
    name: "Advanced MunchReach Features",
    category: "customer_education",
    subject: "Advanced features you're not using yet",
    preview: "Depth beyond the basics.",
    body: lesson(
      "Advanced features",
      "Worth an hour of your time:",
      [
        "Per-step A/B variants inside sequences.",
        "Visual automations with conditions and waits.",
        "Workspace roles for clients and analysts.",
        "The public API and signed webhooks.",
      ],
      "Each one removes recurring manual work.",
    ),
  },
  {
    key: "cust-campaign-optimization",
    name: "Campaign Optimization",
    category: "customer_education",
    subject: "Squeeze more from your existing campaigns",
    preview: "Optimization for live programmes.",
    body: lesson(
      "Optimizing at scale",
      "Once several campaigns run at once:",
      [
        "Compare reply rate per audience, not per campaign.",
        "Rotate copy angles quarterly.",
        "Retire mailboxes with declining delivery.",
        "Keep suppression lists shared across the workspace.",
      ],
      "Small structural fixes beat rewriting copy again.",
    ),
  },
  {
    key: "cust-unibox",
    name: "UniBox Education",
    category: "customer_education",
    subject: "Master the unified inbox",
    preview: "Reply faster, lose nothing.",
    body: lesson(
      "Master the unified inbox",
      "The inbox is a three-panel workspace:",
      [
        "Left — conversations across every mailbox.",
        "Centre — the thread, answered from the original account.",
        "Right — the contact record, notes and stage.",
      ],
      "Collapse either side panel when you want to focus.",
    ),
  },
  {
    key: "cust-automation",
    name: "Automation Education",
    category: "customer_education",
    subject: "Automate the work after the reply",
    preview: "Triggers, conditions, actions, waits.",
    body: lesson(
      "Automation education",
      "Automations run server-side and keep working when your browser is closed:",
      [
        "Trigger on replies, bounces, stage changes or campaign events.",
        "Branch on conditions.",
        "Act: tag, move stage, notify, create a task.",
        "Inspect the run history when something misfires.",
      ],
      "Start with one automation, not ten.",
    ),
  },
  {
    key: "cust-analytics",
    name: "Analytics Education",
    category: "customer_education",
    subject: "Read your outbound numbers properly",
    preview: "Today vs run vs lifetime.",
    body: lesson(
      "Analytics education",
      "Three different questions need three different numbers:",
      [
        "Today — is the schedule actually sending?",
        "Current run — is this campaign pacing correctly?",
        "Lifetime — is the programme improving?",
      ],
      "Warmup traffic is excluded from every campaign figure.",
    ),
  },
  {
    key: "cust-api",
    name: "API Education",
    category: "customer_education",
    subject: "Build on the MunchReach API",
    preview: "Scoped keys, cursors, idempotency.",
    body: lesson(
      "Using the API",
      "The public REST API v1 covers campaigns, contacts, replies, analytics and webhooks:",
      [
        "Scoped bearer keys — grant only what the integration needs.",
        "Cursor pagination on every list endpoint.",
        "Idempotency keys on writes.",
        "A published OpenAPI specification.",
      ],
      "Full reference: munchreach.com/api-docs",
    ),
  },
  {
    key: "cust-integrations",
    name: "Integration Education",
    category: "customer_education",
    subject: "Connect MunchReach to your stack",
    preview: "CRM, enrichment, workflows.",
    body: lesson(
      "Integrations",
      "Outbound rarely lives alone:",
      [
        "Sync contacts and replies to your CRM.",
        "Push events to your warehouse through webhooks.",
        "Watch connection health so a broken sync is visible.",
      ],
      "Every integration reports its last successful sync.",
    ),
  },
  {
    key: "cust-advanced-workflow",
    name: "Advanced Workflow Education",
    category: "customer_education",
    subject: "Advanced outbound workflows",
    preview: "How mature teams run this.",
    body: lesson(
      "Advanced workflows",
      "What separates a programme from a campaign:",
      [
        "Separate workspaces per brand or client.",
        "Standard sequence templates the team reuses.",
        "A weekly funnel review with owners.",
        "Automations handling everything after the reply.",
      ],
      "Process beats effort once volume grows.",
    ),
  },

  /* --------------------------------------------------- product updates */
  {
    key: "update-whats-new",
    name: "What's New",
    category: "product_updates",
    subject: "What's new in MunchReach",
    preview: "This month's improvements.",
    body: lesson(
      "What's new",
      "Recent improvements across the product:",
      ["Faster campaign scheduling.", "Clearer delivery reporting.", "Inbox performance work."],
      "Full details are in the changelog.",
    ),
  },
  {
    key: "update-feature-announcement",
    name: "Feature Announcement",
    category: "product_updates",
    subject: "New in MunchReach: {{feature_name}}",
    preview: "A new capability is live.",
    body: lesson(
      "A new feature is live",
      "Here is what it does and why it exists:",
      ["What changed.", "Who it helps.", "How to switch it on."],
      "It is available in your workspace now.",
    ),
  },
  {
    key: "update-product-update",
    name: "Product Update",
    category: "product_updates",
    subject: "Product update",
    preview: "Improvements and fixes.",
    body: lesson(
      "Product update",
      "This release focuses on reliability:",
      ["Scheduler accuracy.", "Delivery event handling.", "Reporting precision."],
      "No action is needed on your side.",
    ),
  },
  {
    key: "update-new-integration",
    name: "New Integration",
    category: "product_updates",
    subject: "New integration available",
    preview: "Connect another tool.",
    body: lesson(
      "New integration",
      "You can now connect another tool to MunchReach:",
      ["Two-way contact sync.", "Reply events pushed as they happen.", "Health monitoring."],
      "Set it up from Integrations in your workspace.",
    ),
  },
  {
    key: "update-new-automation",
    name: "New Automation",
    category: "product_updates",
    subject: "New automation capabilities",
    preview: "More triggers and actions.",
    body: lesson(
      "New automation capabilities",
      "The automation builder gained new building blocks:",
      ["More triggers.", "Richer conditions.", "Clearer run history."],
      "Existing automations keep running unchanged.",
    ),
  },
  {
    key: "update-new-analytics",
    name: "New Analytics Feature",
    category: "product_updates",
    subject: "Better outbound analytics",
    preview: "New reporting.",
    body: lesson(
      "New analytics",
      "Reporting improvements now live:",
      ["Sharper funnel breakdowns.", "Per-mailbox drill-down.", "Cleaner today vs lifetime split."],
      "Open Analytics to see it.",
    ),
  },
  {
    key: "update-api-release",
    name: "API Release",
    category: "product_updates",
    subject: "API update",
    preview: "New endpoints and improvements.",
    body: lesson(
      "API release",
      "The public API has been extended:",
      ["New endpoints.", "Improved pagination.", "Updated OpenAPI specification."],
      "Existing integrations continue to work.",
    ),
  },

  /* -------------------------------------------------- customer success */
  {
    key: "success-customer-story",
    name: "Customer Story",
    category: "customer_success",
    subject: "How one team runs outbound on MunchReach",
    preview: "A look inside a working setup.",
    body: lesson(
      "A customer's setup",
      "A short look at how another team structures their programme:",
      [
        "Narrow audiences, refreshed weekly.",
        "Conservative per-mailbox limits.",
        "Every reply answered same day.",
      ],
      "Simple, repeatable, and it holds up at volume.",
    ),
  },
  {
    key: "success-case-study",
    name: "Case Study",
    category: "customer_success",
    subject: "Case study: outbound that scales",
    preview: "What worked and what did not.",
    body: lesson(
      "Case study",
      "The changes that mattered most:",
      ["Tighter ICP.", "Follow-ups with new angles.", "Reply handling inside one inbox."],
      "Read the full write-up on our site.",
    ),
  },
  {
    key: "success-results-story",
    name: "Results Story",
    category: "customer_success",
    subject: "From setup to first meetings",
    preview: "A realistic timeline.",
    body: lesson(
      "From setup to meetings",
      "A realistic sequence of events for a new programme:",
      ["Week one — domains, mailboxes, warmup.", "Week two — first campaign.", "Week three — replies and iteration."],
      "Patience during warmup is what makes weeks three onward work.",
    ),
  },
  {
    key: "success-best-practices",
    name: "Best Practices",
    category: "customer_success",
    subject: "Best practices from our customers",
    preview: "Patterns across successful teams.",
    body: lesson(
      "Best practices",
      "Patterns we see repeatedly:",
      ["Fewer, better lists.", "Consistent daily volume.", "Fast reply handling.", "Weekly funnel reviews."],
      "None of it is complicated; all of it is consistent.",
    ),
  },
  {
    key: "success-customer-tips",
    name: "Customer Tips",
    category: "customer_success",
    subject: "Five tips from experienced senders",
    preview: "Small changes, real impact.",
    body: lesson(
      "Tips from experienced senders",
      "Quick wins worth trying this week:",
      [
        "Cut your first email in half.",
        "Add one specific trigger to each opener.",
        "Split volume across one more mailbox.",
        "Review bounces every Monday.",
        "Archive campaigns you are no longer reading.",
      ],
      "Try one, not all five.",
    ),
  },

  /* ---------------------------------------------------- re-engagement */
  {
    key: "reengage-we-miss-you",
    name: "We Miss You",
    category: "re_engagement",
    subject: "We haven't seen you in a while",
    preview: "Your workspace is still here.",
    body: lesson(
      "We haven't seen you in a while",
      "Your workspace, mailboxes and lists are exactly where you left them.",
      ["Nothing was deleted.", "Warmup can resume immediately.", "Your sequences are still saved."],
      "If something got in the way, reply and tell us — we read every response.",
    ),
  },
  {
    key: "reengage-account-waiting",
    name: "Your Account Is Waiting",
    category: "re_engagement",
    subject: "Your MunchReach account is waiting",
    preview: "Pick up where you left off.",
    body: lesson(
      "Pick up where you left off",
      "Getting restarted takes minutes:",
      ["Check mailbox health.", "Restart warmup.", "Resume or duplicate an old campaign."],
      "No reconfiguration needed.",
    ),
  },
  {
    key: "reengage-what-you-missed",
    name: "What You Missed",
    category: "re_engagement",
    subject: "What you missed in MunchReach",
    preview: "Improvements since your last visit.",
    body: lesson(
      "What you missed",
      "Since you were last active:",
      ["Scheduling accuracy improvements.", "A rebuilt unified inbox.", "Clearer campaign analytics."],
      "All of it is already in your workspace.",
    ),
  },
  {
    key: "reengage-since-you-left",
    name: "What's New Since You Left",
    category: "re_engagement",
    subject: "A lot has changed",
    preview: "The short version.",
    body: lesson(
      "What's changed",
      "The highlights, briefly:",
      ["Better deliverability guardrails.", "Automations that run server-side.", "A public API and webhooks."],
      "Worth ten minutes to look again.",
    ),
  },
  {
    key: "reengage-come-back",
    name: "Come Back to MunchReach",
    category: "re_engagement",
    subject: "Restart your outbound this week",
    preview: "A simple plan to restart.",
    body: lesson(
      "Restart this week",
      "A three-day plan:",
      ["Day one — mailbox health and warmup.", "Day two — a fresh 100-lead list.", "Day three — launch a three-step sequence."],
      "Small and consistent beats a big relaunch.",
    ),
  },
  {
    key: "reengage-need-help",
    name: "Need Help?",
    category: "re_engagement",
    subject: "Can we help with anything?",
    preview: "Tell us what got in the way.",
    body: [
      "# Can we help?",
      "Hi {{first_name}},",
      "If something blocked you — setup, deliverability, or simply time — reply to this email and tell us. We would rather fix the problem than send you another tip.",
      APP,
    ].join("\n\n"),
  },

  /* -------------------------------------------------------- conversion */
  {
    key: "convert-free-to-paid",
    name: "Free to Paid",
    category: "conversion",
    subject: "Ready for more sending capacity?",
    preview: "When upgrading makes sense.",
    body: lesson(
      "When upgrading makes sense",
      "Upgrade when one of these is true:",
      ["You need more mailboxes or daily volume.", "You want more workspaces or seats.", "You need higher API limits."],
      "If none apply yet, stay on free — we would rather you upgrade when it pays for itself.",
    ),
  },
  {
    key: "convert-upgrade-education",
    name: "Upgrade Education",
    category: "conversion",
    subject: "What changes when you upgrade",
    preview: "An honest breakdown.",
    body: lesson(
      "What changes on a paid plan",
      "Concretely:",
      ["Higher sending capacity.", "More mailboxes and workspaces.", "Larger API and webhook allowances."],
      "Current pricing is always on our pricing page.",
    ),
  },
  {
    key: "convert-why-upgrade",
    name: "Why Customers Upgrade",
    category: "conversion",
    subject: "Why teams move to a paid plan",
    preview: "The three usual reasons.",
    body: lesson(
      "Why teams upgrade",
      "Almost always one of these:",
      ["Volume outgrew the free limits.", "They added clients or brands.", "They automated outbound through the API."],
      "If that sounds like this quarter, it is probably time.",
    ),
  },
  {
    key: "convert-feature-based",
    name: "Feature-Based Upgrade",
    category: "conversion",
    subject: "The feature you're looking for",
    preview: "Available on a paid plan.",
    body: lesson(
      "Unlock the capability you need",
      "You recently hit a limit. On a paid plan:",
      ["More capacity for the thing you tried.", "No change to how your existing setup works."],
      "Nothing in your workspace is reconfigured when you upgrade.",
    ),
  },
  {
    key: "convert-annual-plan",
    name: "Annual Plan",
    category: "conversion",
    subject: "Switching to annual billing",
    preview: "Fewer invoices, simpler planning.",
    body: lesson(
      "Annual billing",
      "If MunchReach is now part of how you operate:",
      ["One invoice instead of twelve.", "Easier budgeting.", "Same product, same limits."],
      "Change billing frequency any time in Settings.",
    ),
  },
  {
    key: "convert-product-value",
    name: "Product Value",
    category: "conversion",
    subject: "What MunchReach replaces",
    preview: "Count your tools.",
    body: lesson(
      "What MunchReach replaces",
      "A typical outbound stack is four or five subscriptions:",
      ["A sender.", "A warmup service.", "A workflow automation tool.", "A reporting sheet."],
      "Consolidating them is usually the real saving.",
    ),
  },

  /* --------------------------------------------------------- retention */
  {
    key: "retain-customer-welcome",
    name: "Customer Welcome",
    category: "retention",
    subject: "Welcome to your paid MunchReach plan",
    preview: "Here's what's now available.",
    body: lesson(
      "Welcome aboard",
      "Thanks for upgrading, {{first_name}}. Your plan is active and your capacity has increased:",
      ["Higher sending limits.", "More mailboxes and workspaces.", "Priority support."],
      "Reply here any time you need help.",
    ),
  },
  {
    key: "retain-getting-more-value",
    name: "Getting More Value",
    category: "retention",
    subject: "Getting more from your plan",
    preview: "Capacity you may not be using.",
    body: lesson(
      "Getting more value",
      "Most teams under-use two things:",
      ["Additional mailboxes for safer volume distribution.", "Automations for post-reply follow-through."],
      "Both are included in what you already pay for.",
    ),
  },
  {
    key: "retain-monthly-update",
    name: "Monthly Customer Update",
    category: "retention",
    subject: "Your monthly MunchReach update",
    preview: "Product news and tips.",
    body: lesson(
      "Monthly update",
      "This month:",
      ["Product changes worth knowing.", "One optimization tip.", "One customer pattern."],
      "Short by design.",
    ),
  },
  {
    key: "retain-advanced-tips",
    name: "Advanced Tips",
    category: "retention",
    subject: "Advanced tips for experienced senders",
    preview: "For teams past the basics.",
    body: lesson(
      "Advanced tips",
      "If your programme is stable, try these:",
      ["Test one structural change per month.", "Segment reporting by audience.", "Retire underperforming mailboxes deliberately."],
      "Stability first, then experiments.",
    ),
  },
  {
    key: "retain-product-education",
    name: "Product Education",
    category: "retention",
    subject: "One feature worth ten minutes",
    preview: "A focused walkthrough.",
    body: lesson(
      "One feature worth learning",
      "A short walkthrough of a capability most customers overlook:",
      ["What it does.", "When to use it.", "How to set it up."],
      "Ten minutes now saves hours later.",
    ),
  },

  /* --------------------------------------------------------- newsletter */
  {
    key: "news-weekly",
    name: "Weekly Newsletter",
    category: "newsletter",
    subject: "The MunchReach Weekly",
    preview: "This week in outbound.",
    body: lesson(
      "The MunchReach Weekly",
      "This week:",
      ["One tactic that is working.", "One mistake to avoid.", "One product improvement."],
      "See you next week.",
    ),
  },
  {
    key: "news-monthly",
    name: "Monthly Newsletter",
    category: "newsletter",
    subject: "The MunchReach Monthly",
    preview: "A month of outbound, summarised.",
    body: lesson(
      "The MunchReach Monthly",
      "The month in review:",
      ["Product changes.", "Deliverability notes.", "What customers are testing."],
      "Reply with what you would like covered next month.",
    ),
  },
  {
    key: "news-cold-email-tips",
    name: "Cold Email Tips",
    category: "newsletter",
    subject: "Three cold email tips",
    preview: "Short and usable.",
    body: lesson(
      "Three tips",
      "Usable this week:",
      ["Cut the first paragraph.", "Make the ask smaller.", "Follow up with a new angle, not a nudge."],
      "Try one and measure it.",
    ),
  },
  {
    key: "news-gtm-insights",
    name: "GTM Insights",
    category: "newsletter",
    subject: "GTM insights",
    preview: "Go-to-market notes.",
    body: lesson(
      "GTM insights",
      "What we are seeing across outbound teams:",
      ["Narrower targeting.", "Fewer, better-run campaigns.", "More consolidation of tools."],
      "Details and reasoning below.",
    ),
  },
  {
    key: "news-outbound-digest",
    name: "Outbound Digest",
    category: "newsletter",
    subject: "Outbound digest",
    preview: "Worth reading this week.",
    body: lesson(
      "Outbound digest",
      "A short roundup:",
      ["Deliverability news.", "A tactic worth testing.", "A reporting idea."],
      "Curated, not comprehensive.",
    ),
  },
  {
    key: "news-industry-insights",
    name: "Industry Insights",
    category: "newsletter",
    subject: "Industry insights",
    preview: "What's changing in email.",
    body: lesson(
      "Industry insights",
      "Changes worth tracking:",
      ["Mailbox provider policy shifts.", "Authentication requirements.", "Buyer behaviour in cold channels."],
      "We will flag anything that requires action.",
    ),
  },

  /* -------------------------------------------------------- promotional */
  {
    key: "promo-product-promotion",
    name: "Product Promotion",
    category: "promotional",
    subject: "A closer look at MunchReach",
    preview: "What the platform does.",
    body: lesson(
      "A closer look",
      "MunchReach covers the whole outbound motion:",
      ["Sending and warmup.", "Unified inbox and CRM.", "Automations and analytics."],
      "Start free and see it end to end.",
    ),
  },
  {
    key: "promo-special-offer",
    name: "Special Offer",
    category: "promotional",
    subject: "A limited offer for {{first_name}}",
    preview: "Details inside.",
    body: lesson(
      "A limited offer",
      "Details of the current offer:",
      ["What is included.", "Who it applies to.", "When it ends."],
      "Terms are on the pricing page.",
    ),
  },
  {
    key: "promo-launch",
    name: "Launch",
    category: "promotional",
    subject: "We're launching something",
    preview: "Available today.",
    body: lesson(
      "We're launching something",
      "Live from today:",
      ["What it is.", "Who it is for.", "How to try it."],
      "Feedback welcome — just reply.",
    ),
  },
  {
    key: "promo-event",
    name: "Event",
    category: "promotional",
    subject: "You're invited",
    preview: "Join us live.",
    body: lesson(
      "You're invited",
      "Join us for a live session:",
      ["What we will cover.", "Who should attend.", "How long it runs."],
      "Recording sent to everyone registered.",
    ),
  },
  {
    key: "promo-webinar",
    name: "Webinar",
    category: "promotional",
    subject: "Webinar: building an outbound programme",
    preview: "Live walkthrough plus Q&A.",
    body: lesson(
      "Webinar invitation",
      "A practical, no-slides walkthrough:",
      ["Domain and mailbox setup.", "Sequence structure.", "Reading the funnel.", "Live Q&A."],
      "Register with the button below.",
    ),
  },
  {
    key: "promo-limited",
    name: "Limited Promotion",
    category: "promotional",
    subject: "Ending soon",
    preview: "Last call.",
    body: lesson(
      "Ending soon",
      "A short reminder that the current promotion is closing:",
      ["What is included.", "The deadline."],
      "No further reminders after this one.",
    ),
  },
];

export const BUILT_IN_TEMPLATES: MarketingTemplate[] = SPECS.map((s) => ({
  id: `builtin:${s.key}`,
  key: s.key,
  name: s.name,
  category: s.category,
  subject: s.subject,
  previewText: s.preview,
  fromName: null,
  replyTo: null,
  body: s.body,
  builtIn: true,
}));

export function builtInTemplate(key: string): MarketingTemplate | null {
  return BUILT_IN_TEMPLATES.find((t) => t.key === key) ?? null;
}

/** True when the identifier addresses a built-in (and therefore read-only) template. */
export function isBuiltInTemplateId(id: string): boolean {
  return id.startsWith("builtin:") || BUILT_IN_TEMPLATES.some((t) => t.key === id);
}

/** The starting point for "Duplicate" — a detached, fully editable copy. */
export function duplicateTemplateDraft(
  source: MarketingTemplate,
  name?: string,
): Omit<MarketingTemplate, "id" | "builtIn" | "key"> {
  return {
    name: name?.trim() || `${source.name} (Copy)`,
    category: source.category,
    subject: source.subject,
    previewText: source.previewText,
    fromName: source.fromName,
    replyTo: source.replyTo,
    body: source.body,
    duplicatedFrom: source.key ?? source.id,
  };
}
