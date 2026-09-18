/**
 * Public unsubscribe endpoint for campaign emails.
 *
 * The link carries a signed token (workspace + campaign + recipient email), so
 * no enumeration is possible and no session is required. GET renders a small
 * confirmation page; POST supports RFC 8058 one-click unsubscribe.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  parseUnsubscribeToken,
  resolveUnsubscribeSource,
  type UnsubscribeSource,
} from "@/lib/unsubscribe";

function page(title: string, message: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;"><div style="max-width:520px;margin:12vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center;"><h1 style="font-size:20px;margin:0 0 12px;">${title}</h1><p style="font-size:15px;line-height:1.6;margin:0;color:#475569;">${message}</p></div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function unsubscribe(token: string, source: UnsubscribeSource, userAgent: string | null) {
  const target = parseUnsubscribeToken(token);
  if (!target) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { suppressEmail } = await import("@/lib/suppression.server");

  await suppressEmail({
    workspaceId: target.workspaceId,
    email: target.email,
    reason: "unsubscribed",
    source: "unsubscribe_link",
    detail: `campaign:${target.campaignId}`,
  });

  const nowIso = new Date().toISOString();

  // Attribution row. One per campaign + address, so a reader who clicks twice
  // (or whose mail client prefetches the link) is still a single unsubscribe.
  await supabaseAdmin
    .from("campaign_unsubscribes")
    .upsert(
      {
        workspace_id: target.workspaceId,
        campaign_id: target.campaignId,
        recipient_id: target.recipientId ?? null,
        email: target.email,
        source,
        user_agent: userAgent ? userAgent.slice(0, 300) : null,
      },
      { onConflict: "campaign_id,email", ignoreDuplicates: true },
    )
    .then(
      () => undefined,
      (error: unknown) => {
        // Reporting must never break the reader's unsubscribe.
        console.warn("[unsubscribe] could not record source", error);
      },
    );

  if (target.recipientId) {
    await supabaseAdmin
      .from("campaign_recipients")
      .update({ status: "unsubscribed", next_send_at: null })
      .eq("id", target.recipientId);
  }

  await supabaseAdmin
    .from("campaign_messages")
    .update({ unsubscribed_at: nowIso })
    .eq("campaign_id", target.campaignId)
    .eq("to_email", target.email)
    .is("unsubscribed_at", null);

  // Stop any further queued emails for this address in this campaign, recording
  // why — otherwise the stopped mail hides the unsubscribe inside "cancelled".
  await supabaseAdmin
    .from("campaign_messages")
    .update({ status: "cancelled", cancelled_reason: "recipient_unsubscribed" })
    .eq("campaign_id", target.campaignId)
    .eq("to_email", target.email)
    .eq("status", "scheduled");

  return target;
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t") ?? "";
        const source = resolveUnsubscribeSource({
          method: "GET",
          sourceParam: url.searchParams.get("s"),
        });
        const target = await unsubscribe(
          token,
          source,
          request.headers.get("user-agent"),
        ).catch(() => null);
        if (!target) {
          return page("Link not valid", "This unsubscribe link is invalid or has expired.", 400);
        }
        return page(
          "You're unsubscribed",
          "You will not receive any further emails from this sender. Nothing else is required.",
        );
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let token = url.searchParams.get("t") ?? "";
        if (!token) {
          const body = await request.text().catch(() => "");
          token = new URLSearchParams(body).get("t") ?? "";
        }
        const source = resolveUnsubscribeSource({ method: "POST" });
        const target = await unsubscribe(
          token,
          source,
          request.headers.get("user-agent"),
        ).catch(() => null);
        return new Response(target ? "ok" : "invalid token", { status: target ? 200 : 400 });
      },
    },
  },
});

