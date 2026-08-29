/**
 * Wire shapes for the public API.
 *
 * Internal column names are deliberately not leaked: every response goes
 * through a serializer here, so a schema change cannot silently alter the
 * public contract, and columns that are not part of the contract (internal
 * flags, ciphertext, secrets) cannot escape by accident.
 */

// Rows come from the admin client, whose generated types are too wide to be
// useful here; each serializer only reads fields it explicitly names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function serializeCampaign(row: Row) {
  return {
    id: row.id,
    object: "campaign" as const,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    tags: row.tags ?? [],
    list_id: row.list_id ?? null,
    audience_count: row.audience_count ?? 0,
    eligible_count: row.eligible_count ?? 0,
    emails_sent_count: row.emails_sent_count ?? 0,
    schedule: {
      timezone: row.timezone,
      send_days: row.send_days ?? [],
      send_start_hour: row.send_start_hour,
      send_end_hour: row.send_end_hour,
      start_at: row.start_at ?? null,
      end_at: row.end_at ?? null,
      business_days_only: row.business_days_only ?? false,
      min_delay_minutes: row.min_delay_minutes,
      random_delay_minutes: row.random_delay_minutes,
    },
    limits: {
      daily_cap: row.daily_cap,
      max_per_hour: row.max_per_hour,
      email_send_limit: row.email_send_limit,
      limit_reached_at: row.limit_reached_at ?? null,
    },
    sending: {
      account_ids: row.sending_account_ids ?? [],
      rotation_enabled: row.inbox_rotation_enabled ?? false,
      rotation_strategy: row.inbox_rotation_strategy ?? "round_robin",
      rotation_daily_cap_per_inbox: row.rotation_daily_cap_per_inbox ?? null,
    },
    tracking: {
      open_tracking: row.open_tracking ?? false,
      click_tracking: row.click_tracking ?? false,
      unsubscribe_enabled: row.unsubscribe_enabled ?? true,
      text_only: row.text_only ?? false,
    },
    stop_conditions: {
      stop_on_reply: row.stop_on_reply ?? true,
      stop_on_company_reply: row.stop_on_company_reply ?? false,
    },
    launched_at: row.launched_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeStep(row: Row) {
  return {
    id: row.id,
    object: "sequence_step" as const,
    campaign_id: row.campaign_id,
    step_order: row.step_order,
    name: row.name,
    step_type: row.step_type,
    subject: row.subject,
    body: row.body,
    wait_days: row.wait_days ?? 0,
    wait_hours: row.wait_hours ?? 0,
    delay_minutes: row.delay_minutes ?? 0,
    same_thread: row.same_thread ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeContact(row: Row) {
  return {
    id: row.id,
    object: "contact" as const,
    email: row.email,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    company: row.company ?? null,
    job_title: row.job_title ?? null,
    phone: row.phone ?? null,
    website: row.website ?? null,
    linkedin_url: row.linkedin_url ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    country: row.country ?? null,
    status: row.status,
    crm_stage: row.crm_stage ?? null,
    stage_id: row.stage_id ?? null,
    list_id: row.list_id ?? null,
    owner_id: row.owner_id ?? null,
    tags: row.tags ?? [],
    deal_value: row.deal_value ?? null,
    lead_source: row.lead_source ?? null,
    custom_fields: row.custom_fields ?? {},
    archived: row.archived ?? false,
    last_activity_at: row.last_activity_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeMailbox(row: Row) {
  return {
    id: row.id,
    object: "mailbox" as const,
    label: row.label,
    from_email: row.from_email,
    from_name: row.from_name,
    reply_to: row.reply_to ?? null,
    provider: row.provider,
    status: row.status,
    paused: row.paused ?? false,
    enabled: row.customer_enabled ?? true,
    health: {
      score: row.health_score ?? null,
      auth_status: row.auth_status ?? null,
      spf: row.spf_status ?? null,
      dkim: row.dkim_status ?? null,
      dmarc: row.dmarc_status ?? null,
      mx: row.mx_status ?? null,
      last_error: row.last_error ?? null,
      last_tested_at: row.last_tested_at ?? null,
    },
    limits: { daily_limit: row.daily_limit ?? null, hourly_limit: row.hourly_limit ?? null },
    usage: { sent_today: row.sent_today ?? 0, last_sent_at: row.last_sent_at ?? null },
    warmup: {
      status: row.warmup_status ?? null,
      daily_target: row.warmup_daily_target ?? null,
      started_at: row.warmup_started_at ?? null,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeReply(row: Row) {
  return {
    id: row.id,
    object: "reply" as const,
    conversation_id: row.conversation_id,
    campaign_id: row.conversation?.campaign_id ?? null,
    lead_id: row.conversation?.lead_id ?? null,
    from_email: row.from_email,
    from_name: row.from_name ?? null,
    to_email: row.to_email,
    subject: row.subject,
    body: row.body,
    html: row.html ?? null,
    received_at: row.occurred_at,
    created_at: row.created_at,
  };
}

export function serializeWebhook(row: Row) {
  return {
    id: row.id,
    object: "webhook_endpoint" as const,
    url: row.url,
    description: row.description ?? null,
    events: row.events ?? [],
    status: row.status,
    last_delivery_at: row.last_delivery_at ?? null,
    last_delivery_status: row.last_delivery_status ?? null,
    consecutive_failures: row.consecutive_failures ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeDelivery(row: Row) {
  return {
    id: row.id,
    object: "webhook_delivery" as const,
    endpoint_id: row.endpoint_id,
    event_type: row.event_type,
    event_id: row.event_id,
    status: row.status,
    attempts: row.attempts ?? 0,
    max_attempts: row.max_attempts ?? 0,
    response_status: row.response_status ?? null,
    failure_reason: row.failure_reason ?? null,
    next_attempt_at: row.next_attempt_at ?? null,
    last_attempt_at: row.last_attempt_at ?? null,
    created_at: row.created_at,
  };
}
