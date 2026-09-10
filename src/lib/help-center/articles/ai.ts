import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const AI_ARTICLES: HelpArticle[] = [
  {
    slug: "ai-personalization-overview",
    title: "What is AI personalization?",
    description: "What the feature does, what it needs, and what it costs you.",
    category: "ai",
    updated: UPDATED,
    popular: true,
    keywords: ["ai", "personalization", "opening line", "gpt", "claude", "snippet"],
    related: ["how-ai-personalization-works", "enable-ai-personalization", "claude-overview"],
    content: `AI personalization writes a short, lead-specific line — typically the opener — that you insert into your campaign copy with a token. Everything else in the email stays exactly as you wrote it.

## What it needs
Your own AI account. Personalization runs on your OpenAI or Claude (Anthropic) key, which you connect in the campaign's AI tab. MunchReach does not resell AI credits, and usage is billed to you by that provider.

## What it produces
One personalization snippet per lead, generated from the lead fields you allow. Snippets are stored on the lead, so they are reused rather than regenerated every send.

## Important notes
- You review and edit snippets before they go out. Nothing is sent unread unless you choose to trust it.
- A fallback covers leads the AI cannot personalize, so a thin record never produces an awkward sentence.`,
  },
  {
    slug: "how-ai-personalization-works",
    title: "How AI personalization works",
    description: "The path from lead data to a line inside your email.",
    category: "ai",
    updated: UPDATED,
    keywords: ["how it works", "generation", "queue", "token", "personalization flow"],
    related: ["ai-personalization-overview", "insert-personalization", "bulk-ai-personalization"],
    content: `## The flow
1. You connect an AI provider key and choose a model.
2. You configure the instructions: level, tone, length, language, and which lead fields the AI may use.
3. You generate — for one lead, or for the whole audience in the background.
4. Each generation produces a snippet stored on that lead, with a state of queued, processing, completed or failed.
5. You review, edit or regenerate on the Results tab.
6. You insert the personalization token into your subject or body; at send time each lead's snippet replaces the token.
7. Leads without a snippet use the fallback you chose.

## Important notes
- Generation happens ahead of sending, not during it. A campaign will not stall waiting for the AI.
- Editing a snippet by hand is permanent for that lead until you regenerate.`,
  },
  {
    slug: "enable-ai-personalization",
    title: "How to enable AI personalization",
    description: "Connect a provider key, switch the feature on and configure it.",
    category: "ai",
    updated: UPDATED,
    popular: true,
    keywords: ["enable ai", "connect openai", "api key", "turn on", "setup"],
    related: ["connect-claude", "ai-troubleshooting", "how-ai-personalization-works"],
    content: `## Steps
1. Open the campaign → the **AI** tab.
2. In **Your AI connection**, pick the provider: OpenAI or Claude.
3. Paste your API key from that provider and connect. The key is verified with a live call before it is saved, so a bad key fails now rather than mid-campaign.
4. Choose a model from the list for that provider.
5. Turn the AI toggle **On**.
6. On the **Setup** tab, set level, tone, length and language, choose which lead fields the AI may use, and pick what happens if a lead cannot be personalized.

## Important notes
- The connection card shows Connected, Needs attention or Not connected.
- Keys are encrypted and never returned to the browser after they are stored. To change one, paste a new key; to remove it, click Disconnect.
- Usage is billed by your AI provider, not by MunchReach.

## Common problems
- **Needs attention** — the key was revoked, expired, or has no credit at the provider.`,
  },
  {
    slug: "ai-what-data-is-used",
    title: "What lead information the AI uses",
    description: "You choose the fields; nothing else is sent.",
    category: "ai",
    updated: UPDATED,
    keywords: ["data", "fields", "privacy", "what is sent", "lead data"],
    related: ["enable-ai-personalization", "privacy-basics", "required-lead-fields"],
    content: `## Choosing fields
On the AI tab's **Setup** step, the "Lead data the AI may use" chips control exactly which fields are included in the prompt — for example first name, company, job title, location, website and your custom fields.

## What this means
- Fields you do not select are not sent.
- Better inputs produce better output. Company and website are the two fields that most improve a cold opener.
- A lead missing every selected field will usually fail to personalize and fall back.

## Important notes
Data is sent to the AI provider you connected, under your account and their terms. If a field is sensitive, do not select it.`,
  },
  {
    slug: "generate-opening-lines",
    title: "How to generate personalized opening lines",
    description: "Generate for one lead, preview the result and iterate on instructions.",
    category: "ai",
    updated: UPDATED,
    popular: true,
    keywords: ["opening line", "generate", "preview", "icebreaker", "first line"],
    related: ["bulk-ai-personalization", "review-edit-personalization", "insert-personalization"],
    content: `## Steps
1. On the campaign's **AI** tab, finish the Setup step.
2. Open **Preview** and generate for a real lead.
3. Read it as a recipient. If it sounds like a template, tighten the instructions — be specific about what the line should reference and forbid flattery.
4. Iterate on two or three different leads before generating for everyone.

## What good output looks like
One or two sentences, specific to that company, that a human could not have written about anyone else. If you could paste it into any other email, it is not personalization.

## Important notes
Shorter is better. A long AI paragraph at the top of a cold email reads as automation, not research.`,
  },
  {
    slug: "bulk-ai-personalization",
    title: "Bulk AI personalization",
    description: "Generate for a whole audience in the background and track progress.",
    category: "ai",
    updated: UPDATED,
    keywords: ["bulk", "generate all", "queue", "background", "regenerate all", "retry failed"],
    related: ["ai-troubleshooting", "generate-opening-lines", "review-edit-personalization"],
    content: `## Steps
1. On the campaign's **AI** tab, use **Generate for all leads**.
2. Watch the tiles: Leads, Ready, Queued, Failed, with a progress bar.
3. Use **Continue now** to push the queue along, **Cancel queue** to stop, **Retry failed** to re-run only the failures, and **Regenerate all** to start over.

## How it runs
Generation is processed in bounded batches in the background, so a large audience does not block the app and an interruption does not lose completed work.

## Important notes
- Every generated snippet costs you money at your AI provider. Test on a handful of leads before running thousands.
- Failed leads are not a blocker: they fall back to whatever you chose on the Setup step.

## Common problems
- **Large failed count** — usually a provider-side problem: no credit, a rate limit, or a revoked key. Fix it at the provider and use Retry failed.`,
  },
  {
    slug: "review-edit-personalization",
    title: "Reviewing, editing and regenerating personalization",
    description: "Check the output before it reaches real prospects.",
    category: "ai",
    updated: UPDATED,
    keywords: ["review", "edit", "regenerate", "results tab", "quality"],
    related: ["bulk-ai-personalization", "generate-opening-lines", "insert-personalization"],
    content: `## Steps
1. Open the campaign's **AI** tab → **Results**.
2. Scan the generated snippets. Sort your attention towards the shortest and the longest — that is where the failures hide.
3. Edit any snippet inline. Your edit is kept for that lead.
4. Regenerate individual leads, or use Retry failed for the ones with no output.

## What to reject
- Anything factually invented about the company
- Compliments with no substance
- Lines that mention something publicly awkward
- Anything longer than two sentences

## Important notes
Review at least fifty snippets before launching a large campaign. The failure mode of AI personalization is not gibberish — it is plausible, generic, slightly wrong copy at scale.`,
  },
  {
    slug: "insert-personalization",
    title: "How to insert personalization into an email",
    description: "Place the token and choose what happens when a lead has no snippet.",
    category: "ai",
    updated: UPDATED,
    keywords: ["token", "insert", "placeholder", "fallback", "merge"],
    related: ["variables-and-fallbacks", "review-edit-personalization", "write-first-email"],
    content: `## Steps
1. On the **Sequences** tab, place the cursor where the personalized line should go.
2. Insert the AI personalization token. It can go in the subject or the body.
3. On the AI tab's Setup step, set what happens **if a lead can't be personalized** — a neutral fallback line, or skipping the lead.

## Important notes
- Write the sentence around the token so the result reads naturally with either the snippet or the fallback.
- Always Preview against a lead that has no snippet as well as one that does.

## Common problems
- **The token appears literally in a test send** — the AI toggle is off, or that lead has no snippet and no fallback is set.`,
  },
  {
    slug: "ai-usage-limits",
    title: "AI usage and limits",
    description: "Who pays, what throttles generation, and how to control spend.",
    category: "ai",
    updated: UPDATED,
    keywords: ["cost", "credits", "usage", "limits", "spend", "rate limit"],
    related: ["enable-ai-personalization", "ai-troubleshooting", "billing-usage"],
    content: `## Who pays
Your AI provider bills you directly for the key you connected. MunchReach does not sell AI credits and does not mark up usage.

## What limits generation
- Your provider's own rate limits and credit balance
- Any spend cap you set at the provider
- The size of the audience you generate for

## Controlling spend
1. Choose the cheaper default model for volume work; reserve the larger models for high-value lists.
2. Keep output short — length is cost.
3. Generate for a sample first, then the rest.
4. Avoid Regenerate all unless the instructions genuinely changed.

## Important notes
Snippets are stored per lead and reused, so relaunching a campaign does not regenerate and re-charge.`,
  },
  {
    slug: "ai-troubleshooting",
    title: "AI personalization troubleshooting",
    description: "Generation fails, stalls or produces poor output.",
    category: "ai",
    updated: UPDATED,
    popular: true,
    keywords: ["ai failed", "generation failed", "stuck queued", "bad output", "not working"],
    related: ["bulk-ai-personalization", "enable-ai-personalization", "claude-troubleshooting"],
    content: `## Problem
Leads show Failed, the queue does not move, or the copy is weak.

## Possible causes
- The provider key is invalid, revoked or expired
- The provider account has no credit or hit a spend cap
- The provider is rate limiting the key
- The selected model is not available on your provider account
- The leads have too little data in the selected fields
- Instructions are too vague

## How to check
1. AI tab → the connection card. Does it say Connected or Needs attention?
2. Check credit and rate limits in your provider's own dashboard.
3. Open Results and read a failed lead's record — is the data actually there?

## How to fix
- Reconnect with a valid key, top up credit, or switch to a model your account can use.
- Use **Retry failed**; MunchReach requeues provider-side failures rather than marking those leads permanently failed.
- Enrich thin leads, or accept the fallback for them.
- Rewrite the instructions to be concrete about what the line should reference and how long it should be.

## When to contact support
The connection shows Connected, your provider dashboard shows successful calls, and MunchReach still reports every lead as failed.`,
  },
];
