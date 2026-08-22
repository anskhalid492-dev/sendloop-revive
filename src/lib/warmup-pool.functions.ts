import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { WarmupPoolRecipient, WarmupPoolHistoryRow } from "./warmup-pool.server";

const uuid = z.string().uuid();

/** Admin: the platform warmup recipient pool with activity counters. */
export const adminListWarmupPool = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ search: z.string().max(200).optional().nullable() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { listWarmupPool } = await import("./warmup-pool.server");
    return listWarmupPool(data.search ?? null);
  });

/** Admin: bulk CSV / pasted list import of warmup recipients. */
export const adminImportWarmupRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ csv: z.string().min(3).max(500_000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { importWarmupRecipients } = await import("./warmup-pool.server");
    return importWarmupRecipients(data.csv, context.userId);
  });

/** Admin: add one warmup recipient manually. */
export const adminAddWarmupRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        name: z.string().max(120).optional().nullable(),
        provider: z.string().max(60).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { addWarmupRecipient } = await import("./warmup-pool.server");
    return addWarmupRecipient({ ...data, userId: context.userId });
  });

/** Admin: enable, disable or remove a warmup recipient. */
export const adminWarmupRecipientControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: uuid, action: z.enum(["enable", "disable", "remove"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { setWarmupRecipientEnabled, removeWarmupRecipient } = await import(
      "./warmup-pool.server"
    );
    if (data.action === "remove") await removeWarmupRecipient(data.id);
    else await setWarmupRecipientEnabled(data.id, data.action === "enable");
    return { ok: true };
  });

/** Admin: per-message warmup history for one recipient. */
export const adminWarmupRecipientHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("./admin-access.server");
    await assertSuperAdmin(context);
    const { warmupRecipientHistory } = await import("./warmup-pool.server");
    return warmupRecipientHistory(data.id);
  });
