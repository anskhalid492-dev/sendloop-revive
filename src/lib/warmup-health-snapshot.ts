/** True when a recalculated warmup health snapshot equals the latest stored one. */
export function isSameHealthSnapshot(
  latest: { score?: unknown; status?: unknown; factors?: unknown; recommendation?: unknown } | null,
  next: { score: number; status: string; factors: unknown; recommendation: string },
): boolean {
  if (!latest) return false;
  return (
    Number(latest.score) === next.score &&
    latest.status === next.status &&
    latest.recommendation === next.recommendation &&
    JSON.stringify(latest.factors ?? null) === JSON.stringify(next.factors ?? null)
  );
}
