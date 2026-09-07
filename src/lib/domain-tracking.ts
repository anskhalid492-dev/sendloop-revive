/**
 * Provider-aware open/click tracking configuration.
 *
 * MunchReach does NOT operate a universal tracking host. What a customer must
 * publish in DNS for open/click tracking depends entirely on the email provider
 * currently routing that sending domain:
 *
 *   provider -> provider tracking configuration -> DNS records -> verification
 *
 * This module is pure and client-safe: it never performs DNS lookups, never
 * calls a provider API and never invents a DNS record. Providers that do not
 * support a custom tracking domain simply report that fact.
 */

export type TrackingStatus = "not_supported" | "pending" | "verified" | "error";
export type TrackingType = "none" | "provider_hosted" | "custom_domain";
export type TrackingVerificationMethod = "none" | "dns_cname" | "provider_api";
export type TrackingRecordStatus = "pending" | "verified" | "failed";

export type TrackingDnsRecord = {
  id: string;
  type: "CNAME" | "TXT";
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  purpose: string;
  status: TrackingRecordStatus;
  observed?: string | null;
  message?: string | null;
};

export type TrackingConfig = {
  /** Internal provider id currently routing the domain (e.g. "resend", "ses"). */
  providerType: string | null;
  providerId: string | null;
  /** Provider region, when the provider is region-scoped (SES). */
  providerRegion: string | null;
  supportsTracking: boolean;
  supportsCustomTrackingDomain: boolean;
  trackingType: TrackingType;
  trackingEnabled: boolean;
  customTrackingEnabled: boolean;
  trackingHostname: string | null;
  /** Provider-side identifier, e.g. the SES configuration set. */
  providerTrackingIdentifier: string | null;
  verificationMethod: TrackingVerificationMethod;
  records: TrackingDnsRecord[];
  instructions: string[];
  status: TrackingStatus;
  lastError: string | null;
  verifiedAt: string | null;
};

export const TRACKING_STATUS_LABEL: Record<TrackingStatus, string> = {
  not_supported: "Not supported by provider",
  pending: "Pending DNS",
  verified: "Verified",
  error: "Error",
};

export const TRACKING_STATUS_STYLE: Record<TrackingStatus, string> = {
  not_supported: "border-border bg-muted text-muted-foreground",
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  verified: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const NOT_SUPPORTED_MESSAGE = "Custom tracking is not supported by this provider.";

export type TrackingBuildInput = {
  domain: string;
  providerType: string | null;
  providerId: string | null;
  /** Region for region-scoped providers. Ignored by every other provider. */
  region?: string | null;
  /** SES configuration set name (provider tracking identifier). */
  configurationSet?: string | null;
  /**
   * Tracking-related DNS records the provider itself reported. Only used for
   * providers whose tracking DNS comes from their own API, so nothing is ever
   * invented locally.
   */
  providerReportedRecords?: Omit<TrackingDnsRecord, "status">[];
};

function cname(
  input: { domain: string; host: string; value: string; purpose: string },
): Omit<TrackingDnsRecord, "status"> {
  const host = input.host.replace(/\.$/, "");
  const fqdn = (host === "@" ? input.domain : `${host}.${input.domain}`).toLowerCase();
  return {
    id: `tracking:${fqdn}:CNAME`,
    type: "CNAME",
    host,
    fqdn,
    value: input.value.toLowerCase(),
    ttl: 3600,
    purpose: input.purpose,
  };
}

/** SES open/click redirect host for a given AWS region. */
export function sesTrackingTarget(region: string): string {
  return `r.${region.trim().toLowerCase()}.awstrack.me`;
}

/**
 * Builds the tracking configuration for ONE provider. Pure: same inputs always
 * produce the same configuration, and an unknown provider is reported as
 * unsupported rather than falling back to another provider's records.
 */
export function buildTrackingConfig(input: TrackingBuildInput): TrackingConfig {
  const domain = input.domain.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  const providerType = input.providerType?.trim().toLowerCase() || null;
  const base = {
    providerType,
    providerId: input.providerId ?? null,
    providerRegion: null as string | null,
    supportsTracking: false,
    supportsCustomTrackingDomain: false,
    trackingType: "none" as TrackingType,
    trackingEnabled: false,
    customTrackingEnabled: false,
    trackingHostname: null as string | null,
    providerTrackingIdentifier: null as string | null,
    verificationMethod: "none" as TrackingVerificationMethod,
    records: [] as TrackingDnsRecord[],
    instructions: [] as string[],
    status: "not_supported" as TrackingStatus,
    lastError: null as string | null,
    verifiedAt: null as string | null,
  };

  if (providerType === "ses") {
    const region = (input.region ?? "").trim().toLowerCase();
    if (!region) {
      return {
        ...base,
        supportsTracking: true,
        supportsCustomTrackingDomain: true,
        trackingType: "custom_domain",
        status: "error",
        lastError: "No AWS region is configured for this sending account, so the region-specific tracking configuration cannot be resolved.",
      };
    }
    const host = `track.${domain}`;
    const record = cname({
      domain,
      host: "track",
      value: sesTrackingTarget(region),
      purpose: `Custom open and click redirect domain for the ${region} sending region.`,
    });
    return {
      ...base,
      providerRegion: region,
      supportsTracking: true,
      supportsCustomTrackingDomain: true,
      trackingType: "custom_domain",
      trackingEnabled: true,
      customTrackingEnabled: true,
      trackingHostname: host,
      providerTrackingIdentifier: input.configurationSet ?? null,
      verificationMethod: "dns_cname",
      records: [{ ...record, status: "pending" }],
      instructions: [
        `Add the CNAME below so open and click links redirect through ${host}.`,
        `The redirect target is specific to the ${region} region — a value from another region will not work.`,
        input.configurationSet
          ? `Tracking is applied through the configuration set "${input.configurationSet}".`
          : "Tracking is applied through the sending configuration set once DNS resolves.",
      ],
      status: "pending",
    };
  }

  if (providerType === "resend") {
    const reported = (input.providerReportedRecords ?? []).map((r) => ({
      ...r,
      status: "pending" as TrackingRecordStatus,
    }));
    if (reported.length > 0) {
      return {
        ...base,
        supportsTracking: true,
        supportsCustomTrackingDomain: true,
        trackingType: "custom_domain",
        trackingEnabled: true,
        customTrackingEnabled: true,
        trackingHostname: reported[0]?.fqdn ?? null,
        verificationMethod: "dns_cname",
        records: reported,
        instructions: [
          "Publish the tracking record below exactly as the provider issued it.",
          "Open and click events are delivered back to MunchReach over the provider webhook.",
        ],
        status: "pending",
      };
    }
    return {
      ...base,
      supportsTracking: true,
      supportsCustomTrackingDomain: false,
      trackingType: "provider_hosted",
      trackingEnabled: true,
      customTrackingEnabled: false,
      verificationMethod: "provider_api",
      instructions: [
        "Open and click tracking runs on the provider's own tracking links — no DNS record is required.",
        "Tracking events reach MunchReach analytics through the provider webhook.",
      ],
      status: "verified",
    };
  }

  return {
    ...base,
    instructions: [NOT_SUPPORTED_MESSAGE],
  };
}

/**
 * Identity of a tracking configuration. Any change (provider, region, records)
 * invalidates a previous verification.
 */
export function trackingFingerprint(config: TrackingConfig): string {
  return [
    config.providerType ?? "-",
    config.providerRegion ?? "-",
    config.trackingType,
    config.providerTrackingIdentifier ?? "-",
    ...config.records.map((r) => `${r.type}:${r.fqdn}:${r.value}`).sort(),
  ].join("|");
}

export type StoredTracking = {
  fingerprint: string;
  status: TrackingStatus;
  verified_at: string | null;
  records?: TrackingDnsRecord[] | null;
  last_error?: string | null;
};

/**
 * Merges a freshly built configuration with what was stored previously.
 *
 * A provider switch (Resend -> SES or SES -> Resend), a region change or any
 * change to the required records resets tracking to "Pending DNS": a previous
 * verification never carries over to a different provider's configuration.
 */
export function reconcileTracking(
  next: TrackingConfig,
  stored: StoredTracking | null,
): { config: TrackingConfig; providerChanged: boolean } {
  const fingerprint = trackingFingerprint(next);
  const providerChanged = stored != null && stored.fingerprint !== fingerprint;
  if (next.status === "not_supported" || next.status === "error") {
    return { config: { ...next, verifiedAt: null }, providerChanged };
  }
  if (!stored || providerChanged) {
    return { config: next, providerChanged };
  }
  const storedRecords = stored.records ?? [];
  const byId = new Map(storedRecords.map((r) => [r.id, r]));
  const records = next.records.map((record) => {
    const previous = byId.get(record.id);
    return previous
      ? {
          ...record,
          status: previous.status,
          observed: previous.observed ?? null,
          message: previous.message ?? null,
        }
      : record;
  });
  const status: TrackingStatus =
    stored.status === "verified" && records.every((r) => r.status === "verified")
      ? "verified"
      : next.records.length === 0
        ? next.status
        : stored.status === "error"
          ? "error"
          : "pending";
  return {
    config: {
      ...next,
      records,
      status,
      verifiedAt: status === "verified" ? stored.verified_at : null,
      lastError: stored.last_error ?? null,
    },
    providerChanged,
  };
}

/** Derives the overall tracking status from freshly checked records. */
export function trackingStatusFromRecords(
  config: TrackingConfig,
  records: TrackingDnsRecord[],
): TrackingStatus {
  if (!config.supportsTracking) return "not_supported";
  if (config.status === "error") return "error";
  if (records.length === 0) return config.trackingType === "provider_hosted" ? "verified" : "pending";
  return records.every((r) => r.status === "verified") ? "verified" : "pending";
}

/**
 * Tracking readiness NEVER gates sending. A domain that can send keeps sending
 * while its tracking DNS is still pending or unsupported.
 */
export function sendingBlockedByTracking(): false {
  return false;
}
