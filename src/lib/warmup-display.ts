import type { DeliverabilityMetrics } from "@/lib/warmup-deliverability";

export type WarmupDisplaySignals = {
  health_score: number | null;
  safety_active: boolean;
  paused_by_system: boolean;
  block_reason: string | null;
  failed_today: number;
  spam_today: number;
  bounced_today: number;
  temp_failure_rate: number | null;
  safety_metrics: { bounced: number; complained: number; failed: number };
};

/** Absence of detected warnings is a health status, never placement evidence. */
export function showWarmupSafe(row: WarmupDisplaySignals, metrics: DeliverabilityMetrics | undefined): boolean {
  return row.health_score === 100 && metrics !== undefined
    && !row.safety_active && !row.paused_by_system && !row.block_reason
    && row.failed_today === 0 && row.spam_today === 0 && row.bounced_today === 0
    && (row.temp_failure_rate ?? 0) === 0
    && row.safety_metrics.bounced === 0 && row.safety_metrics.complained === 0 && row.safety_metrics.failed === 0
    && metrics.spam === 0 && metrics.bounced === 0 && metrics.failed === 0;
}