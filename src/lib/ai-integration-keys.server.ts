/**
 * Bridge: AI keys connected through Settings → Integrations.
 *
 * A workspace can connect OpenAI or Claude in two places — the campaign AI
 * connections card (`workspace_ai_keys`) or the Integrations tab
 * (`integration_connections` + `integration_secrets`). Personalization used to
 * read only the first store, so a Claude key added on the Integrations tab was
 * invisible in the campaign provider selector. This module exposes those
 * integration connections in the same shape, honouring:
 *  - the admin switch on the integration (`integrations.is_enabled`)
 *  - plan entitlement (`integrations.requires_paid_plan`)
 *  - a real, decryptable credential (a database row alone is not enough)
 */
import { aiProvider, type AiProviderId } from "@/lib/ai-providers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/** Integration slugs that map onto an implemented AI adapter. */
const SLUG_TO_PROVIDER: Record<string, AiProviderId> = {
  openai: "openai",
  claude: "anthropic",
};

export type IntegrationAiKey = {
  provider: AiProviderId;
  model: string;
  apiKey: string;
  last4: string | null;
};

/**
 * Every usable AI credential this workspace connected on the Integrations tab.
 * Never throws: personalization must keep working if this bridge cannot read.
 */
export async function integrationAiKeys(
  admin: Client,
  workspaceId: string,
): Promise<IntegrationAiKey[]> {
  try {
    const slugs = Object.keys(SLUG_TO_PROVIDER);
    const { data: connections } = await admin
      .from("integration_connections")
      .select("id, slug, status, config")
      .eq("workspace_id", workspaceId)
      .in("slug", slugs);
    const rows = (connections ?? []) as Array<{
      id: string;
      slug: string;
      status: string | null;
      config: Record<string, unknown> | null;
    }>;
    const connected = rows.filter((r) => r.status === "connected" && SLUG_TO_PROVIDER[r.slug]);
    if (!connected.length) return [];

    // Admin control: a disabled integration disappears for every customer.
    const { data: catalog } = await admin
      .from("integrations")
      .select("slug, is_enabled, requires_paid_plan")
      .in("slug", slugs);
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
      const provider = SLUG_TO_PROVIDER[row.slug]!;
      // Free-text models typed on the Integrations tab are normalized back to a
      // real model id for this provider, so we never call an invented model.
      const model = interpretModelName(provider, (row.config?.["model"] as string | null) ?? null);
      out.push({ provider, model, apiKey, last4: apiKey.slice(-4) });
    }
    return out;
  } catch {
    return [];
  }
}

export function integrationProviderLabel(provider: AiProviderId): string {
  return aiProvider(provider).label;
}

/**
 * The Integrations tab takes a free-text model name, so "claude sonnet 5" has to
 * become a real model id. Exact ids win; otherwise we match on the family name
 * and fall back to the provider default.
 */
export function interpretModelName(
  provider: AiProviderId,
  raw: string | null | undefined,
): string {
  const meta = aiProvider(provider);
  const wanted = (raw ?? "").trim().toLowerCase();
  if (!wanted) return meta.defaultModel;
  const exact = meta.models.find((m) => m.value.toLowerCase() === wanted);
  if (exact) return exact.value;
  const words = wanted.replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3);
  // Words every model shares ("claude", "gpt") identify the vendor, not the model,
  // so they must not decide which family we pick.
  const distinctive = words.filter(
    (w) => !meta.models.every((m) => m.value.toLowerCase().includes(w)),
  );
  const family = meta.models.find((m) =>
    distinctive.some((w) => m.value.toLowerCase().includes(w)),
  );
  return family?.value ?? meta.defaultModel;
}
}
