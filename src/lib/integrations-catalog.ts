/**
 * Static metadata for every integration MunchReach supports.
 *
 * The catalog is client-safe: it describes what an integration does, which
 * fields the customer must provide and how the connection is verified. The
 * secret values themselves never live here — they are encrypted server-side.
 */
import {
  Bot,
  CalendarClock,
  MessageSquare,
  Sheet,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type IntegrationCategory =
  | "ai"
  | "automation"
  | "crm"
  | "calendar"
  | "notifications"
  | "data";

export type IntegrationField = {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  /** Secret fields are encrypted at rest and never returned to the browser. */
  secret: boolean;
  required: boolean;
};

export type IntegrationMeta = {
  slug: string;
  name: string;
  category: IntegrationCategory;
  icon: LucideIcon;
  tagline: string;
  description: string;
  /** How the customer connects: API key/token, or an incoming webhook URL. */
  authType: "api_key" | "webhook";
  fields: IntegrationField[];
  /** MunchReach events this integration can receive. */
  events: string[];
  features: string[];
  steps: { title: string; text: string }[];
  faqs: { q: string; a: string }[];
  docsUrl: string;
  /**
   * Official brand mark key (see `BrandGlyph`). Omitted when no official asset
   * is available for that company — we never draw a look-alike logo.
   */
  brand?: string;
  /** Set when MunchReach can also receive data from the provider. */
  inbound?: boolean;
};

export const INTEGRATION_CATEGORIES: { id: IntegrationCategory; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "automation", label: "Automation" },
  { id: "crm", label: "CRM" },
  { id: "calendar", label: "Calendar" },
  { id: "notifications", label: "Notifications" },
  { id: "data", label: "Data" },
];

export const SENDLOOP_EVENTS = [
  "reply.received",
  "reply.positive",
  "lead.created",
  "campaign.completed",
  "meeting.booked",
  "email.bounced",
] as const;

export const INTEGRATIONS: IntegrationMeta[] = [
  {
    slug: "openai",
    name: "OpenAI",
    category: "ai",
    icon: Bot,
    tagline: "Generate and rewrite cold email copy with your own OpenAI key.",
    description:
      "Connect your OpenAI account to draft subject lines, rewrite sequences and summarise replies without leaving MunchReach. Your key is encrypted and used only for requests made from your workspace.",
    authType: "api_key",
    fields: [
      {
        key: "api_key",
        label: "OpenAI API key",
        placeholder: "sk-...",
        help: "Create a key at platform.openai.com → API keys.",
        secret: true,
        required: true,
      },
      {
        key: "model",
        label: "Default model",
        placeholder: "gpt-4o-mini",
        help: "Any chat model available to your account.",
        secret: false,
        required: false,
      },
    ],
    events: [],
    features: [
      "Draft new sequences from a short brief",
      "Rewrite steps for a different tone or length",
      "Summarise long reply threads before you answer",
    ],
    steps: [
      { title: "Create a key", text: "Generate an API key in your OpenAI dashboard." },
      { title: "Paste it in MunchReach", text: "Settings → Integrations → OpenAI → Connect." },
      { title: "Verified live", text: "MunchReach calls the OpenAI models endpoint to confirm the key works." },
    ],
    faqs: [
      { q: "Who pays for usage?", a: "You do — requests run against your own OpenAI account and key." },
      { q: "Is my key visible after saving?", a: "No. It is encrypted server-side and only the last characters are ever shown." },
    ],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    slug: "claude",
    name: "Claude",
    category: "ai",
    icon: Bot,
    brand: "claude",
    tagline: "Personalize outreach with Claude using your own Anthropic key.",
    description:
      "Connect your Anthropic account and MunchReach uses Claude to write the personalized opening line for every lead in a campaign, plus on-demand drafting and reply summaries. Your key is encrypted and used only for requests made from your workspace.",
    authType: "api_key",
    fields: [
      {
        key: "api_key",
        label: "Anthropic API key",
        placeholder: "sk-ant-...",
        help: "Create a key at console.anthropic.com → Settings → API keys.",
        secret: true,
        required: true,
      },
      {
        key: "model",
        label: "Default model",
        placeholder: "claude-haiku-4-5",
        help: "Any Claude model available to your account.",
        secret: false,
        required: false,
      },
    ],
    events: [],
    features: [
      "Per-lead AI personalization across a whole campaign",
      "Draft and rewrite sequence steps in your own tone",
      "Summarise long reply threads before you answer",
    ],
    steps: [
      { title: "Create a key", text: "Generate an API key in the Anthropic console." },
      { title: "Paste it in MunchReach", text: "Campaign → AI, or Settings → Integrations → Claude." },
      {
        title: "Verified live",
        text: "MunchReach calls the Anthropic models endpoint to confirm the key works.",
      },
    ],
    faqs: [
      { q: "Who pays for usage?", a: "You do — requests run against your own Anthropic account and key." },
      {
        q: "Is my key visible after saving?",
        a: "No. It is encrypted server-side and only the last characters are ever shown.",
      },
      {
        q: "Can I use Claude and OpenAI together?",
        a: "One AI provider is active per workspace for campaign personalization; you can switch at any time.",
      },
    ],
    docsUrl: "https://docs.anthropic.com/en/api/messages",
  },
  {
    slug: "slack",
    name: "Slack",
    category: "notifications",
    icon: MessageSquare,
    tagline: "Get positive replies and campaign alerts in a Slack channel.",
    description:
      "Send MunchReach events to any Slack channel using an incoming webhook. Your team sees interested replies within seconds instead of at the end of the day.",
    authType: "webhook",
    fields: [
      {
        key: "webhook_url",
        label: "Slack incoming webhook URL",
        placeholder: "https://hooks.slack.com/services/...",
        help: "Slack → Apps → Incoming Webhooks → Add to workspace.",
        secret: true,
        required: true,
      },
      {
        key: "channel_label",
        label: "Channel name (for your reference)",
        placeholder: "#sales-replies",
        secret: false,
        required: false,
      },
    ],
    events: ["reply.received", "reply.positive", "meeting.booked", "campaign.completed", "email.bounced"],
    features: [
      "Instant alerts for interested replies",
      "Campaign completion summaries",
      "Bounce and deliverability warnings",
    ],
    steps: [
      { title: "Create a webhook", text: "Add an incoming webhook to the channel you want alerts in." },
      { title: "Paste the URL", text: "Connect it in Settings → Integrations → Slack." },
      { title: "Send a test", text: "MunchReach posts a live test message to confirm delivery." },
    ],
    faqs: [
      { q: "Which channel receives alerts?", a: "Whichever channel the incoming webhook was created for." },
      { q: "Can I choose which events post?", a: "Yes — pick the events per connection in the integration settings." },
    ],
    docsUrl: "https://api.slack.com/messaging/webhooks",
  },
  {
    slug: "zapier",
    brand: "zapier",
    name: "Zapier",
    category: "automation",
    icon: Zap,
    tagline: "Trigger thousands of apps whenever something happens in MunchReach.",
    description:
      "Point MunchReach at a Zapier catch hook and every selected event is delivered as JSON. Zapier can also push data back into MunchReach through your private inbound URL.",
    authType: "webhook",
    fields: [
      {
        key: "webhook_url",
        label: "Zapier catch hook URL",
        placeholder: "https://hooks.zapier.com/hooks/catch/...",
        help: "Create a Zap with the “Webhooks by Zapier → Catch Hook” trigger.",
        secret: true,
        required: true,
      },
    ],
    events: ["reply.received", "reply.positive", "lead.created", "campaign.completed", "meeting.booked", "email.bounced"],
    features: [
      "Outbound JSON payload for every MunchReach event",
      "Private inbound URL to create leads from any Zap",
      "Full delivery log with retry",
    ],
    steps: [
      { title: "Create a catch hook", text: "Copy the webhook URL Zapier gives you." },
      { title: "Connect in MunchReach", text: "Paste the URL and choose the events to send." },
      { title: "Two-way", text: "Use your inbound URL in a Zap action to push leads into MunchReach." },
    ],
    faqs: [
      { q: "What does the payload look like?", a: "A JSON object with the event type, workspace, and the related lead, campaign or reply." },
      { q: "Is delivery retried?", a: "Failed deliveries are logged and can be retried from the integration event log." },
    ],
    docsUrl: "https://zapier.com/apps/webhook/integrations",
    inbound: true,
  },
  {
    slug: "make",
    brand: "make",
    name: "Make",
    category: "automation",
    icon: Workflow,
    tagline: "Build visual scenarios on top of MunchReach events.",
    description:
      "Send MunchReach events into a Make custom webhook and orchestrate the rest of your stack visually. Make can also call your private inbound URL to create leads.",
    authType: "webhook",
    fields: [
      {
        key: "webhook_url",
        label: "Make custom webhook URL",
        placeholder: "https://hook.eu2.make.com/...",
        help: "Add a “Custom webhook” trigger module in Make and copy its address.",
        secret: true,
        required: true,
      },
    ],
    events: ["reply.received", "reply.positive", "lead.created", "campaign.completed", "meeting.booked", "email.bounced"],
    features: ["Event-driven scenarios", "Inbound lead creation", "Delivery log with retry"],
    steps: [
      { title: "Add a custom webhook", text: "Create the trigger module in your Make scenario." },
      { title: "Connect in MunchReach", text: "Paste the address and select events." },
      { title: "Run it", text: "Send a test event and watch the scenario fire." },
    ],
    faqs: [
      { q: "Do I need a paid Make plan?", a: "No — custom webhooks work on the free plan too." },
      { q: "Can Make write back to MunchReach?", a: "Yes, through the private inbound URL shown after connecting." },
    ],
    docsUrl: "https://www.make.com/en/help/tools/webhooks",
    inbound: true,
  },
  {
    slug: "hubspot",
    brand: "hubspot",
    name: "HubSpot",
    category: "crm",
    icon: Users,
    tagline: "Sync replies, contacts and deals with your HubSpot pipeline.",
    description:
      "Connect a HubSpot private app token and MunchReach keeps your CRM in step: interested prospects become contacts, and every reply is written to the contact timeline.",
    authType: "api_key",
    fields: [
      {
        key: "access_token",
        label: "HubSpot private app token",
        placeholder: "pat-na1-...",
        help: "HubSpot → Settings → Integrations → Private Apps. Scopes: crm.objects.contacts.read/write.",
        secret: true,
        required: true,
      },
    ],
    events: ["reply.positive", "lead.created", "meeting.booked"],
    features: [
      "Create or update HubSpot contacts from MunchReach leads",
      "Log positive replies against the contact",
      "Keep pipeline owners in sync",
    ],
    steps: [
      { title: "Create a private app", text: "Grant the contacts read and write scopes." },
      { title: "Paste the token", text: "MunchReach verifies it against the HubSpot CRM API." },
      { title: "Choose events", text: "Pick which MunchReach events push to HubSpot." },
    ],
    faqs: [
      { q: "Will it create duplicates?", a: "No — contacts are matched on email address and updated in place." },
      { q: "Does it need a paid MunchReach plan?", a: "CRM sync is part of the paid plans." },
    ],
    docsUrl: "https://developers.hubspot.com/docs/api/private-apps",
  },
  {
    slug: "gohighlevel",
    name: "GoHighLevel",
    category: "crm",
    icon: Users,
    tagline: "Push interested prospects straight into GoHighLevel.",
    description:
      "Connect your GoHighLevel location API key so positive replies land as contacts in the right sub-account, ready for your pipeline automations.",
    authType: "api_key",
    fields: [
      {
        key: "api_key",
        label: "Location API key",
        placeholder: "eyJhbGciOi...",
        help: "GoHighLevel → Settings → Business Profile → API Key.",
        secret: true,
        required: true,
      },
      {
        key: "location_id",
        label: "Location ID",
        placeholder: "Optional — used for API v2 tokens",
        secret: false,
        required: false,
      },
    ],
    events: ["reply.positive", "lead.created", "meeting.booked"],
    features: ["Contacts created in the correct location", "Tagging by campaign", "Reply notes on the contact"],
    steps: [
      { title: "Copy the API key", text: "Take the key from the location you want to sync." },
      { title: "Connect", text: "MunchReach validates the key against the GoHighLevel API." },
      { title: "Select events", text: "Choose which replies should create contacts." },
    ],
    faqs: [
      { q: "Which locations are supported?", a: "Any location you hold an API key for — one connection per workspace." },
      { q: "Are tags applied?", a: "Yes, contacts are tagged with the MunchReach campaign name." },
    ],
    docsUrl: "https://highlevel.stoplight.io/docs/integrations",
  },
  {
    slug: "calendly",
    brand: "calendly",
    name: "Calendly",
    category: "calendar",
    icon: CalendarClock,
    tagline: "Track booked meetings from your outreach automatically.",
    description:
      "Connect a Calendly personal access token so MunchReach can attribute booked meetings back to the campaign and sequence step that produced them.",
    authType: "api_key",
    fields: [
      {
        key: "access_token",
        label: "Calendly personal access token",
        placeholder: "eyJraWQiOi...",
        help: "Calendly → Integrations → API & Webhooks → Personal access tokens.",
        secret: true,
        required: true,
      },
    ],
    events: ["meeting.booked"],
    features: ["Meeting attribution per campaign", "Booked-meeting alerts", "Meetings visible on the CRM contact"],
    steps: [
      { title: "Generate a token", text: "Create a personal access token in Calendly." },
      { title: "Connect", text: "MunchReach verifies it against the Calendly users endpoint." },
      { title: "Track meetings", text: "Bookings appear on the campaign analytics and the contact timeline." },
    ],
    faqs: [
      { q: "Do I need Calendly Pro?", a: "Personal access tokens are available on Calendly's paid plans." },
      { q: "How are meetings attributed?", a: "By matching the invitee email to a lead in your workspace." },
    ],
    docsUrl: "https://developer.calendly.com/getting-started",
  },
  {
    slug: "google-sheets",
    brand: "googlesheets",
    name: "Google Sheets",
    category: "data",
    icon: Sheet,
    tagline: "Export leads and campaign results into a live spreadsheet.",
    description:
      "Append MunchReach events to a Google Sheet through a Google Apps Script web app URL — no Google account connection or extra permissions required.",
    authType: "webhook",
    fields: [
      {
        key: "webhook_url",
        label: "Apps Script web app URL",
        placeholder: "https://script.google.com/macros/s/.../exec",
        help: "Deploy a Google Apps Script web app that appends the JSON body as a row.",
        secret: true,
        required: true,
      },
      {
        key: "sheet_label",
        label: "Sheet name (for your reference)",
        placeholder: "MunchReach replies",
        secret: false,
        required: false,
      },
    ],
    events: ["reply.received", "reply.positive", "lead.created", "campaign.completed", "meeting.booked"],
    features: ["One row per event", "Works with any Google account", "Full delivery log"],
    steps: [
      { title: "Deploy the script", text: "Publish an Apps Script web app with access set to “Anyone”." },
      { title: "Paste the URL", text: "Connect it in Settings → Integrations → Google Sheets." },
      { title: "Send a test", text: "A test row is appended so you can confirm the format." },
    ],
    faqs: [
      { q: "Why Apps Script instead of OAuth?", a: "It keeps the spreadsheet in your control and needs no Google account access." },
      { q: "Can I choose the columns?", a: "Yes — your script decides how the JSON payload maps to columns." },
    ],
    docsUrl: "https://developers.google.com/apps-script/guides/web",
  },
];

export const INTEGRATIONS_BY_SLUG: Record<string, IntegrationMeta> = Object.fromEntries(
  INTEGRATIONS.map((i) => [i.slug, i]),
);

export function categoryLabel(id: string) {
  return INTEGRATION_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
