/**
 * Server side of provider-aware tracking configuration.
 *
 * Reads the provider currently routing a sending domain, builds THAT provider's
 * tracking configuration, persists it in `sending_domain_tracking` and verifies
 * the exact records that provider requires. Nothing here invents DNS values and
 * no provider credential ever leaves the server.
 */
import {
  buildTrackingConfig,
  reconcileTracking,
  trackingFingerprint,
  trackingStatusFromRecords,
  type TrackingConfig,
  type TrackingDnsRecord,
  type StoredTracking,
} from "@/lib/domain-tracking";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type TrackingDomainRow = {
  id: string;
  workspace_id: string;
  domain: string;
  provider: string | null;
  provider_id: string | null;
  provider_records?: unknown;
};

/** Tracking records the provider itself issued (never locally generated). */
function providerReportedTrackingRecords(row: TrackingDomainRow) {
  const records = Array.isArray(row.provider_records)
    ? (row.provider_records as Array<Record<string, unknown>>)
    : [];
  return records
    .filter((record) => String(record["kind"] ?? "") === "tracking")
    .map((record) => ({
      id: String(record["id"] ?? `tracking:${String(record["fqdn"] ?? "")}`),
      type: (String(record["type"] ?? "CNAME").toUpperCase() === "TXT" ? "TXT" : "CNAME") as
        | "CNAME"
        | "TXT",
      host: String(record["host"] ?? "@"),
      fqdn: String(record["fqdn"] ?? row.domain).toLowerCase(),
      value: String(record["value"] ?? ""),
      ttl: Number(record["ttl"]) || 3600,
      purpose: String(record["purpose"] ?? "Provider tracking record."),
    }))
    .filter((record) => record.value !== "");
}

async function loadStored(admin: Admin, domainId: string): Promise<StoredTracking | null> {
  const { data } = await admin
    .from("sending_domain_tracking")
    .select("fingerprint, tracking_status, verified_at, records, last_error")
    .eq("domain_id", domainId)
    .maybeSingle();
  if (!data) return null;
  return {
    fingerprint: (data.fingerprint as string) ?? "",
    status: (data.tracking_status as StoredTracking["status"]) ?? "pending",
    verified_at: (data.verified_at as string | null) ?? null,
    records: (data.records as TrackingDnsRecord[] | null) ?? [],
    last_error: (data.last_error as string | null) ?? null,
  };
}

async function persist(
  admin: Admin,
  row: TrackingDomainRow,
  config: TrackingConfig,
): Promise<void> {
  await admin.from("sending_domain_tracking").upsert(
    {
      workspace_id: row.workspace_id,
      domain_id: row.id,
      provider_id: config.providerId,
      provider_type: config.providerType,
      provider_region: config.providerRegion,
      tracking_enabled: config.trackingEnabled,
      custom_tracking_enabled: config.customTrackingEnabled,
      tracking_status: config.status,
      tracking_hostname: config.trackingHostname,
      provider_tracking_identifier: config.providerTrackingIdentifier,
      fingerprint: trackingFingerprint(config),
      records: config.records,
      verified_at: config.verifiedAt,
      last_error: config.lastError,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "domain_id" },
  );
}

/** Resolves the provider routing this domain and its tracking configuration. */
export async function buildDomainTracking(
  admin: Admin,
  row: TrackingDomainRow,
): Promise<TrackingConfig> {
  const { resolveDomainProvider } = await import("@/lib/domain-verification.server");
  const provider = await resolveDomainProvider(admin, {
    provider: row.provider,
    providerId: row.provider_id,
    key: row.domain,
  });

  let configurationSet: string | null = null;
  if (provider?.provider === "ses") {
    const { sesConfigurationSetName } = await import("@/lib/email-providers/ses-events.server");
    configurationSet = sesConfigurationSetName();
  }

  return buildTrackingConfig({
    domain: row.domain,
    providerType: provider?.provider ?? row.provider ?? null,
    providerId: provider?.providerId ?? row.provider_id ?? null,
    region: provider?.region ?? null,
    configurationSet,
    providerReportedRecords: providerReportedTrackingRecords(row),
  });
}

/**
 * Current tracking view for a domain. A provider switch is detected here and
 * immediately resets tracking to pending — a stale "Verified" from a previous
 * provider is never shown against a new provider's configuration.
 */
export async function getDomainTrackingConfig(
  admin: Admin,
  row: TrackingDomainRow,
): Promise<TrackingConfig> {
  const next = await buildDomainTracking(admin, row);
  const stored = await loadStored(admin, row.id);
  const { config } = reconcileTracking(next, stored);
  await persist(admin, row, config);
  return config;
}

/** Verifies the records required by the CURRENT provider against live DNS. */
export async function verifyDomainTrackingConfig(
  admin: Admin,
  row: TrackingDomainRow,
): Promise<TrackingConfig> {
  const next = await buildDomainTracking(admin, row);
  const stored = await loadStored(admin, row.id);
  const { config } = reconcileTracking(next, stored);

  if (!config.supportsTracking || config.records.length === 0) {
    const finished: TrackingConfig = {
      ...config,
      status: trackingStatusFromRecords(config, config.records),
    };
    finished.verifiedAt = finished.status === "verified" ? new Date().toISOString() : null;
    await persist(admin, row, finished);
    return finished;
  }

  const { checkProviderRecord } = await import("@/lib/dns.server");
  const checked: TrackingDnsRecord[] = await Promise.all(
    config.records.map(async (record) => {
      const result = await checkProviderRecord({
        id: record.id,
        kind: "tracking",
        type: record.type,
        host: record.host,
        fqdn: record.fqdn,
        value: record.value,
        ttl: record.ttl,
        required: false,
        purpose: record.purpose,
      });
      return {
        ...record,
        status: result.status,
        observed: result.observed,
        message: result.message,
      };
    }),
  );

  const status = trackingStatusFromRecords(config, checked);
  const failure = checked.find((r) => r.status === "failed");
  const verified: TrackingConfig = {
    ...config,
    records: checked,
    status,
    verifiedAt: status === "verified" ? new Date().toISOString() : null,
    lastError: status === "verified" ? null : (failure?.message ?? null),
  };

  // Verified tracking DNS is only half the job: the provider must also be told
  // to use that hostname for opens and clicks, otherwise it never emits an open
  // event and analytics could only ever show 0%.
  if (status === "verified" && config.providerType === "ses" && config.trackingHostname) {
    try {
      const { resolveDomainProvider } = await import("@/lib/domain-verification.server");
      const provider = await resolveDomainProvider(admin, {
        provider: row.provider,
        providerId: row.provider_id,
        key: row.domain,
      });
      const { ensureSesTrackingOptions } = await import(
        "@/lib/email-providers/ses-events.server"
      );
      const applied = await ensureSesTrackingOptions(
        provider?.credentials ?? null,
        config.trackingHostname,
      );
      if (!applied.ok) verified.lastError = applied.detail;
    } catch {
      /* tracking activation must never block domain verification */
    }
  }

  await persist(admin, row, verified);
  return verified;
}
