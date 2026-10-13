/** JSON with object keys sorted, so stored jsonb (which reorders keys) compares equal. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

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
    stableJson(latest.factors) === stableJson(next.factors)
  );
}
