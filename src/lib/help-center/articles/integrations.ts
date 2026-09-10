import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const INTEGRATION_ARTICLES: HelpArticle[] = [
  {
    slug: "integrations-overview",
    title: "Integrations overview",
    description: "What you can connect MunchReach to, and how connections work.",
    category: "integrations",
    updated: UPDATED,
    popular: true,
    keywords: ["integrations", "connect", "crm", "apps", "catalog"],
    related: ["connect-integrations", "disconnect-integration", "integrations-troubleshooting", "api-overview"],
    content: `Integrations let MunchReach exchange data with tools you already use — CRMs, messaging tools and AI providers — without you writing any code.

## Where to find them
- The public integrations page lists what is available.
- **Settings → Integrations** manages the connections for your workspace.

## Two kinds of connection
- **Provider keys**, such as your AI provider, where you paste a key that is encrypted and stored server-side
- **Authorised connections**, where you grant MunchReach access from the other tool

## Important notes
Connections belong to the workspace, not to you personally. A teammate with the right role can see that a connection exists — though never its secret.`,
  },
  {
    slug: "connect-integrations",
    title: "How to connect an integration",
    description: "Add a connection from Settings and confirm it is live.",
    category: "integrations",
    updated: UPDATED,
    popular: true,
    keywords: ["connect integration", "authorize", "setup integration", "add connection"],
    related: ["integrations-overview", "disconnect-integration", "integrations-troubleshooting", "connect-claude"],
    content: `## Steps
1. Go to **Settings → Integrations**.
2. Find the tool and start the connection.
3. Either authorise MunchReach from the other tool, or paste the credential it asks for.
4. Confirm the card shows the connection as active.

## Important notes
- Credentials are encrypted at rest and never returned to the browser afterwards.
- Connecting an AI provider for personalization is done on the campaign's AI tab as well as here.

## Common problems
- **Authorisation window closes with nothing connected** — a popup blocker, or you were signed into the wrong account in the other tool.`,
  },
  {
    slug: "disconnect-integration",
    title: "Disconnecting or rotating an integration",
    description: "Remove access or replace a credential safely.",
    category: "integrations",
    updated: UPDATED,
    keywords: ["disconnect", "revoke", "rotate key", "remove integration"],
    related: ["connect-integrations", "connected-integrations-management", "api-key-security"],
    content: `## Steps
1. **Settings → Integrations**.
2. Open the connection and disconnect it, or paste a new credential to rotate.
3. Revoke the old credential in the other tool as well — disconnecting here does not invalidate a key that still exists there.

## Important notes
Disconnecting an AI provider stops new personalization generation. Snippets already generated stay on the leads and continue to send.`,
  },
  {
    slug: "integrations-troubleshooting",
    title: "Integration troubleshooting",
    description: "A connection shows an error or has stopped syncing.",
    category: "integrations",
    updated: UPDATED,
    keywords: ["integration error", "not syncing", "reconnect", "expired"],
    related: ["connect-integrations", "ai-troubleshooting", "api-troubleshooting"],
    content: `## Problem
A connected tool shows an error, or data stopped flowing.

## Possible causes
- The credential was revoked or expired in the other tool
- Someone changed permissions or removed the authorising user's access
- The other service is rate limiting or is down
- The account you authorised no longer has the required plan

## How to check
1. **Settings → Integrations** — read the connection's state.
2. Check the same integration from the other tool's side: is the key still listed and active?
3. Check that service's status page.

## How to fix
- Reconnect or rotate the credential.
- Re-authorise with an account that has the necessary permissions.
- Wait out a rate limit rather than retrying in a loop.

## When to contact support
The credential is valid and active in the other tool, and MunchReach still reports the connection as failing.`,
  },
];
