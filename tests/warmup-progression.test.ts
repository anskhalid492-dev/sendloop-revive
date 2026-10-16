import { describe, expect, it } from "vitest";
import { DEFAULT_WARMUP_STAGES, resolveWarmupProgression, warmupCalendarDay, warmupStageLimit, validateWarmupStages, type ProgressionSettings } from "@/lib/warmup-progression";
const start = "2026-10-01T22:00:00Z";
const at = (day: number) => new Date(Date.UTC(2026, 9, day, 12));
const state = (day: number): ProgressionSettings => ({ started_at: start, progression_mode: "automatic", progression_day: day, progression_date: at(day).toISOString().slice(0, 10), progression_limit: warmupStageLimit(day).limit });
describe("per-mailbox automatic warmup (isolated, no network)", () => {
  it("progresses deterministically from 1 to 7 over days 1–8", () => {
    expect(Array.from({ length: 8 }, (_, i) => warmupStageLimit(i + 1).limit)).toEqual([1, 2, 3, 4, 4, 5, 6, 7]);
  });
  it("enters Stage 2 on day 9 at 7, not 15", () => { expect(warmupStageLimit(9)).toEqual({ stage: 2, limit: 7 }); });
  it("enters Stage 3 on day 19 at 15, not 30", () => { expect(warmupStageLimit(19)).toEqual({ stage: 3, limit: 15 }); });
  it("keeps separate mailbox checkpoints", () => {
    expect([5, 13, 22].map(day => resolveWarmupProgression(state(day), false, at(day)).limit)).toEqual([4, 11, 23]);
  });
  it("manual mode overrides dates", () => { expect(resolveWarmupProgression({ ...state(12), progression_mode: "manual", manual_daily_limit: 9 }, false, at(13)).limit).toBe(9); });
  it("returning to automatic resumes original day without resetting start", () => { const s = { ...state(12), manual_daily_limit: 3 }; expect(resolveWarmupProgression(s, false, at(13)).day).toBe(13); expect(resolveWarmupProgression(s, false, at(13)).limit).toBe(11); expect(s.started_at).toBe(start); });
  it("paused mailbox retains day and volume and sends zero", () => { const result = resolveWarmupProgression(state(5), true, at(22)); expect(result.day).toBe(5); expect(result.limit).toBe(4); expect(result.effectiveLimit).toBe(0); expect(result.nextLimit).toBe(4); });
  it("uses UTC calendar boundaries, not elapsed 24 hours", () => { expect(warmupCalendarDay(start, new Date("2026-10-02T00:00:00Z"))).toBe(2); });
  it("downtime never jumps across stages", () => { const result = resolveWarmupProgression(state(7), false, at(22)); expect(result.day).toBe(8); expect(result.stage).toBe(1); expect(result.limit).toBe(6); });
  it("repeated same-day resolution never increases limit", () => { const first = resolveWarmupProgression(state(8), false, at(9)); const second = resolveWarmupProgression({ ...state(8), progression_day: first.day, progression_date: first.date, progression_limit: first.limit }, false, at(9)); expect(second.day).toBe(9); expect(second.limit).toBe(7); });
  it("finishes at 30/day without growing beyond the final stage", () => { expect(warmupStageLimit(25).limit).toBe(30); expect(warmupStageLimit(100).limit).toBe(30); });
  it("rejects overlapping stages", () => { expect(validateWarmupStages([{ ...DEFAULT_WARMUP_STAGES[0], start_day: 1, end_day: 8, min_emails: 1, max_emails: 7 }, { start_day: 8, end_day: 18, min_emails: 7, max_emails: 15 }])).not.toBeNull(); });
  it("rejects gaps, descending volume and invalid ranges", () => {
    expect(validateWarmupStages([{ start_day: 2, end_day: 8, min_emails: 1, max_emails: 7 }])).not.toBeNull();
    expect(validateWarmupStages([{ start_day: 1, end_day: 8, min_emails: 8, max_emails: 7 }])).not.toBeNull();
    expect(validateWarmupStages(DEFAULT_WARMUP_STAGES)).toBeNull();
  });
  it("does not increase existing mailbox limit on opt-in", () => { const result = resolveWarmupProgression({ ...state(22), progression_limit: 4 }, false, at(22)); expect(result.limit).toBe(4); });
  it("unhealthy mailbox never increases the next expected limit", () => { const result = resolveWarmupProgression(state(12), true, at(13)); expect(result.nextLimit).toBe(10); });
  it("manual edits during a pause remain saved but never permit sending", () => { const result = resolveWarmupProgression({ ...state(12), progression_mode: "manual", manual_daily_limit: 17 }, true, at(13)); expect(result.limit).toBe(17); expect(result.effectiveLimit).toBe(0); });
});