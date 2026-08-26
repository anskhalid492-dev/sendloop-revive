/**
 * Server-side bridge between the Phase 5 provider-neutral readiness engine and
 * the customer domain onboarding UI.
 *
 * Responsibilities, and nothing more:
 *  - load the caller's own domain row (RLS-scoped client)
 *  - ask the readiness engine what is true
 *  - strip vendor names and any provider internals before returning
 *
 * It never writes DNS, never calls a provider API directly, never returns
 * credentials or webhook signing secrets.
 */
import type { CustomerDomainReadiness, PillarState } from "@/lib/domain-readiness-view";
import { mxPillarState } from "@/lib/domain-readiness-view";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const VENDOR_PATTERN =
  /\b(resend|mailgun|sendgrid|brevo|postmark|zeptomail|emailit|amazon ses|\bses\b|supabase|lovable)\b/gi;

/** Customers never see infrastructure vendor names. */
function scrub(text: string): string {
  return text.replace(VENDOR_PATTERN, "your email provider");
}

const PROVIDER_LABEL = "Managed sending infrastructure";

async function loadDomain(client: Client, id: string) {
  const { data, error } = await client
    .from("sending_domains")
    .select("id, domain, provider, record_checks, disabled_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Domain not found");
  return data as {
    id: string;
    domain: string;
    provider: string | null;
    record_checks: Array<{ id: string; status?: string }> | null;
    disabled_at: string | null;
  };
}

async function providerFor(row: { provider: string | null }): Promise<string> {
  if (row.provider) return row.provider;
  const { resolvePlatformProviderId } = await import("@/lib/ops.server");
  return resolvePlatformProviderId();
}

/** Builds the provider-neutral readiness payload the customer UI renders. */
export async function buildCustomerReadiness(
  client: Client,
  id: string,
): Promise<CustomerDomainReadiness> {
  const row = await loadDomain(client, id);
  const providerId = await providerFor(row);

  const { evaluateDomainReadiness } = await import("@/lib/domain-readiness.server");
  const report = await evaluateDomainReadiness({ provider: providerId, domain: row.domain });

  const checks = new Map((row.record_checks ?? []).map((c) => [c.id, c.status ?? "pending"]));
  const dnsMxState = mxPillarState(report.mx.state);

  const records = report.records.map((record) => {
    const checked = checks.get(record.id);
    const status: PillarState =
      record.type === "MX"
        ? dnsMxState
        : checked === "verified"
          ? "ok"
          : checked === "failed"
            ? "failed"
            : "pending";
    return {
      type: record.type,
      // Root-domain receiving: the MX host is always the root (`@`), never a
      // sending/tracking subdomain that may already carry a CNAME.
      host: record.type === "MX" ? "@" : record.fqdn || record.host,
      value: record.value,
      priority: typeof record.priority === "number" ? record.priority : null,
      ttl: record.ttl,
      purpose: scrub(record.purpose),
      status,
    };
  });

  // Customer-safe inbound pipeline health; no endpoints or signing secrets.
  const { getInboxHealthSummary } = await import("@/lib/ops.server");
  const inbox = await getInboxHealthSummary().catch(() => ({ receivingReady: false }));

  return {
    domain: report.domain,
    providerLabel: PROVIDER_LABEL,
    state: report.state,
    message: scrub(report.message),
    sending: { ready: report.sending.readyToSend, detail: scrub(report.sending.detail) },
    receiving: {
      ready: report.inbound.enabled,
      supported: report.capabilities.inbound && report.capabilities.inboundSetupMode !== "unsupported",
      setupMode: report.capabilities.inboundSetupMode,
      canAutoEnable: report.canAutoEnableInbound,
      requiresCustomerAction: report.requiresCustomerAction,
      detail: scrub(report.inbound.detail),
    },
    dns: {
      state: report.mx.state,
      currentMx: report.mx.current.map((r) => ({ host: r.host, priority: r.priority })),
      requiredMx: report.mx.required.map((r) => ({ host: r.host, priority: r.priority })),
      records,
    },
    webhook: {
      connected: inbox.receivingReady,
      detail: inbox.receivingReady
        ? "Replies are delivered to MunchReach automatically."
        : "Reply delivery needs attention. We are working on it — no action is required from you.",
    },
    checkedAt: report.checkedAt,
  };
}

/**
 * Turns receiving on through the provider abstraction. Providers that cannot do
 * this over an API return their provider-neutral instruction instead; nothing is
 * ever reported as configured when it is not.
 */
export async function turnOnReceiving(
  client: Client,
  id: string,
): Promise<{ ok: boolean; detail: string }> {
  const row = await loadDomain(client, id);
  if (row.disabled_at) return { ok: false, detail: "This domain is disabled." };
  const providerId = await providerFor(row);
  const { enableDomainInbound } = await import("@/lib/domain-readiness.server");
  const result = await enableDomainInbound({ provider: providerId, domain: row.domain });
  return { ok: result.enabled, detail: scrub(result.detail) };
}
