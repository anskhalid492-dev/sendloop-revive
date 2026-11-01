/** Log structured diagnostics only: never prompts, conversations, keys or provider bodies. */
export function logMunchmateError(stage: string, error: unknown, provider?: string) {
  const e = error && typeof error === "object" ? error as { name?: string; status?: number; issues?: Array<{ code?: string; path?: unknown; maximum?: number }> } : {};
  console.error("MunchMate request failed", {
    stage, provider, name: e.name ?? "Error", status: e.status,
    issues: e.issues?.map((issue) => ({ code: issue.code, path: issue.path, maximum: issue.maximum })),
  });
}