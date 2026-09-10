import type { HelpArticle } from "../types";

const UPDATED = "2026-09-10";

export const ACCOUNT_ARTICLES: HelpArticle[] = [
  {
    slug: "account-settings",
    title: "Account and profile settings",
    description: "Where to change your name, email, avatar, theme and notification preferences.",
    category: "account",
    updated: UPDATED,
    keywords: ["profile", "settings", "avatar", "theme", "appearance"],
    related: ["workspace-settings", "notification-settings", "password-management"],
    content: `Settings is organised into tabs: Profile, Workspace, Team, Notifications, Email & Sending, Integrations, Developer API, Security, Appearance, Billing and Danger Zone.

## Steps
1. Open Settings from the sidebar.
2. On **Profile**, update your name, avatar and contact email.
3. On **Appearance**, switch between light and dark themes.
4. Save. Changes apply to your user across every workspace you belong to.

## Important notes
Profile settings are personal. Workspace-wide settings — sending defaults, team access, billing — live on their own tabs and affect everyone.`,
  },
  {
    slug: "workspace-settings",
    title: "Workspace settings",
    description: "Naming, branding and workspace-level defaults.",
    category: "account",
    updated: UPDATED,
    keywords: ["workspace", "rename", "branding", "multi workspace", "agency"],
    related: ["team-roles-and-visibility", "invite-teammates", "account-settings"],
    content: `A workspace holds its own domains, mailboxes, leads, campaigns, replies and billing. Agencies typically run one workspace per client.

## Steps
1. Settings → Workspace.
2. Update the workspace name and branding.
3. Save.

## Switching workspaces
Use the workspace switcher in the sidebar. Data never crosses between workspaces — a lead, campaign or mailbox belongs to exactly one.

## Important notes
Renaming a workspace does not affect campaigns in flight, connected mailboxes or API keys.`,
  },
  {
    slug: "invite-teammates",
    title: "Inviting teammates",
    description: "Send an invitation, choose a role and manage pending invites.",
    category: "account",
    updated: UPDATED,
    keywords: ["invite", "team", "members", "seat", "collaborator"],
    related: ["team-roles-and-visibility", "workspace-settings", "billing-usage"],
    content: `## Steps
1. Settings → Team.
2. Invite a teammate by email address and pick a role.
3. They accept from the emailed link and land in the workspace.

## Important notes
- An invitation is tied to the address it was sent to and expires if unused.
- Members with edit access count towards your plan's seat allowance.
- Removing a member revokes access immediately; their campaigns and data stay in the workspace.

## Common problems
- **Invite never arrived** — check spam, confirm the address, then send the invite again from Settings → Team.
- **"Already a member"** — they are in the workspace under a different address.`,
  },
  {
    slug: "team-roles-and-visibility",
    title: "Roles, permissions and who can see a campaign",
    description: "How workspace roles decide read and edit access.",
    category: "account",
    updated: UPDATED,
    keywords: ["roles", "permissions", "access", "read only", "viewer", "admin"],
    related: ["invite-teammates", "workspace-settings", "workspace-access-control"],
    content: `Access is granted per workspace, and every role carries a fixed set of permissions.

## Read versus edit
Analysts and client viewers get read access to campaigns and reporting. Campaign managers and above can create, edit and launch.

## Ownership
The workspace owner controls billing and can transfer ownership to another member.

## Important notes
Permissions are enforced on the server, not just hidden in the interface. A read-only member cannot change data by manipulating the page.`,
  },
  {
    slug: "transfer-workspace-ownership",
    title: "Transferring workspace ownership",
    description: "Move ownership, and billing responsibility, to another member.",
    category: "account",
    updated: UPDATED,
    popular: true,
    keywords: ["ownership", "transfer", "owner", "handover"],
    related: ["team-roles-and-visibility", "plans-and-invoices", "workspace-settings"],
    content: `Ownership can be moved to another member of the same workspace.

## Steps
1. Settings → Team.
2. Choose the member who should become owner and start the transfer.
3. Both the current owner and the new owner confirm.

## Important notes
The transfer takes effect immediately once confirmed, and billing responsibility moves with it. The previous owner remains in the workspace with a normal role unless you remove them.`,
  },
  {
    slug: "password-management",
    title: "Password and sign-in management",
    description: "Change your password, reset a forgotten one and manage sign-in methods.",
    category: "account",
    updated: UPDATED,
    keywords: ["password", "reset", "forgot", "sign in", "google login"],
    related: ["account-security", "security-overview", "cannot-sign-in"],
    content: `## Change your password
1. Settings → Security.
2. Enter your current password and the new one.
3. Save. Existing sessions stay signed in on this device.

## Reset a forgotten password
Use Forgot password on the sign-in screen. The link is single use and time limited; request a fresh one if it expires.

## Google sign-in
If you signed up with Google, you sign in with Google. You can set a password from Settings → Security if you want both.

## Important notes
Use a unique password and a password manager. Reused passwords are the most common way outreach accounts are compromised.`,
  },
  {
    slug: "account-security",
    title: "Account security",
    description: "The controls that protect your MunchReach login and workspace.",
    category: "account",
    updated: UPDATED,
    keywords: ["security", "sessions", "sign out", "protect account"],
    related: ["password-management", "security-overview", "api-key-security"],
    content: `## What to do
1. Use a unique, strong password, stored in a password manager.
2. Remove teammates the moment they leave the project.
3. Give read-only roles to anyone who only needs reporting.
4. Revoke API keys and integrations you no longer use.
5. Sign out of shared or public machines.

## Important notes
Every workspace is isolated. A member of one workspace cannot read another workspace's data, and that boundary is enforced on the server.`,
  },
  {
    slug: "notification-settings",
    title: "Notification settings",
    description: "Choose which events notify you and where.",
    category: "account",
    updated: UPDATED,
    keywords: ["notifications", "alerts", "email notifications", "bell"],
    related: ["inbox-overview", "account-settings", "mailbox-health"],
    content: `## Steps
1. Settings → Notifications.
2. Choose which events you want to hear about — new replies, mailbox problems, campaign state changes and sending alerts.
3. Save.

## Important notes
Notifications also appear in the bell in the top bar regardless of email preferences, so nothing critical is lost if you turn emails off.`,
  },
  {
    slug: "connected-integrations-management",
    title: "Managing and disconnecting integrations",
    description: "See what is connected, check its activity and disconnect it cleanly.",
    category: "account",
    updated: UPDATED,
    keywords: ["disconnect", "revoke integration", "connections", "manage integrations"],
    related: ["connect-integrations", "security-overview", "account-security"],
    content: `## Steps
1. Settings → Integrations.
2. Each connection shows its status and recent activity.
3. Use Disconnect to remove one.

## What disconnecting does
The stored credential is deleted and MunchReach stops calling that service. Data already synced stays where it is — disconnecting is not a delete.

## Important notes
Disconnecting an inbound integration stops new leads arriving from it immediately. Re-connecting requires the credential again; MunchReach cannot show you a stored secret.`,
  },
  {
    slug: "export-workspace-data",
    title: "Exporting all your workspace data",
    description: "Request a full export of leads, campaigns and reply history.",
    category: "account",
    updated: UPDATED,
    keywords: ["export", "data export", "backup", "download data", "gdpr"],
    related: ["export-leads", "delete-account", "privacy-basics"],
    content: `You own your data and can take it with you at any time.

## Steps
1. Settings → Danger Zone (or Account, depending on your role).
2. Request a full export.
3. You are notified when the file is ready.

## What is included
Leads, campaigns and reply history, as CSV and JSON.

## Important notes
For a quick lead-only file, use Export on the Leads page instead — it is immediate.`,
  },
  {
    slug: "delete-account",
    title: "Deactivating or deleting your account",
    description: "What happens to your data, your workspaces and your billing.",
    category: "account",
    updated: UPDATED,
    keywords: ["delete account", "close account", "deactivate", "danger zone"],
    related: ["export-workspace-data", "cancel-downgrade-refunds", "privacy-basics"],
    content: `## Before you delete
1. Export anything you want to keep — deletion is not reversible.
2. Cancel or transfer the subscription if you own the workspace.
3. Transfer ownership if teammates should keep the workspace.

## Steps
Settings → Danger Zone, then follow the confirmation prompts.

## Important notes
- Deleting your user account does not automatically delete a workspace others still use.
- Active campaigns stop sending when the workspace they belong to is deleted.

## When to contact support
If you need a workspace removed but ownership sits with someone who has left, contact support with the details.`,
  },
];
