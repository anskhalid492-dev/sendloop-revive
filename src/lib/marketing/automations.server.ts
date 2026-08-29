/**
 * Automation runner (server-only).
 *
 * Enrolment is created by the product-event bridge; this module walks each
 * enrolment through the pure step machine in `automation.ts` and applies the
 * effects. It is idempotent by construction: progress is persisted after every
 * step, so a retried or overlapping run resumes rather than repeats.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { advanceAutomation, type EnrollmentState } from "./automation";
import { evaluateSendGate } from "./frequency";
import { builtInSegment, matchesSegment } from "./segments";
import {
  deliverMarketingEmail,
  loadSettings,
  recordMarketingEvent,
  resolveTemplate,
} from "./send-engine.server";
import {
  loadFrequencyState,
  loadSubscriberProfiles,
  suppressedSet,
  toSubscriber,
} from "./subscribers.server";
import type { AutomationStep, SubscriberProfile } from "./types";

type AutomationRow = {
  id: string;
  name: string;
  status: string;
  segment_id: string | null;
  segment_key: string | null;
  provider_id: string | null;
  sending_domain_id: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
};

async function loadSteps(automationId: string): Promise<AutomationStep[]> {
  const { data } = await supabaseAdmin
    .from("marketing_automation_steps")
    .select("*")
    .eq("automation_id", automationId)
    .order("position", { ascending: true });
  return (data ?? []).map(
    (row: { id: string; position: number; step_type: string; config: unknown }) => ({
      id: row.id,
      position: row.position,
      stepType: row.step_type as AutomationStep["stepType"],
      config: (row.config ?? {}) as AutomationStep["config"],
    }),
  );
}

/** Enrols a subscriber, unless the automation's entry segment excludes them. */
export async function enrollSubscriber(args: {
  automationId: string;
  subscriberId: string;
  triggerEvent: string;
}): Promise<{ enrolled: boolean; reason?: string }> {
  const { data: automation } = await supabaseAdmin
    .from("marketing_automations")
    .select("*")
    .eq("id", args.automationId)
    .maybeSingle();
  if (!automation || automation.status !== "active") {
    return { enrolled: false, reason: "Automation is not active." };
  }

  const { data: existing } = await supabaseAdmin
    .from("marketing_automation_enrollments")
    .select("id, status")
    .eq("automation_id", args.automationId)
    .eq("subscriber_id", args.subscriberId)
    .maybeSingle();
  if (existing) return { enrolled: false, reason: "Already enrolled." };

  const { data: subscriberRow } = await supabaseAdmin
    .from("marketing_subscribers")
    .select("*")
    .eq("id", args.subscriberId)
    .maybeSingle();
  if (!subscriberRow) return { enrolled: false, reason: "Subscriber not found." };
  const subscriber = toSubscriber(subscriberRow);
  if (subscriber.status !== "active") return { enrolled: false, reason: "Subscriber is not active." };

  const definition = automation.segment_key
    ? (builtInSegment(automation.segment_key)?.conditions ?? null)
    : automation.segment_id
      ? await loadSegmentConditions(automation.segment_id)
      : null;

  if (definition) {
    const [profile] = await loadSubscriberProfiles([subscriber]);
    if (!profile || !matchesSegment(profile, definition)) {
      return { enrolled: false, reason: "Subscriber is not in the automation segment." };
    }
  }

  const { error } = await supabaseAdmin.from("marketing_automation_enrollments").insert({
    automation_id: args.automationId,
    subscriber_id: args.subscriberId,
    status: "active",
    current_step: 0,
    next_run_at: new Date().toISOString(),
    trigger_event: args.triggerEvent,
  });
  if (error) throw new Error(error.message);
  return { enrolled: true };
}

async function loadSegmentConditions(segmentId: string) {
  const { data } = await supabaseAdmin
    .from("marketing_segments")
    .select("conditions")
    .eq("id", segmentId)
    .maybeSingle();
  return (data?.conditions ?? null) as { match: "all" | "any"; rules: [] } | null;
}

export type AutomationRunSummary = {
  processed: number;
  sent: number;
  skipped: number;
  completed: number;
  exited: number;
  errors: number;
};

/** Processes due enrolments across every active automation. */
export async function runDueEnrollments(
  options: { limit?: number; now?: Date } = {},
): Promise<AutomationRunSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 100;
  const summary: AutomationRunSummary = {
    processed: 0,
    sent: 0,
    skipped: 0,
    completed: 0,
    exited: 0,
    errors: 0,
  };

  const { data: due } = await supabaseAdmin
    .from("marketing_automation_enrollments")
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);

  const enrollments = (due ?? []) as {
    id: string;
    automation_id: string;
    subscriber_id: string;
    current_step: number;
    next_run_at: string | null;
  }[];
  if (enrollments.length === 0) return summary;

  const automationIds = [...new Set(enrollments.map((e) => e.automation_id))];
  const subscriberIds = [...new Set(enrollments.map((e) => e.subscriber_id))];

  const [{ data: automationRows }, { data: subscriberRows }] = await Promise.all([
    supabaseAdmin.from("marketing_automations").select("*").in("id", automationIds),
    supabaseAdmin.from("marketing_subscribers").select("*").in("id", subscriberIds),
  ]);

  const automations = new Map<string, AutomationRow>(
    ((automationRows ?? []) as AutomationRow[]).map((a) => [a.id, a]),
  );
  const subscribers = new Map((subscriberRows ?? []).map((row) => [row.id, toSubscriber(row)]));
  const stepsByAutomation = new Map<string, AutomationStep[]>();
  for (const id of automationIds) stepsByAutomation.set(id, await loadSteps(id));

  const profiles = await loadSubscriberProfiles([...subscribers.values()]);
  const profileById = new Map<string, SubscriberProfile>(profiles.map((p) => [p.id, p]));
  const emails = [...subscribers.values()].map((s) => s.email);
  const [suppressed, frequency, settings] = await Promise.all([
    suppressedSet(emails),
    loadFrequencyState(emails, now),
    loadSettings(),
  ]);

  for (const enrollment of enrollments) {
    summary.processed += 1;
    const automation = automations.get(enrollment.automation_id);
    const subscriber = subscribers.get(enrollment.subscriber_id);
    const profile = profileById.get(enrollment.subscriber_id);
    if (!automation || !subscriber || !profile) {
      summary.errors += 1;
      continue;
    }
    if (automation.status !== "active") continue;

    const state: EnrollmentState = { stepIndex: enrollment.current_step, waitUntil: null };
    const steps = stepsByAutomation.get(automation.id) ?? [];

    try {
      const result = advanceAutomation(steps, state, profile, now);

      for (const effect of result.effects) {
        if (effect.type === "send_email") {
          const template = await resolveTemplate({
            templateId: effect.templateId,
            builtinKey: effect.templateKey,
          });
          if (!template) {
            summary.errors += 1;
            continue;
          }
          const gate = evaluateSendGate({
            email: subscriber.email,
            status: subscriber.status,
            suppressed: suppressed.has(subscriber.email),
            alreadySent: false,
            frequency: frequency.get(subscriber.email) ?? { sentLast24h: 0, sentLast7d: 0 },
            limits: { maxPerDay: settings.maxEmailsPerDay, maxPerWeek: settings.maxEmailsPerWeek },
          });
          if (!gate.allowed) {
            summary.skipped += 1;
            await recordMarketingEvent({
              eventType: "marketing_email_suppressed",
              subscriberId: subscriber.id,
              email: subscriber.email,
              automationId: automation.id,
              detail: gate.detail,
            });
            continue;
          }
          const providerId = automation.provider_id ?? settings.defaultProviderId;
          if (!providerId) {
            summary.errors += 1;
            continue;
          }
          const sent = await deliverMarketingEmail({
            subscriber,
            template,
            fromName: automation.from_name,
            fromEmail: automation.from_email,
            replyTo: automation.reply_to,
            providerId,
            sendingDomainId: automation.sending_domain_id ?? settings.defaultSendingDomainId,
            automationId: automation.id,
            listId: "marketing.munchreach.com",
          });
          if (sent.status === "sent") {
            summary.sent += 1;
            const current = frequency.get(subscriber.email) ?? { sentLast24h: 0, sentLast7d: 0 };
            frequency.set(subscriber.email, {
              sentLast24h: current.sentLast24h + 1,
              sentLast7d: current.sentLast7d + 1,
            });
          } else if (sent.status === "failed") {
            summary.errors += 1;
          }
        } else if (effect.type === "add_tag" || effect.type === "remove_tag") {
          const tags = new Set(subscriber.tags);
          if (effect.type === "add_tag") tags.add(effect.tag);
          else tags.delete(effect.tag);
          await supabaseAdmin
            .from("marketing_subscribers")
            .update({ tags: [...tags] })
            .eq("id", subscriber.id);
        } else if (effect.type === "add_to_segment" && effect.segmentId) {
          await supabaseAdmin
            .from("marketing_segment_members")
            .upsert(
              { segment_id: effect.segmentId, subscriber_id: subscriber.id },
              { onConflict: "segment_id,subscriber_id" },
            );
        } else if (effect.type === "remove_from_segment" && effect.segmentId) {
          await supabaseAdmin
            .from("marketing_segment_members")
            .delete()
            .eq("segment_id", effect.segmentId)
            .eq("subscriber_id", subscriber.id);
        }
      }

      const status =
        result.status === "completed"
          ? "completed"
          : result.status === "exited"
            ? "exited"
            : "active";
      if (result.status === "completed") summary.completed += 1;
      if (result.status === "exited") summary.exited += 1;

      await supabaseAdmin
        .from("marketing_automation_enrollments")
        .update({
          current_step: result.state.stepIndex,
          next_run_at:
            status === "active" ? (result.state.waitUntil ?? new Date().toISOString()) : null,
          status,
          completed_at: status === "active" ? null : new Date().toISOString(),
          last_error: result.exitReason ?? null,
        })
        .eq("id", enrollment.id);
    } catch (error) {
      summary.errors += 1;
      await supabaseAdmin
        .from("marketing_automation_enrollments")
        .update({
          last_error: error instanceof Error ? error.message : "Automation step failed",
          next_run_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
        })
        .eq("id", enrollment.id);
    }
  }

  return summary;
}
