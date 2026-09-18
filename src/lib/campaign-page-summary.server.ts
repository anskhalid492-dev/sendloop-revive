/**
 * Backwards-compatible campaign summary for production databases that have
 * not received `campaign_page_summary` yet. Every request is a database-side
 * aggregate (`head: true` or a one-row ordered lookup); no message or
 * recipient collection is returned to the worker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

type CountFilter = {
  column: string;
  operator: "eq" | "gte" | "is" | "notNull";
  value: unknown;
};

async function exactCount(
  supabase: Client,
  table: "campaign_recipients" | "campaign_messages",
  campaignId: string,
  filters: CountFilter[] = [],
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  for (const filter of filters) {
    query =
      filter.operator === "notNull"
        ? query.not(filter.column, "is", null)
        : query[filter.operator](filter.column, filter.value);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return Number(count ?? 0) || 0;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await task(value);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function campaignPageSummaryFallback(
  supabase: Client,
  campaignId: string,
  dayStart: string,
): Promise<Record<string, unknown>> {
  const recipientStatuses = [
    "pending",
    "in_progress",
    "completed",
    "replied",
    "bounced",
    "unsubscribed",
    "failed",
    "stopped",
  ] as const;
  const countRecipient = (status?: string) =>
    exactCount(
      supabase,
      "campaign_recipients",
      campaignId,
      status ? [{ column: "status", operator: "eq", value: status }] : [],
    );
  const countMessage = (filters: CountFilter[]) =>
    exactCount(supabase, "campaign_messages", campaignId, filters);

  const recipientStatusCounts = await mapWithConcurrency(recipientStatuses, 4, countRecipient);
  const recipientTotal = await countRecipient();

  // Bounced / unsubscribed / complained come from the shared per-person rule, so
  // a recipient whose remaining mail was cancelled after a bounce or unsubscribe
  // is still counted instead of hiding inside "cancelled".
  const { OUTCOME_COLUMNS, OUTCOME_OR_FILTER, countOutcomeRecipients } = await import(
    "@/lib/cancellation-reason"
  );
  const outcomeRes = await supabase
    .from("campaign_messages")
    .select(OUTCOME_COLUMNS)
    .eq("campaign_id", campaignId)
    .or(OUTCOME_OR_FILTER)
    .limit(5000);
  if (outcomeRes.error) throw new Error(outcomeRes.error.message);
  const outcomes = countOutcomeRecipients(outcomeRes.data ?? []);

  const [
    sent,
    scheduled,
    processing,
    cancelled,
    delivered,
    delayed,
    opened,
    clicked,
    replied,
    bounced,
    complained,
    unsubscribed,
    failed,
    sentToday,
    deliveredToday,
    openedToday,
    clickedToday,
    repliedToday,
    bouncedToday,
    failedToday,
    nextPendingRes,
  ] = await mapWithConcurrency<Promise<unknown>, unknown>([
    countMessage([{ column: "sent_at", operator: "notNull", value: null }]),
    countMessage([
      { column: "sent_at", operator: "is", value: null },
      { column: "status", operator: "eq", value: "scheduled" },
    ]),
    countMessage([
      { column: "sent_at", operator: "is", value: null },
      { column: "status", operator: "eq", value: "processing" },
    ]),
    countMessage([{ column: "status", operator: "eq", value: "cancelled" }]),
    countMessage([
      { column: "delivered_at", operator: "notNull", value: null },
      { column: "bounced_at", operator: "is", value: null },
    ]),
    countMessage([
      { column: "delayed_at", operator: "notNull", value: null },
      { column: "delivered_at", operator: "is", value: null },
      { column: "bounced_at", operator: "is", value: null },
    ]),
    countMessage([{ column: "opened_at", operator: "notNull", value: null }]),
    countMessage([{ column: "clicked_at", operator: "notNull", value: null }]),
    countMessage([{ column: "replied_at", operator: "notNull", value: null }]),
    countMessage([{ column: "bounced_at", operator: "notNull", value: null }]),
    countMessage([{ column: "complained_at", operator: "notNull", value: null }]),
    countMessage([{ column: "unsubscribed_at", operator: "notNull", value: null }]),
    countMessage([
      { column: "failed_at", operator: "notNull", value: null },
      { column: "bounced_at", operator: "is", value: null },
    ]),
    countMessage([{ column: "sent_at", operator: "gte", value: dayStart }]),
    countMessage([
      { column: "delivered_at", operator: "gte", value: dayStart },
      { column: "bounced_at", operator: "is", value: null },
    ]),
    countMessage([{ column: "opened_at", operator: "gte", value: dayStart }]),
    countMessage([{ column: "clicked_at", operator: "gte", value: dayStart }]),
    countMessage([{ column: "replied_at", operator: "gte", value: dayStart }]),
    countMessage([{ column: "bounced_at", operator: "gte", value: dayStart }]),
    countMessage([
      { column: "failed_at", operator: "gte", value: dayStart },
      { column: "bounced_at", operator: "is", value: null },
    ]),
    supabase
      .from("campaign_messages")
      .select("scheduled_at")
      .eq("campaign_id", campaignId)
      .is("sent_at", null)
      .in("status", ["pending", "scheduled"])
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ], 5, (request) => request) as [
    number, number, number, number, number, number, number, number, number, number,
    number, number, number, number, number, number, number, number, number, number,
    { data: { scheduled_at?: string | null } | null; error: { message: string } | null },
  ];

  if (nextPendingRes.error) throw new Error(nextPendingRes.error.message);
  const recipients = Object.fromEntries(
    recipientStatuses.map((status, index) => [status, recipientStatusCounts[index] ?? 0]),
  );
  const contacted = Math.min(recipientTotal, sent);

  return {
    recipients: { total: recipientTotal, ...recipients },
    lead_states: {},
    delivery: {
      sent,
      delivered,
      delayed,
      opened,
      clicked,
      replied,
      bounced: Math.max(bounced, outcomes.bounced),
      complained: Math.max(complained, outcomes.complained),
      unsubscribed: Math.max(unsubscribed, outcomes.unsubscribed),
      failed,
      scheduled,
      sending: processing,
      cancelled,
      contacted,
    },
    today: {
      sent: sentToday,
      delivered: deliveredToday,
      opened: openedToday,
      clicked: clickedToday,
      replied: repliedToday,
      bounced: bouncedToday,
      failed: failedToday,
    },
    by_step: [],
    next_pending_at: nextPendingRes.data?.scheduled_at ?? null,
    retryable_failures: failed,
    owed_messages: scheduled + processing + failed,
  };
}