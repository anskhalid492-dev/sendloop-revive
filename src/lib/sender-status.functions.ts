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
        .select("id, label, from_email, provider, provider_id, status, paused, customer_enabled")
        .eq("workspace_id", data.workspaceId)
        .order("from_email"),
      context.supabase
        .from("sending_domains")
        .select("domain, dns_status, verified_at")
        .eq("workspace_id", data.workspaceId),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (dErr) throw new Error(dErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { checkSenderDomainVerification, loadManagedProviderCredentials, senderDomain } =
      await import("@/lib/managed-sending.server");

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
      status: string;
      paused: boolean;
      customer_enabled: boolean;
    }>) {
      const domain = senderDomain(account.from_email);
      const dnsRow = domainMap.get(domain);
      const dnsStatus: SenderRoutingRow["dnsStatus"] = !dnsRow
        ? "missing"
        : dnsRow.dns_status === "verified"
          ? "verified"
          : dnsRow.dns_status === "failed"
            ? "failed"
            : "pending";

      let providerStatus: SenderRoutingRow["providerStatus"] = "unknown";
      let providerDetail = "Managed infrastructure is not configured for this provider yet.";
      let provider: string | null = null;

      try {
        const managed = await loadManagedProviderCredentials(supabaseAdmin as never, account);
        if (managed) {
          provider = managed.provider;
          const check = await checkSenderDomainVerification(
            managed.provider,
            managed.credentials,
            domain,
          );
          providerStatus = check.status;
          providerDetail = check.detail;
        }
      } catch (error) {
        providerStatus = "error";
        providerDetail = error instanceof Error ? error.message : "Verification check failed";
      }

      rows.push({
        accountId: account.id,
        fromEmail: account.from_email,
        label: account.label,
        domain,
        dnsStatus,
        dnsVerifiedAt: dnsRow?.verified_at ?? null,
        providerStatus,
        providerDetail,
        provider,
        active: account.status === "active" && account.customer_enabled,
        paused: account.paused || !account.customer_enabled,
        ready: dnsStatus === "verified" && providerStatus !== "not_verified" && providerStatus !== "error",
      });
    }

    return rows;
  });
