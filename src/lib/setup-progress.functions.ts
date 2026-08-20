import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SetupProgress } from "@/lib/setup-journey";

/**
 * Real completion state of the guided setup journey. Every read goes through
 * the caller's authenticated client, so workspace RLS decides visibility.
 */
export const getSetupProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SetupProgress> => {
    const { supabase } = context;
    const workspaceId = data.workspaceId;

    const [domains, mailboxes, leads, campaigns, replies] = await Promise.all([
      supabase
        .from("sending_domains")
        .select("id, dns_status")
        .eq("workspace_id", workspaceId)
        .limit(200),
      supabase
        .from("sending_accounts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("campaigns")
        .select("id, launched_at")
        .eq("workspace_id", workspaceId)
        .limit(200),
      supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "replied"),
    ]);

    const domainRows = domains.data ?? [];
    const campaignRows = campaigns.data ?? [];

    return {
      workspace: true,
      domain: domainRows.length > 0,
      dns: domainRows.some((d) => d.dns_status === "verified"),
      mailbox: (mailboxes.count ?? 0) > 0,
      leads: (leads.count ?? 0) > 0,
      campaign: campaignRows.length > 0,
      launch: campaignRows.some((c) => c.launched_at),
      replies: (replies.count ?? 0) > 0,
    };
  });
