/**
 * Warmup ramp state machine.
 *
 * Pure, client-safe and free of I/O so both the engine and the dashboard can
 * reason about the same stages. Volume never moves because a day elapsed: it
 * moves because the mailbox's own real sending record (from
 * `warmup_daily_stats`), its health score, its authentication status and the
 * provider's behaviour say it is safe to move.
 *
 * Stages: ramp_up -> stable, with hold / recovery / paused as safety states.
 */

export type WarmupStage = "ramp_up" | "stable" | "hold" | "recovery" | "paused";

export type WarmupStageAction =
  | "start"
  | "increase"
  | "hold"
  | "reduce"
  | "recover"
  | "pause";

export type RampStatRow = {
  day: string;
  target?: number | null;
  sent?: number | null;
  delivered?: number | null;
  bounced?: number | null;
  complained?: number | null;
  failed?: number | null;
  replied?: number | null;
  deferred?: number | null;
  rejected?: number | null;
  not_received?: number | null;
};

export type RampSettings = {
  start_volume: number;
  max_volume: number;
  daily_increase: number;
  max_bounce_rate: number;
  min_health_score: number;
  /** Temporary-failure percentage that holds the ramp. */
  hold_failure_rate?: number | null;
  /** Bounce percentage that drops the mailbox into recovery. */
  recovery_bounce_rate?: number | null;
  /** Clean days required before recovery hands back to a normal ramp. */
  recovery_days?: number | null;
};

export type RampInput = {
  settings: RampSettings;
  /** Recent daily stats, any order. Only the newest days are considered. */
  stats: RampStatRow[];
  healthScore: number | null;
  /** SPF / DKIM / DMARC statuses as stored on the mailbox. */
  authStatuses?: Array<string | null | undefined>;
  /** Stage recorded by the previous run. */
  stage?: WarmupStage | null;
  stageSince?: string | null;
  /** Volume the previous run settled on. */
  currentVolume?: number | null;
  /** The provider is currently rate limiting or deferring this mailbox. */
  throttled?: boolean;
  /** Hard ceiling from mailbox/provider capacity left after replies+campaigns. */
  capacityCeiling?: number | null;
  /** Customer or system pause. */
  paused?: boolean;
  pauseReason?: string | null;
  now?: Date;
};

export type RampDecision = {
  stage: WarmupStage;
  action: WarmupStageAction;
  /** Emails warmup may queue today. */
  target: number;
  /** Plain-English explanation shown to the customer. */
  reason: string;
};

export const STAGE_LABEL: Record<WarmupStage, string> = {
  ramp_up: "Ramping up",
  stable: "Stable",
  hold: "Holding",
  recovery: "Recovery",
  paused: "Paused",
};

const DEFAULT_HOLD_FAILURE_RATE = 10;
const DEFAULT_RECOVERY_BOUNCE_RATE = 5;
const DEFAULT_RECOVERY_DAYS = 3;

function n(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sortedDesc(stats: RampStatRow[]): RampStatRow[] {
  return [...stats].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

function totals(rows: RampStatRow[]) {
  return rows.reduce(
    (acc, row) => ({
      sent: acc.sent + n(row.sent),
      delivered: acc.delivered + n(row.delivered),
      bounced: acc.bounced + n(row.bounced),
      complained: acc.complained + n(row.complained),
      failed: acc.failed + n(row.failed),
      replied: acc.replied + n(row.replied),
      deferred: acc.deferred + n(row.deferred),
      rejected: acc.rejected + n(row.rejected),
    }),
    {
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
      failed: 0,
      replied: 0,
      deferred: 0,
      rejected: 0,
    },
  );
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function authFailing(statuses: Array<string | null | undefined> | undefined): boolean {
  return (statuses ?? []).some((s) => s === "fail" || s === "failed");
}

/** Days the mailbox has been in its current stage. */
function daysInStage(stageSince: string | null | undefined, now: Date): number {
  if (!stageSince) return 0;
  const since = new Date(stageSince).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
}

/**
 * Decides today's stage and warmup volume from the mailbox's real record.
 */
export function evaluateWarmupRamp(input: RampInput): RampDecision {
  const now = input.now ?? new Date();
  const s = input.settings;
  const start = Math.max(1, n(s.start_volume) || 1);
  const max = Math.max(start, n(s.max_volume) || start);
  const step = Math.max(1, n(s.daily_increase) || 1);
  const holdFailureRate = n(s.hold_failure_rate) || DEFAULT_HOLD_FAILURE_RATE;
  const recoveryBounceRate = n(s.recovery_bounce_rate) || DEFAULT_RECOVERY_BOUNCE_RATE;
  const recoveryDays = Math.max(1, n(s.recovery_days) || DEFAULT_RECOVERY_DAYS);
  const maxBounceRate = n(s.max_bounce_rate) || 10;
  const minHealth = n(s.min_health_score) || 50;

  const ceiling = typeof input.capacityCeiling === "number" ? Math.max(0, input.capacityCeiling) : null;
  const previous = clamp(n(input.currentVolume) || start, start, max);

  const finish = (decision: Omit<RampDecision, "target"> & { target: number }): RampDecision => {
    let target = Math.max(0, Math.round(decision.target));
    let reason = decision.reason;
    if (decision.stage !== "paused") target = clamp(target, Math.min(start, max), max);
    if (ceiling !== null && target > ceiling) {
      target = ceiling;
      reason = `${reason} Volume is also limited to ${ceiling} today by the mailbox's remaining sending capacity, because replies and campaigns come first.`;
    }
    return { ...decision, target, reason };
  };

  if (input.paused) {
    return finish({
      stage: "paused",
      action: "pause",
      target: 0,
      reason: input.pauseReason?.trim()
        ? input.pauseReason.trim()
        : "Warmup is paused, so no warmup emails are queued.",
    });
  }

  // --- hard stops -----------------------------------------------------------
  if (authFailing(input.authStatuses)) {
    return finish({
      stage: "paused",
      action: "pause",
      target: 0,
      reason:
        "Warmup is paused because email authentication is failing for this domain. Fix SPF, DKIM or DMARC, then resume.",
    });
  }

  const rows = sortedDesc(input.stats);
  const recent = rows.slice(0, 3);
  const window = rows.slice(0, 7);
  const recentTotals = totals(recent);
  const windowTotals = totals(window);
  const lifetimeSent = totals(rows).sent;

  const bounceRate = pct(windowTotals.bounced, windowTotals.sent);
  const complaintRate = pct(windowTotals.complained, windowTotals.sent);
  const failRate = pct(recentTotals.failed + recentTotals.deferred, recentTotals.sent);
  const rejectRate = pct(recentTotals.rejected, recentTotals.sent);

  if (windowTotals.complained >= 2 || complaintRate >= 0.5) {
    return finish({
      stage: "paused",
      action: "pause",
      target: 0,
      reason:
        "Warmup is paused because recipients marked these messages as spam. The reported addresses were suppressed.",
    });
  }

  if (windowTotals.sent >= 10 && bounceRate >= maxBounceRate) {
    return finish({
      stage: "paused",
      action: "pause",
      target: 0,
      reason: `Warmup is paused because ${bounceRate.toFixed(1)}% of recent warmup emails bounced, above the ${maxBounceRate}% limit.`,
    });
  }

  // --- first run ------------------------------------------------------------
  if (lifetimeSent === 0) {
    return finish({
      stage: "ramp_up",
      action: "start",
      target: start,
      reason: `Warmup is starting at ${start} email${start === 1 ? "" : "s"} a day and will only increase once delivery stays clean.`,
    });
  }

  // --- problems that reduce volume -----------------------------------------
  const problems: string[] = [];
  if (windowTotals.sent >= 5 && bounceRate >= recoveryBounceRate) {
    problems.push(`${bounceRate.toFixed(1)}% of recent warmup emails bounced`);
  }
  if (recentTotals.sent >= 5 && failRate >= holdFailureRate) {
    problems.push("temporary delivery failures increased");
  }
  if (recentTotals.sent >= 5 && rejectRate >= holdFailureRate) {
    problems.push("receiving servers rejected messages");
  }
  if (input.throttled) {
    problems.push("the sending server is rate limiting this mailbox");
  }
  if (input.healthScore !== null && input.healthScore < minHealth) {
    problems.push(`the health score dropped to ${input.healthScore}`);
  }

  if (problems.length > 0) {
    const reduced = Math.max(start, Math.floor(previous * 0.5));
    return finish({
      stage: "recovery",
      action: "reduce",
      target: reduced,
      reason: `Warmup volume reduced to ${reduced} a day because ${problems.join(", ")}. Volume will increase again only after delivery stays clean.`,
    });
  }

  // --- recovery exit --------------------------------------------------------
  if (input.stage === "recovery") {
    const cleanDays = recent.filter(
      (row) => n(row.sent) > 0 && n(row.bounced) === 0 && n(row.complained) === 0 && n(row.failed) === 0,
    ).length;
    const elapsed = daysInStage(input.stageSince, now);
    if (cleanDays >= recoveryDays || elapsed >= recoveryDays) {
      return finish({
        stage: "hold",
        action: "hold",
        target: previous,
        reason: `Delivery has been clean for ${Math.max(cleanDays, Math.min(elapsed, recoveryDays))} day${Math.max(cleanDays, elapsed) === 1 ? "" : "s"}, so warmup is holding ${previous} a day before increasing again.`,
      });
    }
    return finish({
      stage: "recovery",
      action: "recover",
      target: previous,
      reason: `Warmup is in recovery and holding ${previous} a day while delivery is monitored.`,
    });
  }

  // --- uncertain data holds -------------------------------------------------
  const lastDay = rows[0];
  const lastSent = n(lastDay?.sent);
  const lastPlanned = Math.max(0, n(lastDay?.target));

  if (input.healthScore !== null && input.healthScore < 70) {
    return finish({
      stage: "hold",
      action: "hold",
      target: previous,
      reason: `Warmup is holding ${previous} a day because the health score (${input.healthScore}) is not high enough to increase volume yet.`,
    });
  }

  if (lastSent === 0) {
    return finish({
      stage: "hold",
      action: "hold",
      target: previous,
      reason: `Warmup is holding ${previous} a day because there is no completed sending day to judge yet.`,
    });
  }

  if (lastPlanned > 0 && lastSent < lastPlanned * 0.8) {
    return finish({
      stage: "hold",
      action: "hold",
      target: previous,
      reason: `Warmup is holding ${previous} a day because only ${lastSent} of ${lastPlanned} planned emails were sent.`,
    });
  }

  // --- stable at the ceiling -----------------------------------------------
  if (previous >= max) {
    return finish({
      stage: "stable",
      action: "hold",
      target: max,
      reason: `Warmup is stable at its maximum of ${max} emails a day and delivery is clean.`,
    });
  }

  // --- healthy increase -----------------------------------------------------
  const next = Math.min(max, previous + step);
  return finish({
    stage: "ramp_up",
    action: "increase",
    target: next,
    reason: `Delivery stayed clean, so warmup volume increased from ${previous} to ${next} emails a day.`,
  });
}
