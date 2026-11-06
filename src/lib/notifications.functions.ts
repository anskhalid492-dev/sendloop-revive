import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
  reply?: import("@/lib/reply-source.server").ReplySourceDetails | null;
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, message, entity_type, entity_id, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const { dedupeNotifications } = await import("@/lib/reply-source");
    const items = dedupeNotifications((data ?? []) as Notification[]);
    const convIds = items
      .filter((n) => n.type === "reply" && n.entity_type === "conversation" && n.entity_id)
      .map((n) => n.entity_id as string);
    if (convIds.length) {
      try {
        const { resolveReplySources } = await import("@/lib/reply-source.server");
        const map = await resolveReplySources(context.supabase, convIds);
        for (const n of items) if (n.entity_id && map.has(n.entity_id)) n.reply = map.get(n.entity_id);
      } catch (e) {
        console.warn("[notifications] source resolve failed:", e instanceof Error ? e.message : e);
      }
    }
    return { items, unread: items.filter((n) => !n.read).length };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Mark every unread notification for the signed-in user as read.
 *
 * Scoped explicitly to `user_id` (not just the RLS predicate) and returns the
 * rows it actually updated so the UI can tell a no-op from a real failure.
 */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", context.userId)
      .eq("read", false)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true, updated: (data ?? []).length };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notifications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
