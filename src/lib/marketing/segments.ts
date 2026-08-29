/**
 * Marketing segmentation.
 *
 * Segments are pure predicates over a `SubscriberProfile`. Product signals in
 * that profile (plan, signup date, product events) are projected from the
 * existing MunchReach tables — segmentation never stores its own copy of
 * product state, so a segment can never drift from the product.
 *
 * Built-in segments are defined in code, not in the database: that makes them
 * impossible to corrupt or delete, and it keeps their meaning versioned with
 * the app.
 */
import type {
  SegmentDefinition,
  SegmentRule,
  SubscriberProfile,
  MarketingSegment,
} from "./types";

export const BUILT_IN_SEGMENTS: {
  key: string;
  name: string;
  description: string;
  conditions: SegmentDefinition;
}[] = [
  {
    key: "all_subscribers",
    name: "All Subscribers",
    description: "Every marketing subscriber who has not opted out or been suppressed.",
    conditions: { match: "all", rules: [{ field: "status", operator: "eq", value: "active" }] },
  },
  {
    key: "newsletter_subscribers",
    name: "Newsletter Subscribers",
    description: "Subscribers who opted in through a newsletter form or import.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "tags", operator: "has", value: "newsletter" },
      ],
    },
  },
  {
    key: "free_users",
    name: "Free Users",
    description: "Subscribers on a MunchReach free plan.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "subscription_status", operator: "eq", value: "free" },
      ],
    },
  },
  {
    key: "trial_users",
    name: "Trial Users",
    description: "Subscribers currently inside a MunchReach trial.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "subscription_status", operator: "eq", value: "trial" },
      ],
    },
  },
  {
    key: "active_customers",
    name: "Active Customers",
    description: "Subscribers with a paid, active MunchReach subscription.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "subscription_status", operator: "eq", value: "active" },
      ],
    },
  },
  {
    key: "inactive_customers",
    name: "Inactive Customers",
    description: "Paying customers who have not signed in for 14 days or more.",
    conditions: {
      match: "all",
      rules: [
        { field: "subscription_status", operator: "eq", value: "active" },
        { field: "last_login", operator: "days_ago_gt", value: 14 },
      ],
    },
  },
  {
    key: "new_users",
    name: "New Users",
    description: "Signed up within the last 7 days.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "signed_up", operator: "days_ago_lt", value: 7 },
      ],
    },
  },
  {
    key: "cancelled_customers",
    name: "Cancelled Customers",
    description: "Subscribers whose MunchReach subscription was cancelled.",
    conditions: {
      match: "all",
      rules: [{ field: "subscription_status", operator: "eq", value: "cancelled" }],
    },
  },
  {
    key: "created_campaign",
    name: "Users Who Created a Campaign",
    description: "The product event campaign_created has fired at least once.",
    conditions: {
      match: "all",
      rules: [{ field: "event:campaign_created", operator: "occurred" }],
    },
  },
  {
    key: "never_created_campaign",
    name: "Users Who Never Created a Campaign",
    description: "No campaign_created event has ever fired for this account.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "event:campaign_created", operator: "not_occurred" },
      ],
    },
  },
  {
    key: "connected_mailbox",
    name: "Users Who Connected a Mailbox",
    description: "The product event mailbox_connected has fired.",
    conditions: {
      match: "all",
      rules: [{ field: "event:mailbox_connected", operator: "occurred" }],
    },
  },
  {
    key: "launched_campaign",
    name: "Users Who Launched a Campaign",
    description: "The product event campaign_launched has fired.",
    conditions: {
      match: "all",
      rules: [{ field: "event:campaign_launched", operator: "occurred" }],
    },
  },
  {
    key: "received_first_reply",
    name: "Users Who Received First Reply",
    description: "The product event first_reply_received has fired.",
    conditions: {
      match: "all",
      rules: [{ field: "event:first_reply_received", operator: "occurred" }],
    },
  },
  {
    key: "highly_engaged",
    name: "Highly Engaged Subscribers",
    description: "Opened three or more marketing emails.",
    conditions: {
      match: "all",
      rules: [
        { field: "status", operator: "eq", value: "active" },
        { field: "marketing:opened", operator: "gte", value: 3 },
      ],
    },
  },
];

export function builtInSegments(): MarketingSegment[] {
  return BUILT_IN_SEGMENTS.map((s) => ({
    id: `builtin:${s.key}`,
    key: s.key,
    name: s.name,
    description: s.description,
    builtIn: true,
    kind: "rule" as const,
    conditions: s.conditions,
  }));
}

export function builtInSegment(key: string): MarketingSegment | null {
  return builtInSegments().find((s) => s.key === key) ?? null;
}

/* ------------------------------------------------------------------ fields */

type FieldValue =
  | { kind: "scalar"; value: string | number | boolean | null }
  | { kind: "list"; value: string[] }
  | { kind: "date"; value: string | null }
  | { kind: "event"; count: number; lastAt: string | null };

function resolveField(profile: SubscriberProfile, field: string): FieldValue {
  if (field.startsWith("event:")) {
    const name = field.slice("event:".length) as keyof SubscriberProfile["events"];
    const entry = profile.events[name];
    return { kind: "event", count: entry?.count ?? 0, lastAt: entry?.lastAt ?? null };
  }
  if (field.startsWith("marketing:")) {
    const name = field.slice("marketing:".length);
    const counters = profile.marketing as unknown as Record<string, number>;
    return { kind: "scalar", value: counters[name] ?? 0 };
  }
  switch (field) {
    case "status":
      return { kind: "scalar", value: profile.status };
    case "source":
      return { kind: "scalar", value: profile.source };
    case "email":
      return { kind: "scalar", value: profile.email };
    case "tags":
      return { kind: "list", value: profile.tags };
    case "subscription_status":
      return { kind: "scalar", value: profile.subscriptionStatus };
    case "signed_up":
      return { kind: "date", value: profile.signedUpAt };
    case "last_login":
      return { kind: "date", value: profile.lastLoginAt };
    case "created_at":
      return { kind: "date", value: profile.createdAt };
    default:
      return { kind: "scalar", value: null };
  }
}

function daysAgo(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 86_400_000;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Evaluates one rule. Unknown fields/operators evaluate to `false`, never throw. */
export function evaluateRule(
  profile: SubscriberProfile,
  rule: SegmentRule,
  now: Date = new Date(),
): boolean {
  const resolved = resolveField(profile, rule.field);
  const { operator, value } = rule;

  if (resolved.kind === "event") {
    switch (operator) {
      case "occurred":
        return resolved.count > 0;
      case "not_occurred":
        return resolved.count === 0;
      case "gte":
        return resolved.count >= (toNumber(value) ?? 0);
      case "lte":
        return resolved.count <= (toNumber(value) ?? 0);
      case "gt":
        return resolved.count > (toNumber(value) ?? 0);
      case "lt":
        return resolved.count < (toNumber(value) ?? 0);
      case "eq":
        return resolved.count === (toNumber(value) ?? 0);
      case "days_ago_gt": {
        const d = daysAgo(resolved.lastAt, now);
        return d !== null && d > (toNumber(value) ?? 0);
      }
      case "days_ago_lt": {
        const d = daysAgo(resolved.lastAt, now);
        return d !== null && d < (toNumber(value) ?? 0);
      }
      default:
        return false;
    }
  }

  if (resolved.kind === "list") {
    const list = resolved.value.map((v) => v.toLowerCase());
    const needle = String(value ?? "").toLowerCase();
    switch (operator) {
      case "has":
        return list.includes(needle);
      case "not_has":
        return !list.includes(needle);
      case "in":
        return Array.isArray(value) && value.some((v) => list.includes(String(v).toLowerCase()));
      case "not_in":
        return Array.isArray(value) && !value.some((v) => list.includes(String(v).toLowerCase()));
      default:
        return false;
    }
  }

  if (resolved.kind === "date") {
    const d = daysAgo(resolved.value, now);
    switch (operator) {
      case "days_ago_gt":
        return d !== null && d > (toNumber(value) ?? 0);
      case "days_ago_lt":
        return d !== null && d < (toNumber(value) ?? 0);
      case "occurred":
        return resolved.value !== null;
      case "not_occurred":
        return resolved.value === null;
      default:
        return false;
    }
  }

  const actual = resolved.value;
  switch (operator) {
    case "eq":
      return actual === (value ?? null);
    case "neq":
      return actual !== (value ?? null);
    case "in":
      return Array.isArray(value) && value.map(String).includes(String(actual));
    case "not_in":
      return Array.isArray(value) && !value.map(String).includes(String(actual));
    case "gte":
      return (toNumber(actual) ?? -Infinity) >= (toNumber(value) ?? 0);
    case "lte":
      return (toNumber(actual) ?? Infinity) <= (toNumber(value) ?? 0);
    case "gt":
      return (toNumber(actual) ?? -Infinity) > (toNumber(value) ?? 0);
    case "lt":
      return (toNumber(actual) ?? Infinity) < (toNumber(value) ?? 0);
    case "occurred":
      return actual !== null && actual !== undefined;
    case "not_occurred":
      return actual === null || actual === undefined;
    default:
      return false;
  }
}

/** Evaluates a whole segment definition against one subscriber. */
export function matchesSegment(
  profile: SubscriberProfile,
  definition: SegmentDefinition,
  now: Date = new Date(),
): boolean {
  const rules = definition?.rules ?? [];
  if (rules.length === 0) return true;
  return definition.match === "any"
    ? rules.some((rule) => evaluateRule(profile, rule, now))
    : rules.every((rule) => evaluateRule(profile, rule, now));
}

/** Resolves an audience from a candidate pool. */
export function resolveAudience(
  profiles: SubscriberProfile[],
  definition: SegmentDefinition,
  now: Date = new Date(),
): SubscriberProfile[] {
  return profiles.filter((p) => matchesSegment(p, definition, now));
}
