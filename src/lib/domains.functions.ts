/**
 * Customer-owned sending domains.
 *
 * Sendloop does not register, provision or own domains. A customer adds a
 * domain they already own, publishes the generated DNS records at their own
 * registrar, and Sendloop performs a real DNS lookup before a domain is ever
 * marked verified.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DnsRecordView, DnsStatus, SendingDomain } from "@/lib/domains-model";
import { domainHealth } from "@/lib/domains-model";

const DOMAIN_COLUMNS =
  "id, domain, registrar, dkim_selector, tracking_host, dns_status, spf_status, dkim_status, dmarc_status, mx_status, tracking_status, last_checked_at, verified_at, last_error, created_at, workspace_id";

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
  const { workspace_id: _ws, ...rest } = row;
  const base = rest as unknown as Omit<SendingDomain, "mailboxCount" | "activeMailboxes" | "health">;
  return {
    ...base,
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

/** DNS records the customer must publish, plus the last verification outcome. */
export const getDomainDnsRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ domain: string; records: DnsRecordView[] }> => {
    const client = context.supabase as Client;
    const { data: row, error } = await client
      .from("sending_domains")
      .select(DOMAIN_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Domain not found");

    const { buildDnsRecords } = await import("@/lib/dns.server");
    const statuses: Record<string, DnsStatus> = {
      spf: row.spf_status,
      dkim: row.dkim_status,
      dmarc: row.dmarc_status,
      mx: row.mx_status,
      tracking: row.tracking_status,
    };
    const records = buildDnsRecords(row.domain as string, row.dkim_selector as string).map(
      (spec): DnsRecordView => ({
        ...spec,
        priority: spec.priority,
        status: statuses[spec.kind] ?? "pending",
      }),
    );
    return { domain: row.domain as string, records };
  });

/** Performs a live DNS lookup and persists the real result. */
export const verifySendingDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ dnsStatus: DnsStatus; records: DnsRecordView[] }> => {
      const client = context.supabase as Client;
      const { data: row, error } = await client
        .from("sending_domains")
        .select("id, domain, dkim_selector")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Domain not found");

      const { verifyDomainRecords } = await import("@/lib/dns.server");
      const { records, results } = await verifyDomainRecords(
        row.domain as string,
        row.dkim_selector as string,
      );
      const byKind = new Map(results.map((r) => [r.kind, r]));
      const status = (kind: string): DnsStatus => byKind.get(kind as never)?.status ?? "pending";

      const coreVerified =
        status("spf") === "verified" &&
        status("dkim") === "verified" &&
        status("dmarc") === "verified";
      const dnsStatus: DnsStatus = coreVerified ? "verified" : "failed";
      const failures = results
        .filter((r) => r.status === "failed" && records.find((s) => s.kind === r.kind)?.required)
        .map((r) => `${r.kind.toUpperCase()}: ${r.message}`);

      const { error: updateError } = await client
        .from("sending_domains")
        .update({
          spf_status: status("spf"),
          dkim_status: status("dkim"),
          dmarc_status: status("dmarc"),
          mx_status: status("mx"),
          tracking_status: status("tracking"),
          dns_status: dnsStatus,
          last_checked_at: new Date().toISOString(),
          verified_at: coreVerified ? new Date().toISOString() : null,
          last_error: failures.length ? failures.join(" · ") : null,
        })
        .eq("id", data.id);
      if (updateError) throw new Error(updateError.message);

      return {
        dnsStatus,
        records: records.map((spec): DnsRecordView => {
          const result = byKind.get(spec.kind);
          return {
            ...spec,
            priority: spec.priority,
            status: result?.status ?? "pending",
            message: result?.message,
            observed: result?.observed ?? null,
          };
        }),
      };
    },
  );

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
    const { error } = await client.from("sending_domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
