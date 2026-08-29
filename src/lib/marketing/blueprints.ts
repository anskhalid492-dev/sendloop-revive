/**
 * Built-in automation blueprints.
 *
 * Each blueprint is a ready-made sequence wired to an EXISTING product event
 * (see `events.ts`). Creating an automation from a blueprint copies its steps
 * into an editable automation — the blueprint itself is never mutated.
 */
import type { ProductEvent } from "./events";
import type { AutomationStep, AutomationStepType } from "./types";

export type AutomationBlueprint = {
  key: string;
  name: string;
  description: string;
  triggerEvent: ProductEvent;
  segmentKey: string | null;
  steps: { stepType: AutomationStepType; config: AutomationStep["config"] }[];
};

const days = (n: number) => n * 24 * 60;

export const AUTOMATION_BLUEPRINTS: AutomationBlueprint[] = [
  {
    key: "onboarding",
    name: "Onboarding Sequence",
    description: "Five emails over ten days that walk a brand-new signup to their first campaign.",
    triggerEvent: "user_signed_up",
    segmentKey: "new_users",
    steps: [
      { stepType: "send_email", config: { templateKey: "welcome-to-munchreach" } },
      { stepType: "wait", config: { waitMinutes: days(1) } },
      { stepType: "send_email", config: { templateKey: "getting-started" } },
      { stepType: "wait", config: { waitMinutes: days(2) } },
      { stepType: "send_email", config: { templateKey: "activation-connect-mailbox" } },
      { stepType: "wait", config: { waitMinutes: days(3) } },
      { stepType: "send_email", config: { templateKey: "edu-first-campaign" } },
      { stepType: "wait", config: { waitMinutes: days(4) } },
      { stepType: "send_email", config: { templateKey: "activation-launch-campaign" } },
    ],
  },
  {
    key: "free_user_education",
    name: "Free User Education",
    description: "Teaches free users the fundamentals until they launch a campaign.",
    triggerEvent: "user_verified_email",
    segmentKey: "free_users",
    steps: [
      { stepType: "send_email", config: { templateKey: "edu-cold-email-fundamentals" } },
      { stepType: "wait", config: { waitMinutes: days(3) } },
      { stepType: "send_email", config: { templateKey: "edu-deliverability-basics" } },
      { stepType: "wait", config: { waitMinutes: days(3) } },
      {
        stepType: "condition",
        config: { rule: { field: "event:campaign_launched", operator: "not_occurred" } },
      },
      { stepType: "send_email", config: { templateKey: "edu-icp" } },
    ],
  },
  {
    key: "activation",
    name: "Activation Sequence",
    description: "Nudges a signed-up user through mailbox connection and first launch.",
    triggerEvent: "user_signed_up",
    segmentKey: null,
    steps: [
      { stepType: "wait", config: { waitMinutes: days(1) } },
      {
        stepType: "condition",
        config: { rule: { field: "event:mailbox_connected", operator: "not_occurred" } },
      },
      { stepType: "send_email", config: { templateKey: "activation-complete-setup" } },
      { stepType: "wait", config: { waitMinutes: days(2) } },
      { stepType: "send_email", config: { templateKey: "activation-create-campaign" } },
      { stepType: "add_tag", config: { tag: "activation" } },
    ],
  },
  {
    key: "product_education",
    name: "Product Education Sequence",
    description: "Deep dives into the product for users who are already sending.",
    triggerEvent: "first_email_sent",
    segmentKey: null,
    steps: [
      { stepType: "send_email", config: { templateKey: "cust-unibox" } },
      { stepType: "wait", config: { waitMinutes: days(4) } },
      { stepType: "send_email", config: { templateKey: "cust-automation" } },
      { stepType: "wait", config: { waitMinutes: days(4) } },
      { stepType: "send_email", config: { templateKey: "cust-analytics" } },
    ],
  },
  {
    key: "conversion",
    name: "Conversion Sequence",
    description: "Explains upgrading to engaged free users, honestly and without pressure.",
    triggerEvent: "campaign_launched",
    segmentKey: "free_users",
    steps: [
      { stepType: "wait", config: { waitMinutes: days(2) } },
      { stepType: "send_email", config: { templateKey: "convert-free-to-paid" } },
      { stepType: "wait", config: { waitMinutes: days(5) } },
      { stepType: "send_email", config: { templateKey: "convert-why-upgrade" } },
    ],
  },
  {
    key: "re_engagement",
    name: "Re-engagement Sequence",
    description: "Wins back accounts that have gone quiet.",
    triggerEvent: "campaign_inactive",
    segmentKey: "inactive_customers",
    steps: [
      { stepType: "send_email", config: { templateKey: "reengage-we-miss-you" } },
      { stepType: "wait", config: { waitMinutes: days(5) } },
      { stepType: "send_email", config: { templateKey: "reengage-what-you-missed" } },
      { stepType: "wait", config: { waitMinutes: days(7) } },
      { stepType: "send_email", config: { templateKey: "reengage-need-help" } },
      { stepType: "add_tag", config: { tag: "re-engagement" } },
    ],
  },
  {
    key: "customer_onboarding",
    name: "Customer Onboarding",
    description: "Welcomes a new paying customer and points them at unused capacity.",
    triggerEvent: "subscription_started",
    segmentKey: "active_customers",
    steps: [
      { stepType: "send_email", config: { templateKey: "retain-customer-welcome" } },
      { stepType: "wait", config: { waitMinutes: days(3) } },
      { stepType: "send_email", config: { templateKey: "retain-getting-more-value" } },
      { stepType: "add_tag", config: { tag: "customer" } },
      { stepType: "remove_from_segment", config: { segmentKey: "free_users" } },
    ],
  },
  {
    key: "customer_education",
    name: "Customer Education",
    description: "Ongoing education for paying customers past the basics.",
    triggerEvent: "first_reply_received",
    segmentKey: "active_customers",
    steps: [
      { stepType: "send_email", config: { templateKey: "cust-advanced-features" } },
      { stepType: "wait", config: { waitMinutes: days(7) } },
      { stepType: "send_email", config: { templateKey: "cust-advanced-workflow" } },
    ],
  },
  {
    key: "win_back",
    name: "Win-back Sequence",
    description: "Reaches cancelled customers with what changed since they left.",
    triggerEvent: "subscription_cancelled",
    segmentKey: "cancelled_customers",
    steps: [
      { stepType: "wait", config: { waitMinutes: days(7) } },
      { stepType: "send_email", config: { templateKey: "reengage-since-you-left" } },
      { stepType: "wait", config: { waitMinutes: days(14) } },
      { stepType: "send_email", config: { templateKey: "reengage-come-back" } },
    ],
  },
];

export function blueprint(key: string): AutomationBlueprint | null {
  return AUTOMATION_BLUEPRINTS.find((b) => b.key === key) ?? null;
}

export function blueprintSteps(key: string): AutomationStep[] {
  const found = blueprint(key);
  if (!found) return [];
  return found.steps.map((step, index) => ({
    id: `${key}-${index}`,
    position: index,
    stepType: step.stepType,
    config: step.config,
  }));
}
