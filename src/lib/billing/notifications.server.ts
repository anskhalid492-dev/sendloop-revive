/**
 * Billing → transactional email notifications.
 *
 * Every automatic billing email (subscription started, upgraded, downgraded,
 * cancelled, invoice paid, payment failed, refund) is emitted from here after
 * the provider event has been applied. It never throws: a notification failure
 * must never fail webhook processing.
 */
import type { BillingProvider } from "@/lib/billing/model";
import type { NormalizedBillingEvent } from "@/lib/billing/core.server";
import { emitTransactionalEvent } from "@/lib/transactional-events.server";

type Db = Awaited<ReturnType<typeof import("@/lib/billing/core.server").admin>>;

function money(cents: number | null | undefined, currency: string | null | undefined) {
  const value = ((cents ?? 0) / 100).toFixed(2);
  const code = (currency ?? "usd").toUpperCase();
  return code === "USD" ? `$${value}` : `${value} ${code}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function resolveOwner(db: Db, workspaceId: string) {
  const { data: ws } = await db
    .from("workspaces")
    .select("owner_id, name")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws?.owner_id) return null;
  return { userId: ws.owner_id as string, workspaceName: (ws.name as string | null) ?? "" };
}

async function planInfo(db: Db, planId: string | null) {
  if (!planId) return { name: "your plan", price: "" };
  const { data } = await db.from("plans").select("name, monthly_price").eq("id", planId).maybeSingle();
  const monthly = Number(data?.monthly_price ?? 0);
  return {
    name: (data?.name as string | null) ?? "your plan",
    price: monthly > 0 ? `$${monthly}/mo` : "Free",
    rank: monthly,
  };
}

export async function notifyBillingEvent(
  db: Db,
  input: {
    provider: BillingProvider;
    event: NormalizedBillingEvent;
    workspaceId: string | null;
    planId: string | null;
    previousPlanId: string | null;
    previousStatus: string | null;
  },
): Promise<void> {
  try {
    const { event, workspaceId, planId } = input;
    if (!workspaceId) return;
    const owner = await resolveOwner(db, workspaceId);
    if (!owner) return;

    const plan = await planInfo(db, planId);
    const base = {
      userId: owner.userId,
      workspaceId,
      variables: {
        "plan.name": plan.name,
        "plan.price": plan.price,
        "workspace.name": owner.workspaceName,
      } as Record<string, unknown>,
    };

    const emit = (eventKey: string, extra: Record<string, unknown>, suffix: string) =>
      emitTransactionalEvent({
        ...base,
        eventKey,
        variables: { ...base.variables, ...extra },
        idempotencyKey: `${event.eventId}:${suffix}`,
        immediate: true,
      });

    // ── Subscription lifecycle ────────────────────────────────────────────
    const s = event.subscription;
    if (s) {
      const nextPayment = formatDate(s.currentPeriodEnd);
      if (s.status === "cancelled" || s.status === "expired") {
        await emit("subscription.cancelled", { "billing.next_payment_date": nextPayment }, "cancelled");
      } else if (s.status === "active" || s.status === "trialing") {
        const prev = await planInfo(db, input.previousPlanId);
        const changed = input.previousPlanId && input.previousPlanId !== planId;
        if (changed && (plan.rank ?? 0) > (prev.rank ?? 0)) {
          await emit("subscription.upgraded", { "billing.next_payment_date": nextPayment }, "upgraded");
        } else if (changed) {
          await emit("subscription.downgraded", { "billing.next_payment_date": nextPayment }, "downgraded");
        } else if (!input.previousStatus) {
          await emit("subscription.created", { "billing.next_payment_date": nextPayment }, "created");
        } else if (event.eventType.includes("renew") || event.eventType === "invoice.paid") {
          await emit("subscription.renewed", { "billing.next_payment_date": nextPayment }, "renewed");
        }
      }
    }

    // ── Invoices ──────────────────────────────────────────────────────────
    const i = event.invoice;
    if (i) {
      const vars = {
        "invoice.number": i.number ?? i.externalId,
        "invoice.total": money(i.amountCents, i.currency),
      };
      if (i.status === "paid") await emit("invoice.paid", vars, "invoice-paid");
      else if (i.status === "uncollectible" || i.status === "failed" || i.status === "past_due")
        await emit("invoice.payment_failed", vars, "invoice-failed");
    }

    // ── Payments and refunds ──────────────────────────────────────────────
    const t = event.transaction;
    if (t) {
      const vars = {
        "invoice.total": money(t.amountCents, t.currency),
        "invoice.number": i?.number ?? t.externalId,
      };
      if (t.kind === "refund") await emit("payment.refunded", vars, "refunded");
      else if (t.kind === "payment" && t.status === "succeeded")
        await emit("payment.succeeded", vars, "payment-ok");
      else if (t.kind === "payment" && (t.status === "failed" || t.status === "requires_action"))
        await emit("payment.failed", vars, "payment-failed");
    }
  } catch (error) {
    console.error("billing notification failed", error);
  }
}
