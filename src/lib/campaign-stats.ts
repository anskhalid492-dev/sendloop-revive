/**
 * The single source of truth for campaign statistics.
 *
 * Every screen — workspace Analytics, the dashboard's Campaign performance
 * table, the Campaign Overview and the campaign's own Analytics tab — reads
 * these numbers through `computeCampaignStats`, so they can never disagree.
 *
 * Counting unit
 * -------------
 * One *logical email*: one (recipient, sequence step) pair. Retries, requeues
 * and duplicate planner rows for the same recipient+step collapse into a
 * single unit whose signals are the earliest observed of each kind. A message
 * can therefore never be counted twice, and a retry never adds a second send.
 *
 * Definitions
 * -----------
 * - sent:        the email was accepted by the sending provider (`sent_at`)
 * - delivered:   accepted by the recipient server and never bounced or failed
 * - opened / clicked / replied / unsubscribed / complained: real provider signals
 * - bounced / failed: mutually exclusive terminal outcomes (a bounce is not a failure)
 * - scheduled:   pending work — a planned email that has not been sent or cancelled
 * - sending:     handed to the dispatcher right now (`processing`)
 * - cancelled:   planned email that will never be sent
 * - contacted:   distinct leads with at least one sent email
 * - remaining:   audience leads never emailed
 */

export type CampaignStepStats = {
  /** 1-based sequence position. */
  step: number;
  /** Unique recipients this step actually emailed. */
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  /** Pending emails still planned for this step. */
  scheduled: number;
};

export type CampaignStats = {
  campaignId: string;
  name: string;
  status: string;
  leads: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  positiveReplied: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  failed: number;
  remaining: number;
  /** Pending emails (all steps), de-duplicated per recipient+step. */
  scheduled: number;
  cancelled: number;
  delayed: number;
  /** Distinct leads with at least one accepted email. */
  contacted: number;
  byStep: CampaignStepStats[];
};

const n = (value: unknown) => Number(value ?? 0) || 0;

export function toCampaignStats(row: Record<string, unknown>): CampaignStats {
  return {
    campaignId: String(row["campaign_id"] ?? ""),
    name: String(row["campaign_name"] ?? "Untitled campaign"),
    status: String(row["status"] ?? "draft"),
    leads: n(row["leads"]),
    queued: n(row["queued"]),
    sending: n(row["sending"]),
    sent: n(row["sent"]),
    delivered: n(row["delivered"]),
    opened: n(row["opened"]),
    clicked: n(row["clicked"]),
    replied: n(row["replied"]),
    positiveReplied: n(row["positive_replied"]),
    bounced: n(row["bounced"]),
    unsubscribed: n(row["unsubscribed"]),
    complained: n(row["complained"]),
    failed: n(row["failed"]),
    remaining: n(row["remaining"]),
    scheduled: n(row["scheduled"] ?? row["queued"]),
    cancelled: n(row["cancelled"]),
    delayed: n(row["delayed"]),
    contacted: n(row["contacted"]),
    byStep: [],
  };
}

export const EMPTY_CAMPAIGN_STATS = (
  campaignId: string,
  name = "",
  status = "draft",
): CampaignStats => ({
  campaignId,
  name,
  status,
  leads: 0,
  queued: 0,
  sending: 0,
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  positiveReplied: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
  failed: 0,
  remaining: 0,
  scheduled: 0,
  cancelled: 0,
  delayed: 0,
  contacted: 0,
  byStep: [],
});

/** Rate helper shared by every stats surface, so percentages match too. */
export function rate(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

/* ------------------------------------------------------------------------ */
/* Authoritative computation                                                 */
/* ------------------------------------------------------------------------ */

export type CampaignMessageRow = {
  id: string;
  campaign_id?: string | null;
  sending_account_id?: string | null;
  recipient_id?: string | null;
  lead_id?: string | null;
  step_order?: number | string | null;
  status?: string | null;
  delivery_status?: string | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  replied_at?: string | null;
  bounced_at?: string | null;
  complained_at?: string | null;
  unsubscribed_at?: string | null;
  failed_at?: string | null;
  delayed_at?: string | null;
  updated_at?: string | null;
};

/** Per-message provider signals, keyed by message id (event feed). */
export type MessageEventSignals = Map<string, Partial<Record<SignalKey, string>>>;

export type SignalKey =
  | "delivered_at"
  | "opened_at"
  | "clicked_at"
  | "replied_at"
  | "bounced_at"
  | "complained_at"
  | "unsubscribed_at"
  | "failed_at";

const PENDING_STATUSES = new Set(["pending", "scheduled", "queued"]);

type Unit = {
  leadKey: string;
  step: number;
  status: string;
  deliveryStatus: string;
  sentAt: string | null;
  signals: Record<SignalKey, string | null>;
  cancelled: boolean;
  pending: boolean;
  processing: boolean;
  updatedAt: string | null;
};

const earlier = (a: string | null, b: string | null | undefined) => {
  if (!a) return b ?? null;
  if (!b) return a;
  return a <= b ? a : b;
};

const SIGNALS: SignalKey[] = [
  "delivered_at",
  "opened_at",
  "clicked_at",
  "replied_at",
  "bounced_at",
  "complained_at",
  "unsubscribed_at",
  "failed_at",
];

export type ComputeInput = {
  campaignId: string;
  name?: string;
  status?: string;
  /** Audience size (exact recipient count). */
  leads: number;
  messages: CampaignMessageRow[];
  /** Extra signals coming from the real per-message event feed. */
  events?: MessageEventSignals;
  positiveReplied?: number;
  /** Optional reporting window applied to signal timestamps. */
  from?: Date | null;
  to?: Date | null;
};

/**
 * Collapse raw message rows into logical units: exactly one per
 * recipient+step. Retries, requeues and duplicate webhook writes therefore
 * can never inflate a count.
 */
export function collapseMessageUnits(
  messages: CampaignMessageRow[],
  events?: MessageEventSignals,
): Map<string, Unit> {
  const units = new Map<string, Unit>();
  for (const m of messages) {
    const leadKey = String(m.recipient_id ?? m.lead_id ?? m.id);
    const step = Math.max(1, Number(m.step_order ?? 1) || 1);
    const key = `${leadKey}|${step}`;
    const status = String(m.status ?? "");
    const eventSignals = events?.get(m.id) ?? {};

    const existing = units.get(key);
    const unit: Unit = existing ?? {
      leadKey,
      step,
      status,
      accountId: m.sending_account_id ? String(m.sending_account_id) : null,
      deliveryStatus: String(m.delivery_status ?? ""),
      sentAt: null,
      signals: {
        delivered_at: null,
        opened_at: null,
        clicked_at: null,
        replied_at: null,
        bounced_at: null,
        complained_at: null,
        unsubscribed_at: null,
        failed_at: null,
      },
      cancelled: true,
      pending: false,
      processing: false,
      updatedAt: null,
    };

    unit.sentAt = earlier(unit.sentAt, m.sent_at ?? null);
    for (const signal of SIGNALS) {
      unit.signals[signal] = earlier(
        unit.signals[signal],
        earlier(m[signal] ?? null, eventSignals[signal] ?? null),
      );
    }
    unit.updatedAt = earlier(unit.updatedAt, m.updated_at ?? null);
    // A unit is only cancelled when every row for it is cancelled.
    if (status !== "cancelled") unit.cancelled = false;
    if (!m.sent_at && PENDING_STATUSES.has(status)) unit.pending = true;
    if (!m.sent_at && status === "processing") unit.processing = true;
    if (m.delivery_status === "delayed") unit.deliveryStatus = "delayed";
    if (status === "failed" || m.delivery_status === "failed") {
      if (unit.status !== "sent") unit.status = "failed";
    }
    if (m.sent_at) {
      unit.status = "sent";
      if (m.sending_account_id) unit.accountId = String(m.sending_account_id);
    }
    units.set(key, unit);
  }
  return units;
}

/**
 * Collapse raw message rows into logical units (one per recipient+step) and
 * count every metric from them. This is the only place campaign metrics are
 * derived; the SQL mirror exists purely as an optimisation.
 */
export function computeCampaignStats(input: ComputeInput): CampaignStats {
  const lo = input.from ? input.from.getTime() : -Infinity;
  const hi = input.to ? input.to.getTime() : Infinity;
  const inRange = (value: string | null) => {
    if (!value) return false;
    const at = new Date(value).getTime();
    return Number.isFinite(at) && at >= lo && at < hi;
  };

  const units = collapseMessageUnits(input.messages, input.events);


  const stats = EMPTY_CAMPAIGN_STATS(
    input.campaignId,
    input.name ?? "",
    input.status ?? "draft",
  );
  stats.leads = input.leads;
  stats.positiveReplied = input.positiveReplied ?? 0;

  const contacted = new Set<string>();
  const repliedLeads = new Set<string>();
  const steps = new Map<number, CampaignStepStats>();
  const stepOf = (step: number) => {
    let row = steps.get(step);
    if (!row) {
      row = { step, sent: 0, delivered: 0, opened: 0, replied: 0, scheduled: 0 };
      steps.set(step, row);
    }
    return row;
  };

  for (const unit of units.values()) {
    const s = unit.signals;
    const step = stepOf(unit.step);
    const bounced = Boolean(s.bounced_at);
    const failed = Boolean(s.failed_at) || (!bounced && unit.status === "failed" && !unit.sentAt);

    if (inRange(unit.sentAt)) {
      stats.sent += 1;
      step.sent += 1;
      contacted.add(unit.leadKey);
    }
    if (inRange(s.delivered_at) && !bounced && !s.failed_at) {
      stats.delivered += 1;
      step.delivered += 1;
    }
    if (inRange(s.opened_at)) {
      stats.opened += 1;
      step.opened += 1;
    }
    if (inRange(s.clicked_at)) stats.clicked += 1;
    if (inRange(s.replied_at)) {
      repliedLeads.add(unit.leadKey);
      step.replied += 1;
    }
    if (inRange(s.bounced_at)) stats.bounced += 1;
    if (inRange(s.unsubscribed_at)) stats.unsubscribed += 1;
    if (inRange(s.complained_at)) stats.complained += 1;
    if (!bounced && (inRange(s.failed_at) || (failed && inRange(unit.updatedAt)))) {
      stats.failed += 1;
    }
    if (unit.cancelled) stats.cancelled += 1;
    else if (unit.pending && !unit.sentAt) {
      stats.scheduled += 1;
      step.scheduled += 1;
    }
    if (unit.processing && !unit.sentAt) stats.sending += 1;
    if (unit.deliveryStatus === "delayed") stats.delayed += 1;
  }

  stats.replied = repliedLeads.size;
  stats.contacted = contacted.size;
  stats.queued = stats.scheduled;
  stats.remaining = Math.max(0, stats.leads - stats.contacted);
  stats.byStep = Array.from(steps.values()).sort((a, b) => a.step - b.step);
  return stats;
}
