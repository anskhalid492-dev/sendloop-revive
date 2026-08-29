/**
 * Permission scopes for MunchReach Public API v1 keys.
 *
 * Client-safe: the API key management UI renders directly from this list, and
 * the server runtime authorises against the same constants, so a scope can
 * never exist in the picker without being enforced.
 */

export const API_SCOPES = [
  "campaigns:read",
  "campaigns:write",
  "contacts:read",
  "contacts:write",
  "sequences:read",
  "sequences:write",
  "mailboxes:read",
  "analytics:read",
  "replies:read",
  "webhooks:read",
  "webhooks:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** Coarse aliases a key may carry instead of listing every resource scope. */
export const COARSE_SCOPES = ["read", "write"] as const;
export type CoarseScope = (typeof COARSE_SCOPES)[number];

export type GrantableScope = ApiScope | CoarseScope;

export const SCOPE_DESCRIPTIONS: Record<GrantableScope, string> = {
  read: "Read access to every resource this API exposes.",
  write: "Read and write access to every resource this API exposes.",
  "campaigns:read": "List and read campaigns, their stats and launch state.",
  "campaigns:write": "Create, edit, delete campaigns and run launch/pause/resume/stop actions.",
  "contacts:read": "List, search and read contacts.",
  "contacts:write": "Create, update, delete, bulk-modify, import and export contacts.",
  "sequences:read": "Read campaign sequence steps.",
  "sequences:write": "Create, edit and delete campaign sequence steps.",
  "mailboxes:read": "Read connected mailboxes, their health and sending stats.",
  "analytics:read": "Read workspace analytics.",
  "replies:read": "Read replies from the unified inbox.",
  "webhooks:read": "List webhook endpoints and their delivery history.",
  "webhooks:write": "Create, edit and delete webhook endpoints.",
};

/** Scope groupings shown in the key creation dialog. */
export const SCOPE_GROUPS: Array<{ label: string; scopes: GrantableScope[] }> = [
  { label: "Blanket", scopes: ["read", "write"] },
  { label: "Campaigns", scopes: ["campaigns:read", "campaigns:write"] },
  { label: "Contacts", scopes: ["contacts:read", "contacts:write"] },
  { label: "Sequences", scopes: ["sequences:read", "sequences:write"] },
  { label: "Mailboxes", scopes: ["mailboxes:read"] },
  { label: "Analytics", scopes: ["analytics:read"] },
  { label: "Replies", scopes: ["replies:read"] },
  { label: "Webhooks", scopes: ["webhooks:read", "webhooks:write"] },
];

export function isGrantableScope(value: string): value is GrantableScope {
  return (
    (API_SCOPES as readonly string[]).includes(value) ||
    (COARSE_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * Does a key holding `granted` satisfy `required`?
 *
 * `write` implies the matching `:read`, and the blanket `read`/`write` aliases
 * expand across every resource. There is no implicit default: a key with no
 * scopes can call nothing.
 */
export function scopeSatisfied(granted: readonly string[], required: ApiScope): boolean {
  if (granted.includes(required)) return true;

  const [resource, action] = required.split(":") as [string, "read" | "write"];

  if (action === "read") {
    if (granted.includes("read") || granted.includes("write")) return true;
    // campaigns:write implies campaigns:read.
    if (granted.includes(`${resource}:write`)) return true;
    return false;
  }

  return granted.includes("write");
}
