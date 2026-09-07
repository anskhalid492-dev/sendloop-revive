/**
 * Customer-facing server functions for provider-aware tracking configuration.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TrackingConfig } from "@/lib/domain-tracking";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const TRACKING_COLUMNS = "id, workspace_id, domain, provider, provider_id, provider_records";

/** RLS on `sending_domains` scopes this read to the caller's workspaces. */
async function ownedDomain(client: Client, id: string) {
  const { data, error } = await client
    .from("sending_domains")
    .select(TRACKING_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Domain not found");
  return data;
}

export const getDomainTracking = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TrackingConfig> => {
    const row = await ownedDomain(context.supabase as Client, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDomainTrackingConfig } = await import("@/lib/domain-tracking.server");
    return getDomainTrackingConfig(supabaseAdmin, row);
  });

export const verifyDomainTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<TrackingConfig> => {
    const row = await ownedDomain(context.supabase as Client, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyDomainTrackingConfig } = await import("@/lib/domain-tracking.server");
    return verifyDomainTrackingConfig(supabaseAdmin, row);
  });
