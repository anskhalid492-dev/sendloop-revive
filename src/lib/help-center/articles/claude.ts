import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const CLAUDE_ARTICLES: HelpArticle[] = [
  {
    slug: "claude-overview",
    title: "What is Claude in MunchReach?",
    description: "Claude as the model behind AI personalization, and how it differs from the alternative.",
    category: "claude",
    updated: UPDATED,
    popular: true,
    keywords: ["claude", "anthropic", "model", "ai provider"],
    related: ["connect-claude", "claude-with-personalization", "ai-personalization-overview"],
    content: `Claude is one of the two AI providers MunchReach personalization can run on. The other is OpenAI. You choose one per campaign and connect your own key for it.

## Available Claude models
- **Claude Haiku 4.5** — the default; fast and inexpensive, suited to volume generation
- **Claude Sonnet 4.5** — stronger writing, higher cost per lead
- **Claude Opus 4.1** — the most capable and the most expensive; reserve it for small, high-value lists

## What Claude changes
Only the model that writes the personalization snippet. Every other part of the campaign — sequence, schedule, sending, suppression, analytics — is identical.

## Important notes
Claude usage is billed to you by Anthropic against the key you connect. MunchReach does not resell it.`,
  },
  {
    slug: "connect-claude",
    title: "How to connect Claude",
    description: "Add your Anthropic key and pick a model.",
    category: "claude",
    updated: UPDATED,
    popular: true,
    keywords: ["connect claude", "anthropic key", "sk-ant", "api key", "setup claude"],
    related: ["claude-overview", "enable-ai-personalization", "claude-troubleshooting"],
    content: `## Steps
1. Create an API key in your Anthropic account. Claude keys start with \`sk-ant-\`.
2. In MunchReach, open the campaign → the **AI** tab.
3. In **Your AI connection**, select **Claude**.
4. Paste the key and connect. MunchReach verifies it with a live call before saving, so an invalid key is rejected immediately.
5. Choose a model — Claude Haiku 4.5, Claude Sonnet 4.5 or Claude Opus 4.1.
6. Turn the AI toggle **On**.

## Important notes
- The key is encrypted and never shown again after it is stored. To rotate, paste a new key; to remove, click Disconnect.
- Switching from OpenAI to Claude does not delete snippets you already generated.

## Common problems
- **Key rejected at connect time** — check for a copied trailing space, and that the key has not been revoked in the Anthropic console.`,
  },
  {
    slug: "claude-with-personalization",
    title: "How Claude works with AI personalization",
    description: "Generating snippets with Claude, on one lead or the whole list.",
    category: "claude",
    updated: UPDATED,
    keywords: ["generate with claude", "claude personalization", "snippets"],
    related: ["how-ai-personalization-works", "bulk-ai-personalization", "review-edit-personalization"],
    content: `Once Claude is connected, the personalization workflow is exactly the workflow described in the AI section.

## Steps
1. Configure level, tone, length, language and permitted lead fields on the AI tab's **Setup** step.
2. Test on a few leads in **Preview**.
3. Run **Generate for all leads** and watch Ready, Queued and Failed.
4. Review and edit on **Results**.
5. Insert the personalization token into your subject or body.

## Important notes
- Claude tends to follow explicit constraints well: tell it a maximum sentence count and forbid compliments, and it will comply.
- Model choice changes cost and quality, not the workflow. Compare Haiku and Sonnet on the same twenty leads before committing a large list.`,
  },
  {
    slug: "claude-availability-and-limits",
    title: "Claude availability and usage limits",
    description: "What controls whether you can use Claude and how much it costs.",
    category: "claude",
    updated: UPDATED,
    keywords: ["claude limits", "availability", "plan", "cost", "rate limit"],
    related: ["ai-usage-limits", "billing-usage", "connect-claude"],
    content: `## Availability
Claude is available wherever AI personalization is available on your plan. If the AI tab is locked, check Settings → Billing for your current plan's entitlements.

## Usage and cost
Generation runs on your Anthropic key, so Anthropic's rate limits, credit balance and pricing apply. A larger model costs more per lead; a longer output costs more than a shorter one.

## Controlling spend
- Default to Claude Haiku 4.5 for volume.
- Keep the requested length short.
- Generate for a sample, review, then run the rest.
- Snippets are stored per lead, so relaunching a campaign does not regenerate them.`,
  },
  {
    slug: "claude-troubleshooting",
    title: "Claude troubleshooting",
    description: "Connection rejected, generations failing, or output not what you expected.",
    category: "claude",
    updated: UPDATED,
    keywords: ["claude failed", "anthropic error", "not working", "rate limited", "credit"],
    related: ["ai-troubleshooting", "connect-claude", "bulk-ai-personalization"],
    content: `## Problem
Claude will not connect, or generations fail.

## Possible causes
- The key is not an Anthropic key, or has a stray character
- The key was revoked in the Anthropic console
- The Anthropic account has no credit
- Anthropic is rate limiting the key
- The selected model is not enabled on your Anthropic account

## How to check
1. The AI tab connection card: Connected, Needs attention or Not connected.
2. Your Anthropic console: key status, credit balance and recent request logs.
3. Open Results and check whether failures are all-or-nothing (a key problem) or scattered (thin lead data).

## How to fix
- Reconnect with a valid key.
- Top up credit or raise the spend cap at Anthropic.
- Choose a model your account can access — Haiku is the safest default.
- Use **Retry failed** once the provider-side cause is resolved; provider errors are requeued rather than treated as permanent lead failures.

## When to contact support
Anthropic shows successful requests for the key while MunchReach reports every lead as failed.`,
  },
];
