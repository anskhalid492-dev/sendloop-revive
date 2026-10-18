/**
 * Decides a mailbox's warmup start timestamp when automatic progression is
 * saved. A never-started mailbox (null started_at, no successful send
 * history) must begin fresh at Day 1 — never stay null, which would pin it
 * at Day 1 forever and block saving its settings.
 */
export function resolveWarmupStartAt(
  existingStartedAt: string | null | undefined,
  firstActivityDay: string | null | undefined,
  now: Date = new Date(),
): string {
  if (existingStartedAt) return existingStartedAt;
  if (firstActivityDay) return `${firstActivityDay}T00:00:00Z`;
  return now.toISOString();
}
