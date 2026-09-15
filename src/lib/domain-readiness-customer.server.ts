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
import { isRootInboundMxRecord } from "@/lib/email-providers/mx-host";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const VENDOR_PATTERN =
  /\b(resend|mailgun|sendgrid|brevo|postmark|zeptomail|emailit|amazon ses|\bses\b|supabase|lovable)\b/gi;

/** Customers never see infrastructure vendor names. */
function scrub(text: string): string {
  return text.replace(VENDOR_PATTERN, "your email provider");
}

const PROVIDER_LABEL = "Managed sending infrastructure";

type DomainRow = {
  id: string;
  domain: string;
  provider: string | null;
  provider_id: string | null;
  record_checks: Array<{ id: string; status?: string }> | null;
  disabled_at: string | null;
};

async function loadDomain(client: Client, id: string): Promise<DomainRow> {
  const { data, error } = await client
    .from("sending_domains")
    .select("id, domain, provider, provider_id, record_checks, disabled_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Domain not found");
  return data as DomainRow;
}

async function providerFor(row: { provider: string | null }): Promise<string> {
  if (row.provider) return row.provider;
  const { resolvePlatformProviderId } = await import("@/lib/ops.server");
  return resolvePlatformProviderId();
}

/**
 * Loads the stored infrastructure credential for the domain's provider through
 * the SAME resolution the DNS-records path uses. Without it every provider read
 * came back 401 and was reported to the customer as "not registered".
 */
async function credentialsFor(
  row: Pick<DomainRow, "provider" | "provider_id">,
  providerId: string,
): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { credentialsForProviderRef } = await import("@/lib/provider-pool.server");
  const resolved = await credentialsForProviderRef(supabaseAdmin, {
    providerId: row.provider_id,
    provider: row.provider ?? providerId,
  });
  return resolved?.credentials ?? {};
}

/** Builds the provider-neutral readiness payload the customer UI renders. */
export async function buildCustomerReadiness(
  client: Client,
  id: string,
): Promise<CustomerDomainReadiness> {
  const row = await loadDomain(client, id);
  const providerId = await providerFor(row);

  const credentials = await credentialsFor(row, providerId);
  const { evaluateDomainReadiness } = await import("@/lib/domain-readiness.server");
  const report = await evaluateDomainReadiness({
    provider: providerId,
    domain: row.domain,
    credentials,
  });

  const checks = new Map((row.record_checks ?? []).map((c) => [c.id, c.status ?? "pending"]));
  const dnsMxState = mxPillarState(report.mx.state);

  const records = report.records.map((record) => {
    const checked = checks.get(record.id);
    // Only the ROOT inbound receiving MX is governed by the root MX comparison.
    // A provider's sending/feedback MX lives on the provider's sending host and
    // must keep both its own hostname and its own status.
    const rootInbound = isRootInboundMxRecord(record, report.domain);
    const status: PillarState = rootInbound
      ? dnsMxState
      : checked === "verified"
        ? "ok"
        : checked === "failed"
          ? "failed"
          : "pending";
    return {
      type: record.type,
      // Root-domain receiving publishes at the root (`@`); every other record —
      // including the sending/feedback MX — keeps its provider-defined host.
      host: rootInbound ? "@" : record.fqdn || record.host,
      value: record.value,
      priority: typeof record.priority === "number" ? record.priority : null,
      ttl: record.ttl,
      purpose: scrub(record.purpose),
      status,
    };
  });

  // Real webhook status from the selected provider (never the stale
  // platform-wide health cache). No endpoints or signing secrets are exposed.
  const { getProviderWebhookReadiness } = await import("@/lib/email-providers/webhook-status.server");
  // The stored infrastructure credential must be passed: a credential-less read
  // returns 401 and would be misreported as "no webhook registered".
  let webhook = await getProviderWebhookReadiness(providerId, credentials).catch(() => ({
    state: "pending" as const,
    detail: "Reply delivery status could not be checked just now.",
  }));

  // Automatic registration happens when a domain reaches "ready". When it failed
  // there, the recorded provider reason is what the customer sees, so a
  // half-configured domain is never presented as fine.
  if (webhook.state !== "ok") {
    const { getWebhookProvisionState } = await import(
      "@/lib/email-providers/webhook-provision.server"
    );
    const provisioned = await getWebhookProvisionState(providerId).catch(() => null);
    if (provisioned?.state === "failed" && provisioned.detail) {
      webhook = { state: "failed", detail: provisioned.detail };
    }
  }

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
      connected: webhook.state === "ok",
      state: webhook.state,
      detail:
        webhook.state === "ok"
          ? "Replies are delivered to MunchReach automatically."
          : scrub(webhook.detail),
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
  const credentials = await credentialsFor(row, providerId);
  const { enableDomainInbound } = await import("@/lib/domain-readiness.server");
  const result = await enableDomainInbound({
    provider: providerId,
    domain: row.domain,
    credentials,
  });
  return { ok: result.enabled, detail: scrub(result.detail) };
}
