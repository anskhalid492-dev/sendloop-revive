/**
 * Referrer notifications.
 *
 * Every money-relevant referral milestone (new referred signup, commission
 * approved/rejected, payout processed) creates an in-app notification and,
 * when the referrer allows it, an email. Delivery problems are swallowed:
 * a notification must never roll back the underlying referral record.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatMoney } from "@/lib/referral-model";

const FROM = "Sendloop <referrals@sendloop.io>";

export type ReferralNotificationKind =
  | "referral_attributed"
  | "commission_approved"
  | "commission_rejected"
  | "commission_reversed"
  | "payout_processing"
  | "payout_paid"
  | "payout_rejected";

type NotifyInput = {
  userId: string;
  kind: ReferralNotificationKind;
  amountCents?: number | null;
  currency?: string | null;
  detail?: string | null;
  entityType?: string;
  entityId?: string | null;
};

function copyFor(input: NotifyInput): { title: string; message: string } {
  const money =
    typeof input.amountCents === "number"
      ? formatMoney(input.amountCents, input.currency ?? "usd")
      : null;
  switch (input.kind) {
    case "referral_attributed":
      return {
        title: "You have a new referral signup",
        message: "Someone created a Sendloop account through your referral link. You earn commission once they start paying.",
      };
    case "commission_approved":
      return {
        title: money ? `Commission approved — ${money}` : "Commission approved",
        message: "This commission is now part of your available balance and can be included in a payout request.",
      };
    case "commission_rejected":
      return {
        title: "A commission was not approved",
        message: input.detail ?? "A referral commission was reviewed and rejected by our team.",
      };
    case "commission_reversed":
      return {
        title: money ? `Commission reversed — ${money}` : "Commission reversed",
        message: input.detail ?? "The referred customer's payment was refunded or cancelled, so the commission was reversed.",
      };
    case "payout_processing":
      return {
        title: money ? `Payout of ${money} is being processed` : "Your payout is being processed",
        message: "We've started sending your referral payout. You'll get another update once it's on its way.",
      };
    case "payout_paid":
      return {
        title: money ? `Payout sent — ${money}` : "Your payout has been sent",
        message: input.detail ?? "Your referral payout has been processed. Bank or wallet transfers can take a few business days to land.",
      };
    case "payout_rejected":
      return {
        title: "Your payout request was declined",
        message: input.detail ?? "A payout request could not be processed. Check your payout details or contact support.",
      };
  }
}

async function sendEmail(to: string, title: string, message: string, link: string) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return;
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
      <p style="color:#333;line-height:1.6">${escapeHtml(message)}</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open your referral dashboard</a>
      </p>
      <p style="color:#888;font-size:12px">You receive this because referral updates are enabled in your Sendloop notification settings.</p>
    </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: title, html }),
    });
  } catch {
    /* provider unreachable — the in-app notification still exists */
  }
}

export async function notifyReferrer(input: NotifyInput): Promise<void> {
  try {
    const { title, message } = copyFor(input);

    const [{ data: prefs }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("notification_preferences")
        .select("in_app_enabled, email_enabled, referral_updates")
        .eq("user_id", input.userId)
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("email").eq("id", input.userId).maybeSingle(),
    ]);

    const wantsReferral = prefs?.referral_updates ?? true;
    if (!wantsReferral) return;

    if (prefs?.in_app_enabled ?? true) {
      await supabaseAdmin.from("notifications").insert({
        user_id: input.userId,
        type: input.kind,
        title,
        message,
        entity_type: input.entityType ?? "referral",
        entity_id: input.entityId ?? null,
      });
    }

    if ((prefs?.email_enabled ?? true) && profile?.email) {
      const base = process.env["PUBLIC_APP_URL"] ?? "https://sendloop.io";
      await sendEmail(profile.email, title, message, `${base}/referrals`);
    }
  } catch {
    /* notifications are best-effort */
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
