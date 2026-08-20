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
import {
  mergeReferralTemplates,
  renderReferralTemplate,
  REFERRAL_TEMPLATE_FALLBACK_DETAIL,
  type ReferralTemplateKind,
  type ReferralTemplateMap,
} from "@/lib/referral-templates";

const FROM = "MunchReach <referrals@sendloop.io>";

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

export async function loadReferralTemplates(): Promise<ReferralTemplateMap> {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "referral_templates")
    .maybeSingle();
  return mergeReferralTemplates(data?.value);
}

function copyFor(
  input: NotifyInput,
  templates: ReferralTemplateMap,
): { title: string; message: string; ctaLabel: string; enabled: boolean } {
  const money =
    typeof input.amountCents === "number"
      ? formatMoney(input.amountCents, input.currency ?? "usd")
      : null;
  const kind = input.kind as ReferralTemplateKind;
  const template = templates[kind];
  const vars = {
    amount: money,
    detail: input.detail ?? REFERRAL_TEMPLATE_FALLBACK_DETAIL[kind],
  };
  return {
    enabled: template.enabled,
    ctaLabel: template.ctaLabel,
    title: renderReferralTemplate(template.subject, vars),
    message: renderReferralTemplate(template.body, vars),
  };
}

async function sendEmail(to: string, title: string, message: string, link: string, ctaLabel: string) {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return;
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
      <p style="color:#333;line-height:1.6">${escapeHtml(message)}</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(ctaLabel)}</a>
      </p>
      <p style="color:#888;font-size:12px">You receive this because referral updates are enabled in your MunchReach notification settings.</p>
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
    const templates = await loadReferralTemplates();
    const { title, message, ctaLabel, enabled } = copyFor(input, templates);
    if (!enabled) return;

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
      await sendEmail(profile.email, title, message, `${base}/referrals`, ctaLabel);
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
