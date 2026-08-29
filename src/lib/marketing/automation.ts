/**
 * Automation step machine (pure).
 *
 * An enrolment is `{ stepIndex, waitUntil }`. `advanceAutomation` runs steps
 * from the current index until it must stop — a wait that has not elapsed, a
 * condition that failed, an email to send, or the end of the sequence — and
 * returns the effects the server layer should apply plus the next state.
 *
 * Keeping this pure means enrolment progress is deterministic and replayable:
 * running it twice with the same state produces the same effects, which is
 * what makes the server-side runner safe to retry.
 */
import { evaluateRule } from "./segments";
import type { AutomationStep, SubscriberProfile } from "./types";

export type EnrollmentState = {
  stepIndex: number;
  waitUntil: string | null;
};

export type AutomationEffect =
  | { type: "send_email"; templateKey: string | null; templateId: string | null; stepIndex: number }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "add_to_segment"; segmentId: string | null; segmentKey: string | null }
  | { type: "remove_from_segment"; segmentId: string | null; segmentKey: string | null };

export type AdvanceResult = {
  effects: AutomationEffect[];
  state: EnrollmentState;
  status: "waiting" | "running" | "completed" | "exited";
  /** Set when the run stopped because a condition step evaluated false. */
  exitReason?: string;
};

export function advanceAutomation(
  steps: AutomationStep[],
  state: EnrollmentState,
  profile: SubscriberProfile,
  now: Date = new Date(),
  options: { maxEffects?: number } = {},
): AdvanceResult {
  const maxEffects = options.maxEffects ?? 1;
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const effects: AutomationEffect[] = [];
  let index = state.stepIndex;

  if (state.waitUntil && Date.parse(state.waitUntil) > now.getTime()) {
    return { effects, state, status: "waiting" };
  }

  let waitUntil: string | null = null;

  while (index < ordered.length) {
    const step = ordered[index]!;
    switch (step.stepType) {
      case "wait": {
        const minutes = Math.max(0, step.config.waitMinutes ?? 0);
        const until = new Date(now.getTime() + minutes * 60_000);
        index += 1;
        if (minutes > 0) {
          waitUntil = until.toISOString();
          return { effects, state: { stepIndex: index, waitUntil }, status: "waiting" };
        }
        continue;
      }
      case "condition": {
        const rule = step.config.rule;
        const passed = rule ? evaluateRule(profile, rule, now) : true;
        if (!passed) {
          return {
            effects,
            state: { stepIndex: index, waitUntil: null },
            status: "exited",
            exitReason: `Condition on step ${index + 1} not met`,
          };
        }
        index += 1;
        continue;
      }
      case "send_email": {
        effects.push({
          type: "send_email",
          templateKey: step.config.templateKey ?? null,
          templateId: step.config.templateId ?? null,
          stepIndex: index,
        });
        index += 1;
        if (effects.length >= maxEffects) {
          return {
            effects,
            state: { stepIndex: index, waitUntil: null },
            status: index >= ordered.length ? "completed" : "running",
          };
        }
        continue;
      }
      case "add_tag":
        if (step.config.tag) effects.push({ type: "add_tag", tag: step.config.tag });
        index += 1;
        continue;
      case "remove_tag":
        if (step.config.tag) effects.push({ type: "remove_tag", tag: step.config.tag });
        index += 1;
        continue;
      case "add_to_segment":
        effects.push({
          type: "add_to_segment",
          segmentId: step.config.segmentId ?? null,
          segmentKey: step.config.segmentKey ?? null,
        });
        index += 1;
        continue;
      case "remove_from_segment":
        effects.push({
          type: "remove_from_segment",
          segmentId: step.config.segmentId ?? null,
          segmentKey: step.config.segmentKey ?? null,
        });
        index += 1;
        continue;
      default:
        index += 1;
        continue;
    }
  }

  return { effects, state: { stepIndex: index, waitUntil: null }, status: "completed" };
}

/** Total configured wait, useful for showing "≈ 10 days" in the builder. */
export function automationDurationMinutes(steps: AutomationStep[]): number {
  return steps.reduce(
    (total, step) =>
      step.stepType === "wait" ? total + Math.max(0, step.config.waitMinutes ?? 0) : total,
    0,
  );
}

export function describeWait(minutes: number): string {
  if (minutes <= 0) return "immediately";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.round((minutes / 60) * 10) / 10;
    return `${hours} hr`;
  }
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Editor validation — surfaced in the UI before an automation can go live. */
export function validateAutomationSteps(steps: AutomationStep[]): string[] {
  const errors: string[] = [];
  if (steps.length === 0) errors.push("Add at least one step.");
  if (!steps.some((s) => s.stepType === "send_email")) {
    errors.push("An automation must send at least one email.");
  }
  steps.forEach((step, index) => {
    const label = `Step ${index + 1}`;
    if (step.stepType === "send_email" && !step.config.templateKey && !step.config.templateId) {
      errors.push(`${label}: choose a template.`);
    }
    if (step.stepType === "wait" && !(step.config.waitMinutes && step.config.waitMinutes > 0)) {
      errors.push(`${label}: set a wait longer than zero.`);
    }
    if (step.stepType === "condition" && !step.config.rule?.field) {
      errors.push(`${label}: choose a condition field.`);
    }
    if ((step.stepType === "add_tag" || step.stepType === "remove_tag") && !step.config.tag) {
      errors.push(`${label}: enter a tag.`);
    }
  });
  return errors;
}
