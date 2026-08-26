/**
 * Operational plumbing for the managed email infrastructure.
 *
 * Two responsibilities:
 *   - the inbound readiness checklist (provider receiving capability + the DNS
 *     records the reply-to domain needs before real replies can arrive), and
 *   - the campaign scheduler configuration used by the database cron job.
 *
 * Everything here is admin-only and never returns provider credentials.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Provider access goes through the unified provider layer's Resend client.
import { resendFetch } from "@/lib/email-providers/resend-api.server";

export type ChecklistItem = {
  id: string;
  label: string;
  status: "ok" | "pending" | "failed" | "unknown";
  detail: string;
  /** DNS record the user must add, when one is required. */
  record?: { type: string; name: string; value: string; priority?: number };
};

type ResendRecord = {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  priority?: number;
  status?: string;
};

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  capabilities?: { sending?: string; receiving?: string };
  records?: ResendRecord[];
};

const DOH = "https://dns.google/resolve";

/** Live MX lookup so the checklist reflects the registrar, not a cached guess. */
async function lookupMx(domain: string): Promise<string[]> {
  try {
    const response = await fetch(`${DOH}?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: "application/dns-json" },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { Answer?: { data?: string }[] };
    return (body.Answer ?? []).map((a) => (a.data ?? "").trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Where the inbound domain under inspection came from, for the admin UI. */
export type ReplyDomainSource =
  | "platform_reply_to"
  | "provider_override"
  | "system_email"
  | "fallback";

export type ReplyDomainResolution = {
  domain: string | null;
  address: string | null;
  source: ReplyDomainSource;
  /** Human-readable explanation shown in Admin → Inbound events. */
  label: string;
};

const FALLBACK_INBOUND_DOMAIN = "munchreach.com";

function domainOf(address: string | null | undefined): string | null {
  return address?.includes("@") ? address.split("@")[1]!.trim().toLowerCase() : null;
}

/**
 * Resolves the platform inbound domain replies are expected to arrive on.
 *
 * Only platform-owned configuration is consulted: the admin reply-to setting,
 * a provider-level override, then the system transactional sender. Customer
 * `sending_accounts` are deliberately NOT used — those are tenant mailboxes on
 * customer-owned domains and must never become the domain the platform checker
 * monitors.
 */
export async function resolveReplyDomainDetailed(): Promise<ReplyDomainResolution> {
  const { data: setting } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "reply_to")
    .maybeSingle();
  const configured = ((setting?.value ?? {}) as { email?: string }).email ?? null;
  if (domainOf(configured)) {
    return {
      domain: domainOf(configured),
      address: configured,
      source: "platform_reply_to",
      label: "Platform reply-to address (Admin → System emails)",
    };
  }

  const { data: provider } = await supabaseAdmin
    .from("email_providers")
    .select("name, reply_to_email")
    .not("reply_to_email", "is", null)
    .limit(1)
    .maybeSingle();
  if (domainOf(provider?.reply_to_email)) {
    return {
      domain: domainOf(provider?.reply_to_email),
      address: provider?.reply_to_email ?? null,
      source: "provider_override",
      label: `Provider reply-to override (${provider?.name ?? "provider"})`,
    };
  }

  const { data: systemEmail } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "transactional_email")
    .maybeSingle();
  const systemValue = (systemEmail?.value ?? {}) as { reply_to?: string; from_email?: string };
  const systemAddress = systemValue.reply_to || systemValue.from_email || null;
  if (domainOf(systemAddress)) {
    return {
      domain: domainOf(systemAddress),
      address: systemAddress,
      source: "system_email",
      label: "System email sender address",
    };
  }

  return {
    domain: FALLBACK_INBOUND_DOMAIN,
    address: null,
    source: "fallback",
    label: "Default MunchReach domain (no reply-to configured yet)",
  };
}

/** The domain replies are expected to arrive on. */
export async function resolveReplyDomain(): Promise<string | null> {
  return (await resolveReplyDomainDetailed()).domain;
}


/**
 * Builds the inbound checklist: provider receiving flag, the MX record the
 * domain needs, whether that record is actually live in DNS, and whether the
 * reply webhook is registered.
 */
export async function getInboundReadiness(baseUrl: string | null) {
  const domain = await resolveReplyDomain();
  const items: ChecklistItem[] = [];

  if (!domain) {
    items.push({
      id: "domain",
      label: "Reply-to domain configured",
      status: "failed",
      detail: "Set a reply-to inbox above so MunchReach knows where replies land.",
    });
    return { domain: null, receiving: "unknown" as const, items };
  }

  const list = await resendFetch<{ data?: ResendDomain[] }>("/domains");
  const match = (list?.data ?? []).find((d) => domain.endsWith(d.name.toLowerCase()));
  const full = match ? await resendFetch<ResendDomain>(`/domains/${match.id}`) : null;
  const receiving = full?.capabilities?.receiving ?? "unknown";

  items.push({
    id: "sending",
    label: "Sending domain verified",
    status: full?.status === "verified" ? "ok" : full ? "pending" : "unknown",
    detail: full
      ? `${full.name} — ${full.status}`
      : "No matching domain found on the sending infrastructure.",
  });

  items.push({
    id: "receiving",
    label: "Inbound receiving enabled",
    status: receiving === "enabled" ? "ok" : receiving === "unknown" ? "unknown" : "failed",
    detail:
      receiving === "enabled"
        ? "The provider is accepting inbound mail for this domain."
        : "Receiving is switched off — replies cannot be delivered to MunchReach yet.",
  });

  const mxRecord = (full?.records ?? []).find(
    (r) => r.type === "MX" && (r.record ?? "").toLowerCase() === "receiving",
  );
  const rootDomain = match?.name.toLowerCase() ?? domain;
  const liveMx = await lookupMx(mxRecord?.name ? `${mxRecord.name}.${rootDomain}` : rootDomain);
  const expected = (mxRecord?.value ?? "").toLowerCase();
  const mxLive = Boolean(expected) && liveMx.some((entry) => entry.includes(expected));

  items.push({
    id: "mx",
    label: "Inbound MX record published",
    status: !expected ? "unknown" : mxLive ? "ok" : "pending",
    detail: !expected
      ? "Enable receiving first to get the MX record for this domain."
      : mxLive
        ? `Live: ${liveMx.join(", ")}`
        : liveMx.length
          ? `Found ${liveMx.join(", ")} — the inbound record is missing.`
          : "No MX record is published for this domain yet.",
    ...(expected
      ? {
          record: {
            type: "MX",
            name: mxRecord?.name ? `${mxRecord.name}.${rootDomain}` : rootDomain,
            value: expected,
            ...(mxRecord?.priority !== undefined ? { priority: mxRecord.priority } : {}),
          },
        }
      : {}),
  });

  const hooks = await resendFetch<{ data?: { endpoint?: string; events?: string[] }[] }>(
    "/webhooks",
  );
  const endpoint = baseUrl ? `${baseUrl}/api/public/inbound/email` : null;
  const hookLive = (hooks?.data ?? []).some(
    (h) => (h.events ?? []).includes("email.received") && (h.endpoint ?? "").includes("/api/public/inbound/email"),
  );
  items.push({
    id: "webhook",
    label: "Reply webhook registered",
    status: hookLive ? "ok" : "pending",
    detail: hookLive
      ? "Inbound replies are pushed to MunchReach automatically."
      : `Register the webhook so replies reach ${endpoint ?? "the inbound endpoint"}.`,
  });

  const secret = Boolean(process.env["INBOUND_EMAIL_SECRET"]);
  items.push({
    id: "secret",
    label: "Inbound endpoint secured",
    status: secret ? "ok" : "failed",
    detail: secret
      ? "Inbound deliveries are authenticated with a shared secret."
      : "The inbound secret is missing — deliveries will be rejected.",
  });

  const healthy = items.every((i) => i.status === "ok");
  // Cached so the customer-facing inbox banner never needs provider access.
  await supabaseAdmin.from("platform_settings").upsert(
    {
      key: "inbound_health",
      value: {
        ok: healthy,
        receiving,
        domain: rootDomain,
        checkedAt: new Date().toISOString(),
      },
    },
    { onConflict: "key" },
  );

  return { domain: rootDomain, receiving, items };
}

/** Customer-safe inbound status: no provider or DNS details leak out. */
export async function getInboxHealthSummary() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value")
    .eq("key", "inbound_health")
    .maybeSingle();
  const value = (data?.value ?? {}) as { ok?: boolean; checkedAt?: string };
  return {
    receivingReady: value.ok !== false,
    checkedAt: value.checkedAt ?? null,
  };
}

/**
 * End-to-end inbound test: sends a real email from a managed mailbox using a
 * routed reply address, then reports whether a reply came back through it.
 */
export async function runInboundTest(args: { userId: string; toEmail: string }) {
  const { mintReplyRoute } = await import("@/lib/inbound-routing.server");

  const { data: account } = await supabaseAdmin
    .from("sending_accounts")
    .select("id, workspace_id, provider, provider_id, from_name, from_email, reply_to, status")
    .neq("status", "disabled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!account) throw new Error("No managed mailbox is available to send the test from.");
  if (!account.workspace_id) throw new Error("The available mailbox is not assigned to a workspace.");

  const replyRoute = await mintReplyRoute(account.from_email, {
    workspaceId: account.workspace_id,
    sendingAccountId: account.id,
    purpose: "inbound_test",
  });
  if (!replyRoute) throw new Error("Reply routing is not ready for this mailbox. Please try again shortly.");
  const replyTo = replyRoute.visibleAddress;
  const { createOutboundRfcMessageId, messageIdHeader } = await import("@/lib/outbound-threading.server");
  const outboundMessageId = createOutboundRfcMessageId(account.from_email);

  // Platform diagnostics never consume a customer's allowance, but the send is
  // recorded so an admin test can always be told apart from real usage.
  await supabaseAdmin.from("usage_audit_log").insert({
    workspace_id: account.workspace_id as string,
    resource: "emails_monthly",
    action: "admin_diagnostic",
    amount: 1,
    allowed: true,
    reason: "inbound_delivery_test",
  });

  const { sendManagedEmail } = await import("@/lib/managed-sending.server");
  const send = await sendManagedEmail(
    supabaseAdmin,
    {
      id: account.id as string,
      workspace_id: account.workspace_id as string,
      provider: account.provider as string,
      provider_id: (account.provider_id as string | null) ?? null,
      from_email: account.from_email as string,
    },
    {
    fromName: account.from_name,
    fromEmail: account.from_email,
    replyTo,
    to: args.toEmail,
    subject: "MunchReach inbound delivery test",
      text: "This is an automated inbound test.\n\nReply to this email and it should appear in the Unified Inbox within a minute.",
      headers: { "Message-ID": messageIdHeader(outboundMessageId) },
    },
    { stage: "test" },
  );

  const { data: row } = await supabaseAdmin
    .from("inbound_tests")
    .insert({
      created_by: args.userId,
      to_email: args.toEmail,
      sending_account_id: account.id,
      reply_to: replyTo,
      token: replyRoute.token,
      provider_message_id: send.ok ? (send.messageId ?? null) : null,
      status: send.ok ? "sent" : "failed",
      error: send.ok ? null : send.message.slice(0, 300),
    })
    .select("id")
    .single();

  if (!send.ok) throw new Error(send.message || "The test email could not be sent.");
  const { registerOutboundMessage } = await import("@/lib/message-classification.server");
  await registerOutboundMessage({
    providerMessageId: send.ok ? (send.messageId ?? null) : null,
    messageType: "admin_diagnostic",
    provider: account.provider,
    workspaceId: account.workspace_id ?? null,
    sendingAccountId: account.id,
    toEmail: args.toEmail,
    refTable: "inbound_tests",
    refId: row?.id ?? null,
    alternateProviderMessageIds: [send.ok ? (send.rfcMessageId ?? null) : null, outboundMessageId],
  });
  return { id: row?.id ?? null, replyTo, to: args.toEmail };
}

/** Recent inbound tests with their live reply status. */
export async function listInboundTests() {
  const { data: tests } = await supabaseAdmin
    .from("inbound_tests")
    .select("id, to_email, reply_to, token, status, error, sent_at, replied_at, conversation_id")
    .order("sent_at", { ascending: false })
    .limit(10);

  const tokens = (tests ?? []).map((t) => t.token).filter(Boolean) as string[];
  const used = new Map<string, string>();
  if (tokens.length) {
    const { data: routes } = await supabaseAdmin
      .from("inbound_routes")
      .select("token, last_used_at, conversation_id")
      .in("token", tokens);
    for (const r of routes ?? []) {
      if (r.last_used_at) used.set(r.token, r.last_used_at);
    }
  }

  return {
    tests: (tests ?? []).map((t) => {
      const repliedAt = t.replied_at ?? (t.token ? (used.get(t.token) ?? null) : null);
      return {
        ...t,
        replied_at: repliedAt,
        status: t.status === "failed" ? "failed" : repliedAt ? "reply_received" : "awaiting_reply",
      };
    }),
  };
}

/** Turns on inbound receiving at the provider for the reply-to domain. */
export async function enableInboundReceiving() {
  const domain = await resolveReplyDomain();
  if (!domain) throw new Error("Configure a reply-to inbox first.");
  const list = await resendFetch<{ data?: ResendDomain[] }>("/domains");
  const match = (list?.data ?? []).find((d) => domain.endsWith(d.name.toLowerCase()));
  if (!match) throw new Error("This domain is not set up on the sending infrastructure.");
  const updated = await resendFetch<{ id: string }>(`/domains/${match.id}`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities: { receiving: "enabled" } }),
  });
  if (!updated) throw new Error("The provider rejected the request to enable receiving.");
  return { ok: true };
}

/**
 * Stores the URL + shared secret the database cron job uses to tick the
 * campaign engine. The secret is read from the server environment so it is
 * never handled by the browser.
 */
export async function configureScheduler(baseUrl: string) {
  const token = process.env["INBOUND_EMAIL_SECRET"];
  if (!token) throw new Error("The runner secret is not configured on the server.");
  const url = `${baseUrl.replace(/\/+$/, "")}/api/public/cron/run-campaigns`;
  const retryUrl = `${baseUrl.replace(/\/+$/, "")}/api/public/cron/retry-inbound`;
  const { error } = await supabaseAdmin.from("platform_settings").upsert(
    [
      { key: "campaign_runner", value: { url, token } },
      { key: "inbound_retry_runner", value: { url: retryUrl, token } },
    ],
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  return { url };
}

export async function getSchedulerStatus() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", "campaign_runner")
    .maybeSingle();
  const value = (data?.value ?? {}) as { url?: string };
  return {
    configured: Boolean(value.url),
    url: value.url ?? null,
    updatedAt: data?.updated_at ?? null,
    schedule: "*/5 * * * *",
  };
}

/** One live MX answer, split into priority + host. */
export type MxRecord = { priority: number | null; host: string };

function parseMxAnswer(value: string): MxRecord {
  const parts = value.trim().replace(/\.$/, "").split(/\s+/);
  if (parts.length >= 2) {
    const priority = Number(parts[0]);
    return { priority: Number.isFinite(priority) ? priority : null, host: parts[1]!.toLowerCase() };
  }
  return { priority: null, host: (parts[0] ?? "").toLowerCase() };
}

/** Raw DoH lookup that keeps the MX priority intact. */
async function lookupMxRecords(domain: string): Promise<MxRecord[]> {
  const response = await fetch(`${DOH}?name=${encodeURIComponent(domain)}&type=MX`, {
    headers: { accept: "application/dns-json" },
  });
  if (!response.ok) throw new Error(`DNS lookup failed (${response.status})`);
  const body = (await response.json()) as { Answer?: { data?: string; type?: number }[] };
  return (body.Answer ?? [])
    .map((a) => (a.data ?? "").trim())
    .filter(Boolean)
    .map(parseMxAnswer);
}

/**
 * Real-time MX check for the reply-to domain: resolves DNS on every call and
 * compares it with the exact host and priority the provider requires.
 */
export async function checkMxRecords() {
  const resolution = await resolveReplyDomainDetailed();
  const domain = resolution.domain;
  const configuredAs = {
    configuredDomain: domain,
    configuredAddress: resolution.address,
    source: resolution.source,
    sourceLabel: resolution.label,
  };
  if (!domain) {
    return {
      ...configuredAs,
      domain: null,
      host: null,
      status: "fail" as const,
      expected: null,
      found: [] as MxRecord[],
      detail: "No reply-to inbox is configured, so there is no domain to check.",
      checkedAt: new Date().toISOString(),
    };
  }

  const list = await resendFetch<{ data?: ResendDomain[] }>("/domains");
  const match = (list?.data ?? []).find((d) => domain.endsWith(d.name.toLowerCase()));
  const full = match ? await resendFetch<ResendDomain>(`/domains/${match.id}`) : null;
  const rootDomain = match?.name.toLowerCase() ?? domain;
  const mxRecord = (full?.records ?? []).find(
    (r) => r.type === "MX" && (r.record ?? "").toLowerCase() === "receiving",
  );

  const host = mxRecord?.name ? `${mxRecord.name}.${rootDomain}` : rootDomain;
  const expected = mxRecord?.value
    ? {
        host: mxRecord.value.toLowerCase().replace(/\.$/, ""),
        priority: mxRecord.priority ?? 10,
        name: host,
      }
    : null;

  let found: MxRecord[] = [];
  let lookupError: string | null = null;
  try {
    found = await lookupMxRecords(host);
  } catch (error) {
    lookupError = error instanceof Error ? error.message : "DNS lookup failed";
  }

  if (!expected) {
    return {
      ...configuredAs,
      domain: rootDomain,
      host,
      status: "unknown" as const,
      expected: null,
      found,
      detail:
        lookupError ??
        "Enable inbound receiving first — the provider publishes the required MX host after that.",
      checkedAt: new Date().toISOString(),
    };
  }


  const hit = found.find((r) => r.host === expected.host);
  const priorityOk = hit ? hit.priority === null || hit.priority === expected.priority : false;
  const status = lookupError ? ("fail" as const) : hit && priorityOk ? ("pass" as const) : ("fail" as const);

  return {
    ...configuredAs,
    domain: rootDomain,
    host,
    status,
    expected,
    found,
    detail: lookupError
      ? lookupError
      : hit && priorityOk
        ? `MX resolves to ${expected.host} with priority ${expected.priority}.`
        : hit
          ? `Host matches but priority is ${hit.priority} — it must be ${expected.priority}.`
          : found.length
            ? `Published MX hosts (${found.map((r) => r.host).join(", ")}) do not include ${expected.host}.`
            : `No MX record is published for ${host}.`,
    checkedAt: new Date().toISOString(),
  };
}

/** Latest inbound webhook signature verdict, for the admin setup page. */
export async function getWebhookVerificationStatus() {
  const { data } = await supabaseAdmin
    .from("platform_settings")
    .select("value, updated_at")
    .eq("key", "inbound_webhook_status")
    .maybeSingle();
  const value = (data?.value ?? {}) as {
    status?: string;
    method?: string;
    reason?: string;
    checkedAt?: string;
    lastValidAt?: string | null;
    validCount?: number;
    invalidCount?: number;
  };

  const { count: rejected } = await supabaseAdmin
    .from("email_events")
    .select("id", { count: "exact", head: true })
    .neq("signature_status", "valid");

  return {
    status: value.status ?? "unknown",
    method: value.method ?? null,
    reason: value.reason ?? "No delivery has reached the inbound endpoint yet.",
    checkedAt: value.checkedAt ?? data?.updated_at ?? null,
    lastValidAt: value.lastValidAt ?? null,
    validCount: value.validCount ?? 0,
    invalidCount: value.invalidCount ?? 0,
    unverifiedEvents: rejected ?? 0,
    strictMode: true,
    signingSecretConfigured: Boolean(
      process.env["RESEND_WEBHOOK_SECRET"] ?? process.env["SVIX_SIGNING_SECRET"],
    ),
    sharedSecretConfigured: Boolean(process.env["INBOUND_EMAIL_SECRET"]),
  };
}

/** Inbound events that still need manual routing attention. */
export async function listRoutingFailures(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from("email_events")
    .select(
      "id, provider, event_type, status, attempts, duplicate_count, error, failure_code, routing_token, token_status, from_email, to_email, subject, conversation_id, workspace_id, created_at, processed_at, last_retry_at",
    )
    .eq("event_type", "inbound")
    .eq("status", "failed")
    .in("token_status", ["invalid", "none", "unmatched"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const tokens = (data ?? []).map((e) => e.routing_token).filter(Boolean) as string[];
  const known = new Set<string>();
  if (tokens.length) {
    const { data: routes } = await supabaseAdmin
      .from("inbound_routes")
      .select("token")
      .in("token", tokens);
    for (const route of routes ?? []) known.add(route.token);
  }

  return {
    failures: (data ?? []).map((event) => ({
      ...event,
      tokenKnown: event.routing_token ? known.has(event.routing_token) : false,
      guidance:
        event.token_status === "none"
          ? "The reply came back to a plain address and no safe mailbox/thread match was found. Retry after the mailbox, lead, or original sent message is linked; otherwise handle it manually."
          : event.token_status === "invalid"
            ? event.routing_token && known.has(event.routing_token)
              ? "The token exists but the reply arrived before the route was committed — retrying is safe and will thread it correctly."
              : "The token is unknown (expired, mistyped or spoofed). Retrying will not match it; treat this as unsolicited mail."
            : "The token matched but no thread could be resolved. Retrying is safe once the campaign message exists.",
      retryable: event.token_status !== "invalid" || (event.routing_token ? known.has(event.routing_token) : false),
    })),
  };
}
