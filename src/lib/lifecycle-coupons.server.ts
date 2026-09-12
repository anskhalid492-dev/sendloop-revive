/**
 * Lifecycle discount codes (server only).
 *
 * MunchReach had no discount system, so this adds the minimum: a real,
 * single-use promotion code created through the payment provider that is
 * already connected for live billing. Checkout already accepts promotion
 * codes, so the code in the email is the code that works at checkout.
 *
 * If a code cannot be created, the caller must NOT send the email — a fake
 * coupon is never invented.
 */

export type LifecycleCoupon = {
  code: string;
  percent: number;
  expiresAt: string;
  provider: string;
};

function randomCode(percent: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `MR${percent}-${suffix}`;
}

/**
 * Creates a one-time percentage discount code valid for `validDays`.
 * Returns null when the connected provider cannot issue codes; the caller
 * retries on the next cycle instead of sending an offer without a coupon.
 */
export async function createLifecycleCoupon(input: {
  percent: number;
  validDays: number;
  /** Stable key so a retried step reuses one provider-side object. */
  idempotencyKey: string;
}): Promise<LifecycleCoupon | null> {
  const percent = Math.min(90, Math.max(1, Math.round(input.percent)));
  const validDays = Math.min(365, Math.max(1, Math.round(input.validDays)));
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  try {
    const { getBillingSettings, isConfigured } = await import("@/lib/billing/core.server");
    const settings = await getBillingSettings();
    // Discount codes are only issued through the payment provider that is
    // actually connected for this environment.
    const provider = settings.defaultProvider ?? "stripe";
    if (provider !== "stripe") return null;
    if (!(await isConfigured("stripe", settings.environment))) return null;

    const { stripeCall } = await import("@/lib/billing/providers.server");
    const redeemBy = Math.floor(expiresAt.getTime() / 1000);

    const coupon = (await stripeCall(
      settings.environment,
      "coupons",
      {
        percent_off: percent,
        duration: "once",
        max_redemptions: 1,
        redeem_by: redeemBy,
        name: `MunchReach ${percent}% lifecycle offer`,
        metadata: { source: "munchreach_lifecycle", key: input.idempotencyKey },
      },
      "POST",
      `lifecycle-coupon-${input.idempotencyKey}`,
    )) as { id?: string };
    if (!coupon?.id) return null;

    const code = randomCode(percent);
    const promo = (await stripeCall(
      settings.environment,
      "promotion_codes",
      {
        coupon: coupon.id,
        code,
        max_redemptions: 1,
        expires_at: redeemBy,
        metadata: { source: "munchreach_lifecycle", key: input.idempotencyKey },
      },
      "POST",
      `lifecycle-promo-${input.idempotencyKey}`,
    )) as { code?: string };
    if (!promo?.code) return null;

    return { code: promo.code, percent, expiresAt: expiresAt.toISOString(), provider };
  } catch (error) {
    console.error("lifecycle coupon creation failed", error);
    return null;
  }
}
