/** Shared, client-safe types for the Marketing Engine. */
import type { ProductEvent } from "./events";

export type SubscriberStatus =
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "suppressed";

export type MarketingSubscriber = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  userId: string | null;
  source: string;
  tags: string[];
  status: SubscriberStatus;
  subscribedAt: string | null;
  unsubscribedAt: string | null;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Everything segment rules may read about one subscriber.
 *
 * Product signals (plan, signup date, product event history) are PROJECTED
 * from existing MunchReach data at query time — the marketing tables never
 * store a second copy of them.
 */
export type SubscriberProfile = {
  id: string;
  email: string;
  status: SubscriberStatus;
  source: string;
  tags: string[];
  createdAt: string;
  /** Plan state of the linked MunchReach account, when there is one. */
  subscriptionStatus: "free" | "trial" | "active" | "cancelled" | null;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  /** Product event history: occurrence count and last occurrence. */
  events: Partial<Record<ProductEvent, { count: number; lastAt: string | null }>>;
  /** Marketing engagement counters. */
  marketing: { sent: number; opened: number; clicked: number };
};

export type SegmentOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "has"
  | "not_has"
  | "gte"
  | "lte"
  | "gt"
  | "lt"
  | "occurred"
  | "not_occurred"
  | "days_ago_gt"
  | "days_ago_lt";

export type SegmentRule = {
  field: string;
  operator: SegmentOperator;
  value?: string | number | boolean | string[] | null;
};

export type SegmentDefinition = {
  match: "all" | "any";
  rules: SegmentRule[];
};

export type MarketingSegment = {
  id: string;
  /** Present only on built-in segments; custom segments have `null`. */
  key: string | null;
  name: string;
  description: string;
  builtIn: boolean;
  kind: "rule" | "manual";
  conditions: SegmentDefinition;
};

export type TemplateCategory =
  | "welcome"
  | "user_education"
  | "free_user_activation"
  | "customer_education"
  | "product_updates"
  | "customer_success"
  | "re_engagement"
  | "conversion"
  | "retention"
  | "newsletter"
  | "promotional";

export type MarketingTemplate = {
  id: string;
  /** Built-in templates are addressed by key; custom templates by uuid. */
  key: string | null;
  name: string;
  category: TemplateCategory;
  subject: string;
  previewText: string;
  fromName: string | null;
  replyTo: string | null;
  body: string;
  builtIn: boolean;
  duplicatedFrom?: string | null;
  updatedAt?: string;
};

export type CampaignType =
  | "newsletter"
  | "educational"
  | "product_update"
  | "feature_announcement"
  | "case_study"
  | "customer_education"
  | "promotional"
  | "re_engagement"
  | "event_webinar"
  | "announcement";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "cancelled"
  | "failed";

export type ProviderType = "ses" | "resend" | "sendgrid" | "mailgun" | "smtp";

export type MarketingProvider = {
  id: string;
  name: string;
  providerType: ProviderType;
  status: "active" | "inactive";
  connectionStatus: "untested" | "connected" | "failed";
  health: "unknown" | "healthy" | "degraded" | "down";
  lastTestedAt: string | null;
  lastTestMessage: string | null;
  dailySendLimit: number | null;
  ratePerSecond: number | null;
  /** True when encrypted credentials exist. The values are never returned. */
  hasCredentials: boolean;
  createdAt: string;
};

export type VerificationState = "pending" | "verified" | "failed";
export type RecordState = "pending" | "pass" | "fail";

export type MarketingSendingDomain = {
  id: string;
  domain: string;
  providerId: string | null;
  verificationStatus: VerificationState;
  spfStatus: RecordState;
  dkimStatus: RecordState;
  dmarcStatus: RecordState;
  enabled: boolean;
  allowedProviderIds: string[];
  dnsRecords: { type: string; host: string; value: string; purpose: string }[];
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
};

export type AutomationStepType =
  | "send_email"
  | "wait"
  | "condition"
  | "add_tag"
  | "remove_tag"
  | "add_to_segment"
  | "remove_from_segment";

export type AutomationStep = {
  id: string;
  position: number;
  stepType: AutomationStepType;
  config: {
    /** send_email */
    templateKey?: string | null;
    templateId?: string | null;
    /** wait */
    waitMinutes?: number;
    /** condition */
    rule?: SegmentRule;
    /** tags + segments */
    tag?: string;
    segmentId?: string;
    segmentKey?: string;
  };
};

export type MarketingAutomation = {
  id: string;
  name: string;
  description: string;
  triggerEvent: ProductEvent;
  status: "draft" | "active" | "paused";
  blueprintKey: string | null;
  segmentId: string | null;
  segmentKey: string | null;
  sendingDomainId: string | null;
  providerId: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  steps: AutomationStep[];
};

export type MarketingSettings = {
  defaultProviderId: string | null;
  defaultSendingDomainId: string | null;
  maxEmailsPerDay: number;
  maxEmailsPerWeek: number;
};
