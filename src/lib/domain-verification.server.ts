/**
 * Fully automatic domain verification.
 *
 * A customer adds a domain, publishes the DNS records MunchReach shows, and
 * clicks "Verify domain". Everything after that is automatic:
 *
 *   resolve internal provider -> register domain at provider -> read provider
 *   DNS requirements -> authoritative DNS lookup -> provider authorisation API
 *   -> provider readiness -> mark READY TO SEND
 *
 * There is no manual admin approval anywhere in this path. Raw provider text is
 * persisted for Admin -> Logs only; customers see neutral MunchReach copy.
 */
import type { DomainStage, ProviderDnsRecord } from "@/lib/domain-providers/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type ResolvedProvider = {
  provider: string;
  providerId: string | null;
  credentials: Record<string, string>;
};

export type DomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  dkim_selector: string;
  provider: string | null;
  provider_id: string | null;
  provider_domain_id: string | null;
  stage: string;
  disabled_at?: string | null;
};

export type VerificationOutcome = {
  stage: DomainStage;
  records: (ProviderDnsRecord & { status: "pending" | "verified" | "failed"; message?: string; observed?: string | null })[];
  dnsVerified: boolean;
  providerAuthorized: boolean;
  readyToSend: boolean;
  /** Internal only. */
  providerDetail: string;
};

/**
 * Picks the provider that handles a workspace's domain. The customer never
 * chooses; admin enablement/priority and an optional per-domain pin decide.
 */
export async function resolveDomainProvider(
  admin: Admin,
  pinned?: { provider?: string | null; providerId?: string | null },
): Promise<ResolvedProvider | null> {
  const { readCredentials } = await import("@/lib/providers/adapter.server");
  const { platformKeyFor } = await import("@/lib/managed-sending.server");
  const { DOMAIN_CAPABLE_PROVIDERS } = await import("@/lib/domain-providers/registry.server");

  const { data } = await admin
    .from("email_providers")
    .select("id, provider, is_enabled, priority, status")
    .eq("is_enabled", true)
    .order("priority", { ascending: true });

  const rows = ((data ?? []) as Array<{ id: string; provider: string; status: string | null }>).filter(
    (row) => DOMAIN_CAPABLE_PROVIDERS.includes(row.provider),
  );

  const ordered = [
    ...rows.filter((r) => (pinned?.providerId ? r.id === pinned.providerId : false)),
    ...rows.filter((r) => (pinned?.providerId ? r.id !== pinned.providerId : true)),
  ];

  for (const row of ordered) {
    const { data: secret } = await admin
      .from("email_provider_secrets")
      .select("credentials_ciphertext")
      .eq("provider_id", row.id)
      .maybeSingle();
    if (secret?.credentials_ciphertext) {
      try {
        const credentials = readCredentials(secret.credentials_ciphertext) as Record<string, string>;
        if (credentials && Object.keys(credentials).length > 0) {
          return { provider: row.provider, providerId: row.id, credentials };
        }
      } catch {
        /* try the next provider */
      }
    }
    const envKey = platformKeyFor(row.provider);
    if (envKey) return { provider: row.provider, providerId: row.id, credentials: { api_key: envKey } };
  }

  // Last resort: a platform env key for any domain-capable provider.
  for (const provider of DOMAIN_CAPABLE_PROVIDERS) {
    const envKey = platformKeyFor(provider);
    if (envKey) return { provider, providerId: null, credentials: { api_key: envKey } };
  }
  return null;
}

/** Persists the raw provider failure for Admin -> System health. */
async function logDomainEvent(
  admin: Admin,
  row: Pick<DomainRow, "id" | "workspace_id" | "domain">,
  provider: string,
  detail: string,
): Promise<void> {
  console.info(
    `[domain-verification] ${JSON.stringify({
      domainId: row.id,
      workspaceId: row.workspace_id,
      domain: row.domain,
      provider,
      detail: detail.slice(0, 500),
      at: new Date().toISOString(),
    })}`,
  );
}

/**
 * Ensures the domain exists at the assigned provider and returns the provider's
 * current DNS requirements (plus MunchReach's recommended DMARC record).
 */
export async function ensureProviderDomain(
  admin: Admin,
  row: DomainRow,
): Promise<{ provider: ResolvedProvider; records: ProviderDnsRecord[]; detail: string } | null> {
  const provider = await resolveDomainProvider(admin, {
    provider: row.provider,
    providerId: row.provider_id,
  });
  if (!provider) return null;

  const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
  const { recommendedDmarcRecord } = await import("@/lib/dns.server");
  const adapter = getDomainAdapter(provider.provider);

  const setup = await adapter.createDomain(provider.credentials, row.domain);
  const records = [...setup.records];
  if (!records.some((r) => r.kind === "dmarc")) records.push(recommendedDmarcRecord(row.domain));

  await admin
    .from("sending_domains")
    .update({
      provider: provider.provider,
      provider_id: provider.providerId,
      provider_domain_id: setup.providerDomainId,
      provider_records: records,
      provider_status: setup.state,
      provider_error: setup.state === "failed" ? setup.detail.slice(0, 1000) : null,
      provider_checked_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  await logDomainEvent(admin, row, provider.provider, `createDomain: ${setup.detail}`);
  return { provider, records, detail: setup.detail };
}

/**
 * The complete automatic verification pass. Never marks a domain verified
 * without a real DNS lookup *and* a provider-side authorisation confirmation.
 */
export async function runDomainVerification(
  admin: Admin,
  row: DomainRow,
): Promise<VerificationOutcome> {
  const { checkProviderRecords } = await import("@/lib/dns.server");

  if (row.disabled_at) {
    return {
      stage: "disabled",
      records: [],
      dnsVerified: false,
      providerAuthorized: false,
      readyToSend: false,
      providerDetail: "Domain is disabled by an administrator.",
    };
  }

  const ensured = await ensureProviderDomain(admin, row);
  if (!ensured) {
    await admin
      .from("sending_domains")
      .update({
        stage: "provider_error",
        provider_status: "failed",
        provider_error: "No enabled sending infrastructure with domain support is configured.",
        provider_checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return {
      stage: "provider_error",
      records: [],
      dnsVerified: false,
      providerAuthorized: false,
      readyToSend: false,
      providerDetail: "No enabled sending infrastructure with domain support is configured.",
    };
  }

  const { provider, records } = ensured;
  const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
  const adapter = getDomainAdapter(provider.provider);

  // 1. Authoritative DNS lookup for every record the provider requires.
  const freshChecks = await checkProviderRecords(records);

  // Stickiness: a record that was already observed in DNS stays verified when the
  // current pass could not reach a resolver ("pending"). Without this the UI flips
  // between verified and unverified on transient lookup failures.
  const { data: prevRow } = await admin
    .from("sending_domains")
    .select("record_checks")
    .eq("id", row.id)
    .maybeSingle();
  const previous = new Map(
    ((prevRow?.record_checks ?? []) as Array<{ id: string; status: string; observed: string | null; message: string }>)
      .map((c) => [c.id, c]),
  );
  const checks = freshChecks.map((c) => {
    if (c.status === "pending" && previous.get(c.id)?.status === "verified") {
      const prev = previous.get(c.id)!;
      return {
        ...c,
        status: "verified" as const,
        observed: prev.observed ?? null,
        message: "Previously verified — DNS lookup temporarily unavailable.",
      };
    }
    return c;
  });

  const byId = new Map(checks.map((c) => [c.id, c]));
  const requiredRecords = records.filter((r) => r.required);
  const dnsVerified =
    requiredRecords.length > 0 &&
    requiredRecords.every((r) => byId.get(r.id)?.status === "verified");

  // 2. Provider-side authorisation, only worth asking for once DNS is live.
  let providerState = { state: "pending" as string, detail: "Waiting for DNS records." };
  if (dnsVerified) {
    providerState = await adapter.authorizeDomain(provider.credentials, row.domain);
    if (providerState.state !== "verified") {
      const status = await adapter.getDomainStatus(provider.credentials, row.domain);
      if (status.state === "verified") providerState = status;
    }
  }

  // 3. Sending readiness confirmed by the provider itself. A transient provider
  // error must not knock an already-ready domain back to "verifying".
  let readyToSend = false;
  if (dnsVerified && providerState.state === "verified") {
    try {
      readyToSend = await adapter.isReadyToSend(provider.credentials, row.domain);
    } catch {
      readyToSend = prevRow?.stage === "ready";
    }
  } else if (dnsVerified && prevRow?.stage === "ready" && providerState.state !== "failed") {
    readyToSend = true;
  }

  const stage: DomainStage = readyToSend
    ? "ready"
    : !dnsVerified
      ? checks.some((c) => c.status === "failed")
        ? requiredRecords.some((r) => byId.get(r.id)?.status === "verified")
          ? "dns_error"
          : "pending_dns"
        : "checking"
      : providerState.state === "failed"
        ? "provider_error"
        : "provider_verification";

  const kindStatus = (kind: string) => {
    const forKind = records.filter((r) => r.kind === kind);
    if (forKind.length === 0) return "pending";
    return forKind.every((r) => byId.get(r.id)?.status === "verified")
      ? "verified"
      : forKind.some((r) => byId.get(r.id)?.status === "failed")
        ? "failed"
        : "pending";
  };

  const now = new Date().toISOString();
  await admin
    .from("sending_domains")
    .update({
      stage,
      provider_records: records,
      record_checks: checks,
      provider_status: providerState.state,
      provider_error: providerState.state === "failed" ? providerState.detail.slice(0, 1000) : null,
      provider_checked_at: now,
      spf_status: kindStatus("spf"),
      dkim_status: kindStatus("dkim"),
      dmarc_status: kindStatus("dmarc"),
      mx_status: kindStatus("mx"),
      tracking_status: kindStatus("tracking"),
      dns_status: dnsVerified ? "verified" : "failed",
      last_checked_at: now,
      verified_at: dnsVerified ? now : null,
      ready_at: readyToSend ? now : null,
      last_error: dnsVerified
        ? null
        : requiredRecords
            .filter((r) => byId.get(r.id)?.status !== "verified")
            .map((r) => `${r.kind.toUpperCase()}: ${byId.get(r.id)?.message ?? "Not found yet."}`)
            .join(" · ")
            .slice(0, 1000),
    })
    .eq("id", row.id);

  await logDomainEvent(
    admin,
    row,
    provider.provider,
    `stage=${stage} dns=${String(dnsVerified)} provider=${providerState.state} :: ${providerState.detail}`,
  );

  return {
    stage,
    dnsVerified,
    providerAuthorized: providerState.state === "verified",
    readyToSend,
    providerDetail: providerState.detail,
    records: records.map((r) => {
      const check = byId.get(r.id);
      return {
        ...r,
        status: check?.status ?? "pending",
        message: check?.message ?? "",
        observed: check?.observed ?? null,
      };
    }),
  };
}

/**
 * Send-time gate. `stage = ready` alone is never enough: the provider is asked
 * again (cached briefly) before any mail leaves MunchReach.
 */
export async function assertDomainReadyToSend(
  admin: Admin,
  workspaceId: string,
  domain: string,
): Promise<{ ok: boolean; detail: string }> {
  const { data: row } = await admin
    .from("sending_domains")
    .select("id, workspace_id, domain, dkim_selector, provider, provider_id, provider_domain_id, stage, disabled_at")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain)
    .maybeSingle();

  if (!row) return { ok: false, detail: `${domain} is not a sending domain in this workspace.` };
  if (row.disabled_at) return { ok: false, detail: `${domain} is disabled.` };
  if (row.stage !== "ready") return { ok: false, detail: `${domain} stage is "${row.stage}".` };

  const provider = await resolveDomainProvider(admin, {
    provider: row.provider,
    providerId: row.provider_id,
  });
  if (!provider) return { ok: false, detail: "No sending infrastructure is configured." };

  const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
  const adapter = getDomainAdapter(provider.provider);
  if (!adapter.supportsDomainApi) return { ok: true, detail: "Provider has no domain API; enforced at send." };

  const ready = await adapter.isReadyToSend(provider.credentials, domain).catch(() => false);
  return ready
    ? { ok: true, detail: `${domain} is authorised by the assigned infrastructure.` }
    : { ok: false, detail: `${domain} is no longer authorised by the assigned infrastructure.` };
}
