/**
 * Client-safe warmup types, presets and derivations.
 *
 * Nothing in here invents data: every number displayed in the UI comes from
 * rows the engine actually wrote after a real send or a real provider event.
 */

export type WarmupMode = "conservative" | "balanced" | "aggressive";

export type WarmupHealthStatus =
  | "healthy"
  | "good"
  | "warning"
  | "critical"
  | "paused"
  | "error";

export type WarmupJobStatus =
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "replied"
  | "failed"
  | "cancelled";

export type WarmupSettings = {
  id: string;
  sending_account_id: string;
  enabled: boolean;
  mode: WarmupMode;
  start_volume: number;
  max_volume: number;
  daily_increase: number;
  ramp_days: number;
  send_days: number[];
  send_start_hour: number;
  send_end_hour: number;
  timezone: string;
  reply_rate: number;
  max_bounce_rate: number;
  min_health_score: number;
  auto_pause: boolean;
  paused_by_system: boolean;
  pause_reason: string | null;
  paused_at: string | null;
  started_at: string | null;
};

export type WarmupPlacement =
  | "pending"
  | "inbox"
  | "spam"
  | "received_unknown"
  | "not_received"
  | "not_delivered";

export const PLACEMENT_LABEL: Record<WarmupPlacement, string> = {
  pending: "Awaiting arrival",
  inbox: "Inbox",
  spam: "Spam",
  received_unknown: "Received",
  not_received: "Not confirmed",
  not_delivered: "Not delivered",
};

export type WarmupDayStat = {
  day: string;
  target: number;
  scheduled: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  replied: number;
  inbox: number;
  spam: number;
  deferred: number;
  rejected: number;
  not_received: number;
  health_score: number | null;
};

export type WarmupHealthFactor = {
  label: string;
  impact: number;
  detail: string;
};

export type WarmupHealth = {
  score: number;
  status: WarmupHealthStatus;
  factors: WarmupHealthFactor[];
  recommendation: string | null;
  computed_at: string;
};

export type WarmupJob = {
  id: string;
  role: string;
  status: WarmupJobStatus;
  placement: WarmupPlacement | null;
  received_at: string | null;
  to_email: string;
  subject: string;
  scheduled_at: string;
  processed_at: string | null;
  attempts: number;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
};

export type MailboxCheck = {
  id: string;
  kind: "connect" | "reconnect" | "test" | "send" | "warmup_send";
  ok: boolean;
  provider: string | null;
  status_code: number | null;
  message: string | null;
  duration_ms: number | null;
  detail: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type DomainAlert = {
  id: string;
  domain_id: string;
  domain: string | null;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string | null;
  records: string[];
  resolved_at: string | null;
  created_at: string;
};

/** Ramp presets. Aggressive is still bounded by the account's max volume. */
export const WARMUP_MODES: Array<{
  id: WarmupMode;
  label: string;
  description: string;
  start_volume: number;
  daily_increase: number;
  max_volume: number;
  ramp_days: number;
  reply_rate: number;
}> = [
  {
    id: "conservative",
    label: "Conservative",
    description: "Slow, safest ramp for brand-new domains.",
    start_volume: 2,
    daily_increase: 1,
    max_volume: 25,
    ramp_days: 45,
    reply_rate: 30,
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Recommended for most mailboxes.",
    start_volume: 4,
    daily_increase: 2,
    max_volume: 40,
    ramp_days: 30,
    reply_rate: 35,
  },
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Faster ramp for established domains with clean history.",
    start_volume: 8,
    daily_increase: 4,
    max_volume: 80,
    ramp_days: 21,
    reply_rate: 40,
  },
];

export const HEALTH_STATUS_LABEL: Record<WarmupHealthStatus, string> = {
  healthy: "Healthy",
  good: "Good",
  warning: "Warning",
  critical: "Critical",
  paused: "Paused",
  error: "Error",
};

export function healthTone(status: WarmupHealthStatus): string {
  switch (status) {
    case "healthy":
      return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    case "good":
      return "text-sky-600 bg-sky-500/10 border-sky-500/20";
    case "warning":
      return "text-amber-600 bg-amber-500/10 border-amber-500/20";
    case "critical":
    case "error":
      return "text-destructive bg-destructive/10 border-destructive/20";
    default:
      return "text-muted-foreground bg-muted border-border";
  }
}

/** Percentage helper that returns null instead of a misleading 0 with no data. */
export function rate(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

export function statusFromScore(score: number): WarmupHealthStatus {
  if (score >= 85) return "healthy";
  if (score >= 70) return "good";
  if (score >= 50) return "warning";
  return "critical";
}

export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];
