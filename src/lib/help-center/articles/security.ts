import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const SECURITY_ARTICLES: HelpArticle[] = [
  {
    slug: "security-overview",
    title: "How MunchReach protects your data",
    description: "Workspace isolation, encrypted credentials and access control.",
    category: "security",
    updated: UPDATED,
    popular: true,
    keywords: ["security", "encryption", "isolation", "protection", "data"],
    related: ["privacy-basics", "account-security", "api-key-security", "workspace-access-control"],
    content: `## Workspace isolation
Your leads, campaigns, mailboxes and analytics belong to your workspace. Access is enforced server-side on every request, not hidden in the interface.

## Credentials
Provider and integration credentials are encrypted at rest and held server-side. Once stored, a key is never returned to the browser — which is why rotating means pasting a new one rather than editing the old.

## Access
Sign-in is per user; a user reaches a workspace only through an explicit membership. Removing someone's membership removes their access immediately.

## Important notes
The weakest link is almost always an account password or a leaked API key, not the platform. Use a password manager and rotate keys when people leave.`,
  },
  {
    slug: "privacy-basics",
    title: "Privacy and your lead data",
    description: "What data you hold, where it goes and your responsibilities.",
    category: "security",
    updated: UPDATED,
    keywords: ["privacy", "gdpr", "personal data", "data processing", "retention"],
    related: ["security-overview", "compliance-basics", "ai-what-data-is-used", "export-workspace-data"],
    content: `## What you hold
The lead data you import is personal data about real people. You decide what to collect and why; MunchReach stores and processes it so you can run outreach.

## Where it goes
- To your connected mailboxes when you send
- To your AI provider, if you enable personalization — and only the lead fields you selected
- To any integration you connect

## Your responsibilities
1. Have a defensible reason for holding each person's data.
2. Honour deletion and access requests; you can export and delete lead data yourself.
3. Do not import fields you do not need, especially into AI prompts.
4. Keep suppression records even after deleting a lead, so they are not contacted again.

## Important notes
Deleting a lead removes the record. It does not undo an email already sent, and it should not remove them from suppression.`,
  },
  {
    slug: "account-security",
    title: "Securing your account",
    description: "Practical steps that prevent most account compromises.",
    category: "security",
    updated: UPDATED,
    keywords: ["password", "2fa", "account security", "sessions", "compromise"],
    related: ["password-management", "security-overview", "workspace-access-control", "cannot-sign-in"],
    content: `1. Use a long, unique password stored in a password manager.
2. Never share a login between teammates — invite them instead, so access can be removed individually.
3. Review workspace members regularly and remove people who have left.
4. Rotate API keys and integration credentials when anyone with access departs.
5. Treat any password reset email you did not request as a warning sign and change your password immediately.

## Important notes
A compromised MunchReach account means someone can send email as your domain. That is a reputation and legal problem, not just a data one.`,
  },
  {
    slug: "workspace-access-control",
    title: "Who can see what in a workspace",
    description: "Roles, visibility and what changing a role affects.",
    category: "security",
    updated: UPDATED,
    keywords: ["roles", "permissions", "access", "visibility", "members"],
    related: ["team-roles-and-visibility", "invite-teammates", "security-overview", "account-security"],
    content: `Access is governed by workspace membership and role. Roles determine who can change settings, manage billing, connect integrations and view conversations.

## Steps
1. **Settings → Team** to review members and roles.
2. Change a role, or remove a member who no longer needs access.

## Important notes
- Secrets are never visible to anyone through the interface, regardless of role.
- Removing a member takes effect immediately, but any API key they created keeps working until it is revoked. Revoke it explicitly.`,
  },
  {
    slug: "reporting-security-issues",
    title: "Reporting a security issue",
    description: "How to report a vulnerability or a suspected compromise.",
    category: "security",
    updated: UPDATED,
    keywords: ["vulnerability", "report", "disclosure", "breach", "compromise"],
    related: ["contact-support", "account-security", "api-key-security"],
    content: `## If you suspect your account is compromised
1. Change your password immediately.
2. Revoke every API key and reconnect integrations with fresh credentials.
3. Review Settings → Team for members you do not recognise.
4. Pause campaigns you did not create.
5. Contact support with the timeline.

## If you have found a vulnerability
Report it privately to support with enough detail to reproduce it. Please do not test against other customers' data, and do not disclose publicly before it is fixed.

## Important notes
Never include credentials, keys or exported lead data in a report. Describe the issue; support will ask for what it needs.`,
  },
];
