/**
 * Customer lifecycle configuration (pure, no I/O).
 *
 * Every day offset, discount percentage and inactivity threshold lives here as
 * data and is stored in `platform_settings.lifecycle_emails`. Nothing in the
 * UI or the engine hard-codes a schedule.
 */

export const LIFECYCLE_SETTINGS_KEY = "lifecycle_emails";

export type LifecycleTrack = "free_trial" | "inactive";

export type LifecycleState =
  | "eligible"
  | "email_1_sent"
  | "email_2_sent"
  | "email_3_sent"
  | "final_warning_sent"
  | "reactivated"
  | "terminated"
  | "cancelled";

export type LifecycleConfig = {
  /** Master switch for the whole lifecycle engine. */
  enabled: boolean;
  /** Max enrollments created and max steps processed per cycle. */
  batch_limit: number;
  free_trial: {
    enabled: boolean;
    /** Days after sign-up for the 5% offer. */
    email_1_day: number;
    /** Days after sign-up for the 10% offer. */
    email_2_day: number;
    discount_1_percent: number;
    discount_2_percent: number;
    /** How long an issued discount code stays valid. */
    coupon_valid_days: number;
  };
  inactive: {
    enabled: boolean;
    /** Consecutive days without activity before entering the sequence. */
    inactive_days: number;
    email_1_day: number;
    email_2_day: number;
    email_3_day: number;
    final_warning_day: number;
    /** Days after entering the sequence when termination happens. */
    termination_day: number;
    /** When false the sequence stops after the final warning. */
    terminate: boolean;
  };
};

export const DEFAULT_LIFECYCLE_CONFIG: LifecycleConfig = {
  enabled: false,
  batch_limit: 100,
  free_trial: {
    enabled: true,
    email_1_day: 3,
    email_2_day: 10,
    discount_1_percent: 5,
    discount_2_percent: 10,
    coupon_valid_days: 14,
  },
  inactive: {
    enabled: true,
    inactive_days: 30,
    email_1_day: 3,
    email_2_day: 7,
    email_3_day: 12,
    final_warning_day: 17,
    termination_day: 24,
    terminate: true,
  },
};

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Merges a stored settings blob over the defaults and clamps every number. */
export function normalizeLifecycleConfig(raw: unknown): LifecycleConfig {
  const d = DEFAULT_LIFECYCLE_CONFIG;
  const v = (raw ?? {}) as Record<string, unknown>;
  const free = (v["free_trial"] ?? {}) as Record<string, unknown>;
  const inactive = (v["inactive"] ?? {}) as Record<string, unknown>;

  const cfg: LifecycleConfig = {
    enabled: bool(v["enabled"], d.enabled),
    batch_limit: int(v["batch_limit"], d.batch_limit, 1, 500),
    free_trial: {
      enabled: bool(free["enabled"], d.free_trial.enabled),
      email_1_day: int(free["email_1_day"], d.free_trial.email_1_day, 1, 365),
      email_2_day: int(free["email_2_day"], d.free_trial.email_2_day, 1, 365),
      discount_1_percent: int(free["discount_1_percent"], d.free_trial.discount_1_percent, 1, 90),
      discount_2_percent: int(free["discount_2_percent"], d.free_trial.discount_2_percent, 1, 90),
      coupon_valid_days: int(free["coupon_valid_days"], d.free_trial.coupon_valid_days, 1, 365),
    },
    inactive: {
      enabled: bool(inactive["enabled"], d.inactive.enabled),
      inactive_days: int(inactive["inactive_days"], d.inactive.inactive_days, 1, 365),
      email_1_day: int(inactive["email_1_day"], d.inactive.email_1_day, 1, 365),
      email_2_day: int(inactive["email_2_day"], d.inactive.email_2_day, 1, 365),
      email_3_day: int(inactive["email_3_day"], d.inactive.email_3_day, 1, 365),
      final_warning_day: int(inactive["final_warning_day"], d.inactive.final_warning_day, 1, 365),
      termination_day: int(inactive["termination_day"], d.inactive.termination_day, 1, 730),
      terminate: bool(inactive["terminate"], d.inactive.terminate),
    },
  };

  // Offsets must stay strictly increasing, otherwise a later step could become
  // due before an earlier one and the sequence would read out of order.
  if (cfg.free_trial.email_2_day <= cfg.free_trial.email_1_day) {
    cfg.free_trial.email_2_day = cfg.free_trial.email_1_day + 1;
  }
  const order: (keyof LifecycleConfig["inactive"])[] = [
    "email_1_day",
    "email_2_day",
    "email_3_day",
    "final_warning_day",
    "termination_day",
  ];
  for (let i = 1; i < order.length; i += 1) {
    const prevKey = order[i - 1] as "email_1_day";
    const key = order[i] as "email_2_day";
    if ((cfg.inactive[key] as number) <= (cfg.inactive[prevKey] as number)) {
      (cfg.inactive[key] as number) = (cfg.inactive[prevKey] as number) + 1;
    }
  }
  return cfg;
}
