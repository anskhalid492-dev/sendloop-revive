/**
 * Customer bug reports.
 *
 * Reads and writes run as the signed-in customer, so RLS keeps each customer to
 * their own reports. The workspace and the submission time are recorded
 * server-side rather than trusted from the browser, and the screenshot is only
 * ever referenced by its private storage key — never by a public URL.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { legacyKeyToR2, ownerFromKey } from "@/lib/files-model";
import { BUG_DETAILS_MAX, MAX_BUG_SCREENSHOT_BYTES, type BugStatus } from "@/lib/bug-report-model";

export type BugReport = {
  id: string;
  details: string;
  screenshot_name: string | null;
  screenshot_path: string | null;
  status: BugStatus;
  created_at: string;
};

const screenshot = z
  .object({
    path: z.string().trim().min(3).max(400),
    name: z.string().trim().min(1).max(200),
    size: z.number().int().positive().max(MAX_BUG_SCREENSHOT_BYTES),
  })
  .nullish();

export const submitBugReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        details: z.string().trim().min(1).max(BUG_DETAILS_MAX),
        workspaceId: z.string().uuid().nullish(),
        screenshot,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    // The uploaded object must belong to the caller; a key naming somebody
    // else's prefix is rejected instead of being stored.
    if (data.screenshot) {
      const owner = ownerFromKey(legacyKeyToR2("support", data.screenshot.path));
      if (!owner || owner.userId !== context.userId) throw new Error("Forbidden");
    }

    const { data: row, error } = await context.supabase
      .from("bug_reports")
      .insert({
        user_id: context.userId,
        workspace_id: data.workspaceId ?? null,
        details: data.details,
        screenshot_path: data.screenshot?.path ?? null,
        screenshot_name: data.screenshot?.name ?? null,
        screenshot_size: data.screenshot?.size ?? null,
        status: "new",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: row.id as string };
  });

export const listMyBugReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BugReport[]> => {
    const { data, error } = await context.supabase
      .from("bug_reports")
      .select("id, details, screenshot_name, screenshot_path, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BugReport[];
  });

/** Short-lived private link to a screenshot the caller uploaded themselves. */
export const getBugScreenshotUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().trim().min(3).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    const key = legacyKeyToR2("support", data.path);
    const owner = ownerFromKey(key);
    if (!owner || owner.userId !== context.userId) throw new Error("Forbidden");
    const { presignR2Url } = await import("@/lib/r2.server");
    return { url: await presignR2Url({ key, method: "GET", expiresInSeconds: 300 }) };
  });
