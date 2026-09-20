/**
 * Per-mailbox sender routing status.
 *
 * Shows customers whether their sending domain is verified in DNS and with the
 * managed sending infrastructure, plus which provider/domain mapping is active.
 * Provider credentials are never returned — only the provider name.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SenderRoutingRow = {
  accountId: string;
  fromEmail: string;
  label: string;
  domain: string;
  dnsStatus: "verified" | "pending" | "failed" | "missing";
  dnsVerifiedAt: string | null;
  providerStatus: "verified" | "not_verified" | "unknown" | "error";
  providerDetail: string;
  provider: string | null;
  active: boolean;
  paused: boolean;
  ready: boolean;
  dailyLimit: number;
  hourlyLimit: number;
  warmupStatus: string;
  healthScore: number;
};

export const getSenderRoutingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SenderRoutingRow[]> => {
    const { data: isMember, error: memberError } = await context.supabase.rpc(
      "is_workspace_member",
      { _workspace_id: data.workspaceId, _user_id: context.userId },
    );
    if (memberError) throw new Error(memberError.message);
    if (!isMember) throw new Error("Not authorized for this workspace");

    const [{ data: accounts, error: aErr }, { data: domains, error: dErr }] = await Promise.all([
      context.supabase
        .from("sending_accounts")
        .select(
          "id, label, from_email, provider, provider_id, connection_method, status, paused, customer_enabled, daily_limit, hourly_limit, warmup_status, health_score",
        )
        .eq("workspace_id", data.workspaceId)
        .order("from_email"),
      context.supabase
        .from("sending_domains")
        .select("domain, dns_status, verified_at")
        .eq("workspace_id", data.workspaceId),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (dErr) throw new Error(dErr.message);

    // Customer-connected mailboxes are the mailbox-first path: they never get a
    // `sending_domains` row, so their readiness comes from the mailbox record
    // and its own authentication check — not from managed domain verification.
    const mailboxByEmail = new Map<
      string,
      {
        status: string;
        is_active: boolean | null;
        auth_status: string | null;
        auth_reason: string | null;
        auth_checked_at: string | null;
      }
    >();
    {
      const { data: mailboxRows } = await context.supabase
        .from("mailboxes")
        .select("email_address, status, is_active, auth_status, auth_reason, auth_checked_at")
        .eq("workspace_id", data.workspaceId)
        .limit(2000);
      for (const row of (mailboxRows ?? []) as unknown as Array<{
        email_address: string;
        status: string;
        is_active: boolean | null;
        auth_status: string | null;
        auth_reason: string | null;
        auth_checked_at: string | null;
      }>) {
        mailboxByEmail.set(row.email_address.toLowerCase(), {
          status: row.status,
          is_active: row.is_active,
          auth_status: row.auth_status ?? null,
          auth_reason: row.auth_reason ?? null,
          auth_checked_at: row.auth_checked_at ?? null,
        });
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkSenderDomainVerification, resolveManagedProvider, senderDomain } = await import(
      "@/lib/managed-sending.server"
    );

    const domainMap = new Map(
      (
        (domains ?? []) as unknown as Array<{
          domain: string;
          dns_status: string;
          verified_at: string | null;
        }>
      ).map((d) => [d.domain.toLowerCase(), d]),
    );

    const rows: SenderRoutingRow[] = [];
    for (const account of (accounts ?? []) as Array<{
      id: string;
      label: string;
      from_email: string;
      provider: string;
      provider_id: string | null;
      connection_method: string | null;
      status: string;
      paused: boolean;
      customer_enabled: boolean;
      daily_limit: number;
      hourly_limit: number;
      warmup_status: string;
      health_score: number;
    }>) {
      const domain = senderDomain(account.from_email);
      const dnsRow = domainMap.get(domain);
      const mailbox = mailboxByEmail.get(account.from_email.toLowerCase()) ?? null;
      const selfConnected = account.connection_method === "self_connected" || mailbox !== null;

      let dnsStatus: SenderRoutingRow["dnsStatus"];
      let dnsVerifiedAt: string | null = null;
      // Customers only ever see MunchReach's managed sending — never a provider
      // name, raw provider error text, or credential state.
      let providerStatus: SenderRoutingRow["providerStatus"] = "unknown";
      let providerDetail = "Sending infrastructure is being prepared for this domain.";
      const provider: string | null = "MunchReach managed sending";

      if (selfConnected) {
        // Mailbox-first readiness: the mailbox connection decides whether it can
        // send, and the mailbox authentication check decides the DNS verdict.
        const auth = mailbox?.auth_status ?? null;
        dnsStatus =
          auth === "pass" || auth === "warn"
            ? "verified"
            : auth === "fail"
              ? "failed"
              : "unchecked";
        dnsVerifiedAt = dnsStatus === "verified" ? mailbox?.auth_checked_at ?? null : null;

        const connected = mailbox
          ? (mailbox.status === "connected" || mailbox.status === "verified") &&
            mailbox.is_active !== false
          : account.status === "verified" || account.status === "active";

        providerStatus = connected ? "verified" : "not_verified";
        providerDetail = !connected
          ? "This mailbox is not connected yet. Finish the mailbox setup to start sending."
          : dnsStatus === "verified"
            ? mailbox?.auth_reason ?? "This mailbox is connected and ready to send."
            : dnsStatus === "failed"
              ? mailbox?.auth_reason ??
                "This mailbox is connected, but its domain records need attention."
              : "This mailbox is connected and ready to send. Its domain records have not been checked yet.";
      } else {
        dnsStatus = !dnsRow
          ? "missing"
          : dnsRow.dns_status === "verified"
            ? "verified"
            : dnsRow.dns_status === "failed"
              ? "failed"
              : "pending";
        dnsVerifiedAt = dnsRow?.verified_at ?? null;

        try {
          const managed = await resolveManagedProvider(supabaseAdmin as never, account);
          if (managed) {
            const check = await checkSenderDomainVerification(
              managed.provider,
              managed.credentials,
              domain,
            );
            providerStatus = check.status;
            providerDetail =
              check.status === "verified"
                ? "This domain is ready to send through MunchReach."
                : check.status === "not_verified"
                  ? "This domain is not ready to send yet. Complete the DNS verification."
                  : "Sending readiness for this domain could not be confirmed right now.";
          }
        } catch {
          providerStatus = "error";
          providerDetail = "Sending readiness for this domain could not be confirmed right now.";
        }
      }

      rows.push({
        accountId: account.id,
        fromEmail: account.from_email,
        label: account.label,
        domain,
        dnsStatus,
        dnsVerifiedAt,
        providerStatus,
        providerDetail,
        provider,
        active:
          (account.status === "active" || account.status === "verified") &&
          account.customer_enabled &&
          !account.paused,
        paused: account.paused || !account.customer_enabled,
        ready:
          (dnsStatus === "verified" || dnsStatus === "unchecked") &&
          providerStatus !== "not_verified" &&
          providerStatus !== "error",
        dailyLimit: account.daily_limit,
        hourlyLimit: account.hourly_limit,
        warmupStatus: account.warmup_status,
        healthScore: account.health_score,
      });
    }

    return rows;
  });
