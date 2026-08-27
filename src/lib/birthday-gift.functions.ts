/**
 * Admin API for the birthday gift automation (read-only log).
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export type BirthdayGiftLogRow = {
  id: string;
  giftYear: number;
  giftDate: string;
  email: string | null;
  timezone: string | null;
  granted: boolean;
  grantExpiresAt: string | null;
  grantError: string | null;
  emailStatus: string;
  deliveryStatus: string | null;
  createdAt: string;
};

export const listBirthdayGifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BirthdayGiftLogRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { BIRTHDAY_GIFT_EVENT_KEY } = await import("@/lib/birthday-gift.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (supabaseAdmin as any);

    const { data, error } = await db
      .from("birthday_gifts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return [];

    const rows = (data ?? []) as Record<string, any>[];
    const emails = rows.map((r) => r["email_to"]).filter(Boolean) as string[];

    const delivery = new Map<string, string>();
    if (emails.length) {
      const { data: sends } = await db
        .from("transactional_emails")
        .select("to_email, status, queued_at")
        .eq("event_key", BIRTHDAY_GIFT_EVENT_KEY)
        .in("to_email", Array.from(new Set(emails)))
        .order("queued_at", { ascending: false })
        .limit(500);
      for (const send of (sends ?? []) as Record<string, any>[]) {
        if (!delivery.has(send["to_email"])) delivery.set(send["to_email"], send["status"]);
      }
    }

    return rows.map((row) => ({
      id: row["id"],
      giftYear: row["gift_year"],
      giftDate: row["gift_date"],
      email: row["email_to"] ?? null,
      timezone: row["timezone"] ?? null,
      granted: Boolean(row["granted"]),
      grantExpiresAt: row["grant_expires_at"] ?? null,
      grantError: row["grant_error"] ?? null,
      emailStatus: row["email_status"] ?? "pending",
      deliveryStatus: delivery.get(row["email_to"]) ?? null,
      createdAt: row["created_at"],
    }));
  });
