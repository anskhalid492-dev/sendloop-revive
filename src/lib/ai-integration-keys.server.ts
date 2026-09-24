/**
 * Bridge: AI keys connected through Settings → Integrations (ChatGPT / Claude).
 *
 * A workspace can connect OpenAI or Claude in two places — the campaign AI
 * connections card (`workspace_ai_keys`) or the Integrations tab
 * (`integration_connections` + `integration_secrets`). This module exposes the
 * Integrations-tab connections in the same shape, honouring:
 *  - the admin switch on the integration (`integrations.is_enabled`)
 *  - plan entitlement (`integrations.requires_paid_plan`)
 *  - a real, decryptable credential (a database row alone is not enough)
 *
 * The saved model is used EXACTLY as stored (`config.model`). It is never
 * fuzzy-matched or replaced with a default: a model the key cannot use surfaces
 * as a clear error so the customer refreshes and picks another.
 */
import { aiProvider, aiProviderForSlug, type AiProviderId } from "@/lib/ai-providers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type IntegrationAiKey = {
  provider: AiProviderId;
  connectionId: string;
  model: string;
  apiKey: string;
  last4: string | null;
};

const AI_SLUGS = ["openai", "claude"];

/**
 * Every usable AI credential this workspace connected on the Integrations tab.
 * Never throws: personalization must keep working if this bridge cannot read.
 */
export async function integrationAiKeys(
  admin: Client,
  workspaceId: string,
): Promise<IntegrationAiKey[]> {
  try {
    const { data: connections } = await admin
      .from("integration_connections")
      .select("id, slug, status, config")
      .eq("workspace_id", workspaceId)
      .in("slug", AI_SLUGS);
    const rows = (connections ?? []) as Array<{
      id: string;
      slug: string;
      status: string | null;
      config: Record<string, unknown> | null;
    }>;
    const connected = rows.filter((r) => r.status === "connected" && aiProviderForSlug(r.slug));
    if (!connected.length) return [];

    // Admin control: a disabled integration disappears for every customer.
    const { data: catalog } = await admin
      .from("integrations")
      .select("slug, is_enabled, requires_paid_plan")
      .in("slug", AI_SLUGS);
    const meta = new Map(
      ((catalog ?? []) as Array<{
        slug: string;
        is_enabled: boolean | null;
        requires_paid_plan: boolean | null;
      }>).map((r) => [r.slug, r] as const),
    );

    const { loadCredentials, workspaceHasPaidPlan } = await import("@/lib/integrations.server");
    let paidPlan: boolean | null = null;

    const out: IntegrationAiKey[] = [];
    for (const row of connected) {
      const entry = meta.get(row.slug);
      if (entry && entry.is_enabled === false) continue;
      if (entry?.requires_paid_plan) {
        if (paidPlan === null) paidPlan = await workspaceHasPaidPlan(workspaceId);
        if (!paidPlan) continue;
      }
      const credentials = await loadCredentials(row.id);
      const apiKey = (credentials?.["api_key"] ?? "").trim();
      if (!apiKey) continue;
      const rawModel = row.config?.["model"];
      out.push({
        provider: aiProviderForSlug(row.slug)!,
        connectionId: row.id,
        model: typeof rawModel === "string" ? rawModel.trim() : "",
        apiKey,
        last4: apiKey.slice(-4),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function integrationProviderLabel(provider: AiProviderId): string {
  return aiProvider(provider).label;
}

/** Save the exact model id on an Integrations-tab connection (merges config). */
export async function setIntegrationModel(
  admin: Client,
  connectionId: string,
  model: string,
): Promise<void> {
  const { data } = await admin
    .from("integration_connections")
    .select("config")
    .eq("id", connectionId)
    .maybeSingle();
  const current = ((data as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<
    string,
    unknown
  >;
  const { error } = await admin
    .from("integration_connections")
    .update({ config: { ...current, model } })
    .eq("id", connectionId);
  if (error) throw new Error(error.message);
}

/** Record a live key failure on the Integrations-tab connection. */
export async function markIntegrationError(
  admin: Client,
  connectionId: string,
  message: string | null,
): Promise<void> {
  await admin
    .from("integration_connections")
    .update({ error_message: message })
    .eq("id", connectionId);
}
