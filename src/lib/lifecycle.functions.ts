/**
 * Admin API for the customer lifecycle email automation.
 *
 * Settings, enrollment stats and the manual run trigger. Every function
 * re-checks the platform `admin` role; nothing here is customer facing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LifecycleConfig } from "@/lib/lifecycle/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export type LifecycleStats = {
  byTrackState: { track: string; state: string; count: number }[];
  recent: {
    id: string;
    track: string;
    state: string;
    email: string | null;
    nextActionAt: string | null;
    lastStepAt: string | null;
    cancelReason: string | null;
  }[];
  recentActions: {
    id: string;
    stepKey: string;
    kind: string;
    status: string;
    eventKey: string | null;
    couponCode: string | null;
    error: string | null;
    completedAt: string | null;
  }[];
};

export const getLifecycleSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LifecycleConfig> => {
    await assertAdmin(context);
    const { getLifecycleConfig } = await import("@/lib/lifecycle.server");
    return getLifecycleConfig();
  });

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  batch_limit: z.number().int().min(1).max(500).optional(),
  free_trial: z
    .object({
      enabled: z.boolean().optional(),
      email_1_day: z.number().int().min(1).max(365).optional(),
      email_2_day: z.number().int().min(1).max(365).optional(),
      discount_1_percent: z.number().int().min(1).max(90).optional(),
      discount_2_percent: z.number().int().min(1).max(90).optional(),
      coupon_valid_days: z.number().int().min(1).max(365).optional(),
    })
    .optional(),
  inactive: z
    .object({
      enabled: z.boolean().optional(),
      inactive_days: z.number().int().min(1).max(365).optional(),
      email_1_day: z.number().int().min(1).max(365).optional(),
      email_2_day: z.number().int().min(1).max(365).optional(),
      email_3_day: z.number().int().min(1).max(365).optional(),
      final_warning_day: z.number().int().min(1).max(365).optional(),
      termination_day: z.number().int().min(1).max(730).optional(),
      terminate: z.boolean().optional(),
    })
    .optional(),
});

export const updateLifecycleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingsSchema.parse(input))
  .handler(async ({ data, context }): Promise<LifecycleConfig> => {
    await assertAdmin(context);
    const { saveLifecycleConfig } = await import("@/lib/lifecycle.server");
    return saveLifecycleConfig(data as Record<string, unknown>);
  });

export const getLifecycleStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LifecycleStats> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: rows } = await db
      .from("lifecycle_enrollments")
      .select("id, track, state, email, next_action_at, last_step_at, cancel_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (rows ?? []) as Record<string, any>[];

    const counts = new Map<string, number>();
    for (const row of list) {
      const key = `${row["track"]}|${row["state"]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const { data: actions } = await db
      .from("lifecycle_actions")
      .select("id, step_key, kind, status, event_key, coupon_code, error, completed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      byTrackState: Array.from(counts.entries()).map(([key, count]) => {
        const [track, state] = key.split("|");
        return { track: track ?? "", state: state ?? "", count };
      }),
      recent: list.slice(0, 25).map((row) => ({
        id: row["id"],
        track: row["track"],
        state: row["state"],
        email: row["email"] ?? null,
        nextActionAt: row["next_action_at"] ?? null,
        lastStepAt: row["last_step_at"] ?? null,
        cancelReason: row["cancel_reason"] ?? null,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentActions: ((actions ?? []) as Record<string, any>[]).map((row) => ({
        id: row["id"],
        stepKey: row["step_key"],
        kind: row["kind"],
        status: row["status"],
        eventKey: row["event_key"] ?? null,
        couponCode: row["coupon_code"] ?? null,
        error: row["error"] ?? null,
        completedAt: row["completed_at"] ?? null,
      })),
    };
  });

/** Runs one lifecycle cycle immediately (same code path as the scheduler). */
export const runLifecycleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runLifecycleCycle } = await import("@/lib/lifecycle.server");
    return runLifecycleCycle();
  });
