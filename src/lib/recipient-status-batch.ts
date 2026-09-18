/**
 * Batching for `campaign_recipients` bookkeeping writes.
 *
 * Dispatch used to issue one HTTP update per recipient. Recipients that receive
 * the SAME patch (same step, same next-send time, same status) can be written in
 * one call, which is what this groups them into — while keeping each recipient's
 * own outcome, because a recipient whose patch differs lands in its own group.
 *
 * Deliberately NOT batched (see dispatch.server.ts):
 *  - the `processing` claim on campaign_messages: it is the per-row idempotency
 *    lock that stops two runners sending the same email.
 *  - the terminal `sent` / `failed` patch on campaign_messages: every row
 *    carries its own provider ids, send time or error text.
 */
export type RecipientPatch = Record<string, string | number | null>;

export type RecipientPatchEntry = { id: string; patch: RecipientPatch };

export type RecipientPatchBatch = { patch: RecipientPatch; ids: string[] };

/** Stable key so two identical patches group together regardless of key order. */
function patchKey(patch: RecipientPatch): string {
  return JSON.stringify(
    Object.keys(patch)
      .sort()
      .map((key) => [key, patch[key]]),
  );
}

/**
 * Groups entries by identical patch and splits each group into chunks of at most
 * `chunkSize` ids. Later entries for the same recipient win, so a recipient can
 * never be written twice in one flush with stale values.
 */
export function groupRecipientPatches(
  entries: Iterable<RecipientPatchEntry>,
  chunkSize = 100,
): RecipientPatchBatch[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const latest = new Map<string, RecipientPatch>();
  for (const entry of entries) {
    if (!entry?.id) continue;
    latest.set(entry.id, entry.patch);
  }

  const groups = new Map<string, RecipientPatchBatch>();
  for (const [id, patch] of latest) {
    const key = patchKey(patch);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { patch, ids: [id] });
  }

  const batches: RecipientPatchBatch[] = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.ids.length; i += size) {
      batches.push({ patch: group.patch, ids: group.ids.slice(i, i + size) });
    }
  }
  return batches;
}
