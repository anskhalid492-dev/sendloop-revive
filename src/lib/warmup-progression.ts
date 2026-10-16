/** Shared UTC calendar ramp. Safety remains authoritative over this schedule. */
export type ProgressionStage = { start_day: number; end_day: number; min_emails: number; max_emails: number };
export type ProgressionMode = "automatic" | "manual" | "legacy";
export const DEFAULT_WARMUP_STAGES: ProgressionStage[] = [
  { start_day: 1, end_day: 8, min_emails: 1, max_emails: 7 },
  { start_day: 9, end_day: 18, min_emails: 7, max_emails: 15 },
  { start_day: 19, end_day: 25, min_emails: 15, max_emails: 30 },
];
export const PROGRESSION_COLUMNS = "progression_mode, progression_stages, manual_daily_limit, progression_day, progression_date, progression_limit, progression_review_required";
export type ProgressionSettings = {
  progression_mode?: ProgressionMode;
  progression_stages?: ProgressionStage[] | null;
  manual_daily_limit?: number | null;
  progression_day?: number | null;
  progression_date?: string | null;
  progression_limit?: number | null;
  progression_review_required?: boolean;
  started_at?: string | null;
};
export function validateWarmupStages(stages: ProgressionStage[]): string | null {
  if (!stages.length || stages.length > 12) return "Use between 1 and 12 stages.";
  let end = 0, max = 0;
  for (const s of stages) {
    if (![s.start_day, s.end_day, s.min_emails, s.max_emails].every(Number.isInteger)) return "Stage values must be whole numbers.";
    if (s.start_day !== end + 1 || s.end_day < s.start_day || s.end_day > 365) return "Stages must be consecutive, ordered, and cover days starting at Day 1 without gaps or overlaps.";
    if (s.min_emails < 1 || s.max_emails < s.min_emails || s.max_emails > 400 || s.min_emails < max) return "Email ranges must increase in order and stay between 1 and 400.";
    end = s.end_day; max = s.max_emails;
  }
  return null;
}
export function warmupCalendarDay(start: string | null | undefined, now = new Date()): number {
  if (!start || !Number.isFinite(Date.parse(start))) return 0;
  const date = new Date(start).toISOString().slice(0, 10);
  return Math.max(1, Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(date)) / 86400000) + 1);
}
export function warmupStageLimit(day: number, stages = DEFAULT_WARMUP_STAGES) {
  const safe = validateWarmupStages(stages) ? DEFAULT_WARMUP_STAGES : stages;
  const index = safe.findIndex(s => day <= s.end_day);
  const stageIndex = index < 0 ? safe.length - 1 : index;
  const stage = safe[stageIndex] ?? DEFAULT_WARMUP_STAGES[0];
  if (!stage) return { stage: 1, limit: 1 };
  const fraction = stage.end_day === stage.start_day ? 0 : Math.max(0, Math.min(1, (day - stage.start_day) / (stage.end_day - stage.start_day)));
  return { stage: stageIndex + 1, limit: Math.round(stage.min_emails + fraction * (stage.max_emails - stage.min_emails)) };
}
/** No catch-up jump: after an unobserved gap, process the next ramp day only. */
export function resolveWarmupProgression(s: ProgressionSettings, blocked: boolean, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const calendarDay = warmupCalendarDay(s.started_at, now);
  const previousDay = Math.max(1, s.progression_day ?? 1);
  const elapsed = s.progression_date ? Math.max(0, Math.floor((Date.parse(date) - Date.parse(s.progression_date)) / 86400000)) : 0;
  const day = blocked ? previousDay : Math.min(Math.max(1, calendarDay), previousDay + (elapsed > 0 ? 1 : 0));
  const stages = s.progression_stages ?? DEFAULT_WARMUP_STAGES;
  const scheduled = warmupStageLimit(day, stages);
  const manual = s.progression_mode === "manual";
  const desired = manual ? Math.max(1, Math.min(400, s.manual_daily_limit ?? s.progression_limit ?? 1)) : scheduled.limit;
  const previous = s.progression_limit ?? desired;
  // Keep the resumed day conservative; a later clean calendar day may increase.
  const limit = blocked ? previous : !manual && s.progression_date && elapsed !== 1 ? Math.min(desired, previous) : desired;
  return { calendarDay, day, stage: scheduled.stage, limit, effectiveLimit: blocked ? 0 : limit,
    nextLimit: blocked ? previous : manual ? limit : warmupStageLimit(day + 1, stages).limit,
    nextAt: new Date(Date.parse(date) + 86400000).toISOString(), date };
}