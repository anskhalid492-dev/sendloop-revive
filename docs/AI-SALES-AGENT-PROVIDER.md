# AI Sales Agent — AI provider

The AI Sales Agent (AI Decision, Generate AI Reply, Request Human Review) uses the
**MunchReach-owned AI provider** that a super admin configures in **Admin → AI Provider**.

- Supported providers: **OpenAI** and **Anthropic** (model is an editable field).
- MunchReach supplies this provider. Customers never provide an AI API key for the AI Sales Agent.
- Only super admins can view, set, change, test or remove the provider and its key.
- The key is encrypted and stored server-side only. It is never returned to the browser, logged,
  or written to workflow history or analytics.
- If no provider is configured, the AI Sales Agent makes no AI call and uses its existing
  fallback / human-review path.

The AI Sales Agent **no longer uses** `LOVABLE_API_KEY`, the Lovable AI Gateway,
`ai.gateway.lovable.dev`, or `openai/gpt-6-astra` through Lovable. There is no fallback to them.

Campaign Writer, Personalization and Inbox AI Reply are separate customer-key AI features and are
not affected by this provider.
