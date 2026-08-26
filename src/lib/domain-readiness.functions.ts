/**
 * Customer-facing domain readiness server functions.
 *
 * Thin wrappers only: every fact comes from the Phase 5 provider-neutral
 * readiness engine (`evaluateDomainReadiness` / `enableDomainInbound`). Nothing
 * here talks to a provider API, invents a DNS record, or exposes credentials,
 * signing secrets or vendor names.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CustomerDomainReadiness } from "@/lib/domain-readiness-view";

export const getDomainReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<CustomerDomainReadiness> => {
    const { buildCustomerReadiness } = await import("@/lib/domain-readiness-customer.server");
    return buildCustomerReadiness(context.supabase, data.id);
  });

export const enableDomainReceiving = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; detail: string }> => {
    const { turnOnReceiving } = await import("@/lib/domain-readiness-customer.server");
    return turnOnReceiving(context.supabase, data.id);
  });
