/**
 * Customer-owned sending domains.
 *
 * MunchReach does not register, provision or own domains. A customer adds a
 * domain they already own, publishes the generated DNS records at their own
 * registrar, and MunchReach performs a real DNS lookup before a domain is ever
 * marked verified.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DnsRecordView, DnsStatus, DomainStage, SendingDomain } from "@/lib/domains-model";
import { domainHealth } from "@/lib/domains-model";

const DOMAIN_COLUMNS =
  "id, domain, registrar, dkim_selector, tracking_host, dns_status, spf_status, dkim_status, dmarc_status, mx_status, tracking_status, last_checked_at, verified_at, last_error, created_at, workspace_id, stage, provider, provider_id, provider_domain_id, provider_records, record_checks, disabled_at";

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const domainInput = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(4)
    .max(253)
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""))
    .refine((v) => DOMAIN_RE.test(v), "Enter a valid domain, for example yourcompany.com"),
  registrar: z.string().trim().max(120).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

async function primaryWorkspace(client: Client, userId: string): Promise<string> {
  const { data, error } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No workspace found for your account");
  return data.workspace_id as string;
}

function shape(row: Record<string, unknown>, counts: { total: number; active: number }): SendingDomain {
  const {
    workspace_id: _ws,
    provider: _provider,
    provider_id: _providerId,
    provider_domain_id: _providerDomainId,
    provider_records: _providerRecords,
    record_checks: _recordChecks,
    disabled_at: disabledAt,
    stage,
    ...rest
  } = row;
  const base = rest as unknown as Omit<
    SendingDomain,
    "mailboxCount" | "activeMailboxes" | "health" | "stage" | "readyToSend"
  >;
  const resolvedStage = (disabledAt ? "disabled" : ((stage as string) || "pending_dns")) as SendingDomain["stage"];
  return {
    ...base,
    stage: resolvedStage,
    readyToSend: resolvedStage === "ready",
    mailboxCount: counts.total,
    activeMailboxes: counts.active,
    health: domainHealth(base),
  };
}

async function mailboxCounts(client: Client): Promise<Map<string, { total: number; active: number }>> {
  const { data } = await client
    .from("sending_accounts")
    .select("domain_id, paused, customer_enabled, status")
    .not("domain_id", "is", null);
  const map = new Map<string, { total: number; active: number }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = row["domain_id"] as string;
    const entry = map.get(id) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (!row["paused"] && row["customer_enabled"] && row["status"] !== "disabled") entry.active += 1;
    map.set(id, entry);
  }
  return map;
}

export const listSendingDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ domains: SendingDomain[] }> => {
    const client = context.supabase as Client;
    const { data, error } = await client
      .from("sending_domains")
      .select(DOMAIN_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const counts = await mailboxCounts(client);
    return {
      domains: ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
        shape(row, counts.get(row["id"] as string) ?? { total: 0, active: 0 }),
      ),
    };
  });

export const addSendingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => domainInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const client = context.supabase as Client;
    const workspaceId = await primaryWorkspace(client, context.userId);
    const { checkUsageLimit } = await import("@/lib/billing/usage.server");
    await checkUsageLimit(workspaceId, "domains", 1);
    const { makeDkimSelector } = await import("@/lib/dns.server");

    const { data: created, error } = await client
      .from("sending_domains")
      .insert({
        workspace_id: workspaceId,
        domain: data.domain,
        registrar: data.registrar?.trim() || null,
        dkim_selector: makeDkimSelector(),
        tracking_host: `track.${data.domain}`,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505" || /duplicate key/i.test(error.message)) {
        throw new Error("That domain is already added to your workspace.");
      }
      throw new Error(error.message);
    }
    return { id: created.id as string };
  });

type DomainSetupView = {
  domain: string;
  stage: DomainStage;
  records: DnsRecordView[];
  dnsVerified: boolean;
  providerAuthorized: boolean;
  readyToSend: boolean;
};

const OWNED_COLUMNS =
  "id, workspace_id, domain, dkim_selector, provider, provider_id, provider_domain_id, provider_records, record_checks, stage, disabled_at, provider_locked_until, dns_status, spf_status, dkim_status, dmarc_status, verified_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOwnedDomain(client: Client, id: string): Promise<any> {
  const { data: row, error } = await client
    .from("sending_domains")
    .select(OWNED_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Domain not found");
  return row;
}

function toView(
  records: Array<Record<string, unknown>>,
  checks: Array<{ id: string; status: string; message?: string; observed?: string | null }>,
): DnsRecordView[] {
  const byId = new Map(checks.map((c) => [c.id, c]));
  return records.map((raw) => {
    const spec = raw as unknown as DnsRecordView & { id: string };
    const check = byId.get(spec.id);
    return {
      ...spec,
      status: (check?.status as DnsStatus) ?? "pending",
      message: check?.message,
      observed: check?.observed ?? null,
    };
  });
}

/**
 * The DNS records the customer must publish. They are produced by the assigned
 * sending infrastructure, so they always match whatever MunchReach uses today.
 */
export const getDomainDnsRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DomainSetupView> => {
    const row = await loadOwnedDomain(context.supabase as Client, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureProviderDomain } = await import("@/lib/domain-verification.server");

    let records = (row.provider_records ?? []) as Array<Record<string, unknown>>;
    if (records.length === 0 && !row.disabled_at) {
      const ensured = await ensureProviderDomain(supabaseAdmin, row);
      records = (ensured?.records ?? []) as unknown as Array<Record<string, unknown>>;
    }

    const checks = (row.record_checks ?? []) as Array<{
      id: string;
      status: string;
      message?: string;
      observed?: string | null;
    }>;
    const stage = (row.disabled_at ? "disabled" : row.stage || "pending_dns") as DomainStage;
    return {
      domain: row.domain as string,
      stage,
      records: toView(records, checks),
      dnsVerified: row.dns_status === "verified",
      providerAuthorized: stage === "ready" || stage === "provider_verification",
      readyToSend: stage === "ready",
    };
  });

/**
 * Fully automatic verification: real DNS lookups, then automatic authorisation
 * with the assigned sending infrastructure. No admin ever approves a domain.
 */
export const verifySendingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DomainSetupView & { dnsStatus: DnsStatus }> => {
    const client = context.supabase as Client;
    const row = await loadOwnedDomain(client, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDomainVerification } = await import("@/lib/domain-verification.server");

    const outcome = await runDomainVerification(supabaseAdmin, row);

    const wasVerified = row.dns_status === "verified" || !!row.verified_at;
    const brokenNow = (["spf", "dkim", "dmarc"] as const).filter((kind) => {
      const before = row[`${kind}_status`];
      const now = outcome.records.filter((r) => r.kind === kind);
      return before === "verified" && now.length > 0 && now.some((r) => r.status === "failed");
    });

    if (wasVerified && brokenNow.length > 0) {
      const { data: openAlert } = await supabaseAdmin
        .from("domain_alerts")
        .select("id")
        .eq("domain_id", data.id)
        .eq("kind", "auth_regression")
        .is("resolved_at", null)
        .maybeSingle();
      if (!openAlert) {
        await supabaseAdmin.from("domain_alerts").insert({
          workspace_id: row.workspace_id,
          domain_id: data.id,
          kind: "auth_regression",
          severity: "critical",
          title: `${brokenNow.map((k) => k.toUpperCase()).join(", ")} verification failed on ${row.domain}`,
          detail: "The records are no longer resolvable in DNS.",
          records: brokenNow,
        });
      }
      const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
      await emitTransactionalEvent({
        eventKey: "domain.verification_failed",
        userId: context.userId,
        workspaceId: row.workspace_id as string,
        variables: { "domain.name": row.domain, "domain.status": "failed" },
      });
    } else if (outcome.readyToSend) {
      if (!wasVerified) {
        const { emitTransactionalEvent } = await import("@/lib/transactional-events.server");
        await emitTransactionalEvent({
          eventKey: "domain.verified",
          userId: context.userId,
          workspaceId: row.workspace_id as string,
          idempotencyKey: `domain.verified:${data.id}`,
          variables: { "domain.name": row.domain, "domain.status": "verified" },
        });
      }
      await supabaseAdmin
        .from("domain_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("domain_id", data.id)
        .eq("kind", "auth_regression")
        .is("resolved_at", null);
    }

    return {
      domain: row.domain as string,
      stage: outcome.stage,
      dnsStatus: outcome.dnsVerified ? "verified" : "failed",
      dnsVerified: outcome.dnsVerified,
      providerAuthorized: outcome.providerAuthorized,
      readyToSend: outcome.readyToSend,
      records: outcome.records.map((r) => ({
        ...r,
        status: r.status as DnsStatus,
        message: r.message,
        observed: r.observed ?? null,
      })),
    };
  });

export const removeSendingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { count, error: countError } = await client
      .from("sending_accounts")
      .select("id", { count: "exact", head: true })
      .eq("domain_id", data.id);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) {
      throw new Error("Disconnect the mailboxes on this domain before removing it.");
    }

    // Deactivate the domain at the assigned sending infrastructure first.
    try {
      const row = await loadOwnedDomain(client, data.id);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { resolveDomainProvider } = await import("@/lib/domain-verification.server");
      const provider = await resolveDomainProvider(supabaseAdmin, {
        provider: row.provider,
        providerId: row.provider_id,
      });
      if (provider) {
        const { getDomainAdapter } = await import("@/lib/domain-providers/registry.server");
        await getDomainAdapter(provider.provider).removeDomain(provider.credentials, row.domain);
      }
    } catch (error) {
      console.warn(`[domain-verification] provider cleanup failed: ${(error as Error).message}`);
    }

    const { error } = await client.from("sending_domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
