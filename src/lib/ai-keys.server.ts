/**
 * Bring-your-own AI key storage and model selection.
 *
 * MunchReach does not resell AI: every workspace connects its own AI provider
 * key (ChatGPT via OpenAI, or Claude via Anthropic) and is billed by that
 * provider directly. Keys are encrypted at rest with the platform credential
 * key and are only ever decrypted server-side — the table is service-role only,
 * so no browser query can reach the ciphertext.
 *
 * Model rules:
 *  - The model list comes from the provider's live Models API for that key.
 *  - The customer's exact model id is stored and used as-is.
 *  - Nothing is ever substituted: no provider fallback when a campaign picked a
 *    provider, and no model fallback when the chosen model is missing.
 */
import {
  aiProvider,
  resolveAiModel,
  type AiModelListResult,
  type AiProviderId,
} from "@/lib/ai-providers";
import { encryptCredentials, decryptCredentials } from "@/lib/provider-credentials.server";
import { fetchProviderModels } from "@/lib/ai-models.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export type WorkspaceAiKeyInfo = {
  connected: boolean;
  provider: AiProviderId;
  providerLabel: string;
  /** Exact saved model id, or "" when the customer has not picked one yet. */
  model: string;
  last4: string | null;
  status: string;
  lastError: string | null;
  verifiedAt: string | null;
  source: "direct" | "integration";
};

export type WorkspaceAiCredentials = {
  provider: AiProviderId;
  apiKey: string;
  /** Exact model id to call. "" means none selected — callers must error. */
  model: string;
};

type Source = {
  provider: AiProviderId;
  apiKey: string;
  model: string;
  status: string;
  direct: boolean;
  connectionId: string | null;
};

export function maskedKey(key: string): string {
  return key.trim().slice(-4);
}

function normalizeProvider(value: unknown): AiProviderId {
  return value === "anthropic" ? "anthropic" : "openai";
}

/** Every decryptable key this workspace has, direct keys first per provider. */
async function keySources(admin: Client, workspaceId: string): Promise<Source[]> {
  const { data } = await admin
    .from("workspace_ai_keys")
    .select("key_ciphertext, model, provider, status, updated_at")
    .eq("workspace_id", workspaceId);
  const rows = (data ?? []) as Array<{
    key_ciphertext: string | null;
    model: string | null;
    provider: string | null;
    status: string | null;
  }>;
  const direct: Source[] = [];
  const ordered = [...rows].sort(
    (a, b) => Number(b.status === "verified") - Number(a.status === "verified"),
  );
  for (const row of ordered) {
    if (!row.key_ciphertext) continue;
    try {
      const secret = decryptCredentials<{ api_key: string }>(row.key_ciphertext);
      if (!secret?.api_key) continue;
      direct.push({
        provider: normalizeProvider(row.provider),
        apiKey: secret.api_key,
        model: resolveAiModel(row.model),
        status: row.status ?? "verified",
        direct: true,
        connectionId: null,
      });
    } catch {
      continue;
    }
  }
  const { integrationAiKeys } = await import("@/lib/ai-integration-keys.server");
  const bridged = (await integrationAiKeys(admin, workspaceId))
    .filter((k) => !direct.some((d) => d.provider === k.provider))
    .map<Source>((k) => ({
      provider: k.provider,
      apiKey: k.apiKey,
      model: k.model,
      status: "verified",
      direct: false,
      connectionId: k.connectionId,
    }));
  return [...direct, ...bridged];
}

/**
 * Decrypted credentials for one generation.
 *
 * - `preferred` set (the campaign picked a provider): ONLY that provider is used.
 *   If it has no key the result is null — we never switch to the other provider.
 * - `preferred` null (legacy "automatic" campaigns): the verified connection.
 * - `modelOverride` (a campaign-level model pick) wins over the connection's
 *   saved model, and is passed through exactly.
 */
export async function workspaceAiCredentials(
  admin: Client,
  workspaceId: string,
  preferred?: AiProviderId | null,
  modelOverride?: string | null,
): Promise<WorkspaceAiCredentials | null> {
  const all = await keySources(admin, workspaceId);
  if (!all.length) return null;
  const chosen = preferred ? all.find((c) => c.provider === preferred) : all[0];
  if (!chosen) return null;
  const override = preferred ? resolveAiModel(modelOverride) : "";
  return { provider: chosen.provider, apiKey: chosen.apiKey, model: override || chosen.model };
}

const KEY_COLUMNS = "provider, model, key_last4, status, last_error, verified_at";

function toKeyInfo(row: Record<string, unknown> | null | undefined): WorkspaceAiKeyInfo {
  const provider = normalizeProvider(row?.["provider"]);
  return {
    connected: Boolean(row),
    provider,
    providerLabel: aiProvider(provider).label,
    model: resolveAiModel(row?.["model"] as string | null),
    last4: (row?.["key_last4"] as string | null) ?? null,
    status: (row?.["status"] as string | null) ?? "missing",
    lastError: (row?.["last_error"] as string | null) ?? null,
    verifiedAt: (row?.["verified_at"] as string | null) ?? null,
    source: "direct",
  };
}

/** Every provider this workspace has connected, public-safe (never the key). */
export async function workspaceAiKeys(
  admin: Client,
  workspaceId: string,
): Promise<WorkspaceAiKeyInfo[]> {
  const { data } = await admin
    .from("workspace_ai_keys")
    .select(KEY_COLUMNS)
    .eq("workspace_id", workspaceId);
  const direct = ((data ?? []) as Array<Record<string, unknown>>).map(toKeyInfo);

  const { integrationAiKeys } = await import("@/lib/ai-integration-keys.server");
  const bridged = (await integrationAiKeys(admin, workspaceId))
    .filter((k) => !direct.some((d) => d.connected && d.provider === k.provider))
    .map<WorkspaceAiKeyInfo>((k) => ({
      connected: true,
      provider: k.provider,
      providerLabel: aiProvider(k.provider).label,
      model: k.model,
      last4: k.last4,
      status: "verified",
      lastError: null,
      verifiedAt: null,
      source: "integration",
    }));
  return [...direct, ...bridged];
}

/** Public-safe view of one connection, for the settings UI. */
export async function workspaceAiKeyInfo(
  admin: Client,
  workspaceId: string,
  provider?: AiProviderId | null,
): Promise<WorkspaceAiKeyInfo> {
  const list = await workspaceAiKeys(admin, workspaceId);
  const wanted = provider ? list.find((r) => r.provider === provider) : undefined;
  return (
    wanted ??
    list.find((r) => r.status === "verified") ??
    list[0] ??
    toKeyInfo(provider ? null : null)
  );
}

export function invalidKeyMessage(provider: AiProviderId): string {
  return `Invalid ${aiProvider(provider).vendor} API key. Please check your key and try again.`;
}

export function unreachableMessage(provider: AiProviderId): string {
  return `Couldn't connect to ${aiProvider(provider).vendor} right now. Please try again.`;
}

/** Shape check before we ever spend a network call on the key. */
export function looksLikeProviderKey(provider: AiProviderId, raw: string): boolean {
  return aiProvider(provider).keyPattern.test(raw.trim());
}

/**
 * Live check against the provider's Models API so we never store an unusable
 * key. Raw provider errors never leave this function.
 */
export async function verifyAiKey(
  provider: AiProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!looksLikeProviderKey(provider, key)) return { ok: false, message: invalidKeyMessage(provider) };
  const result = await fetchProviderModels(provider, key, fetchImpl);
  if (result.ok) return { ok: true, message: `Key verified with ${aiProvider(provider).vendor}.` };
  if (result.reason === "invalid_key" || result.reason === "forbidden")
    return { ok: false, message: invalidKeyMessage(provider) };
  return { ok: false, message: unreachableMessage(provider) };
}

/** Persist the outcome of a live key check on wherever the key lives. */
async function recordKeyStatus(
  admin: Client,
  workspaceId: string,
  source: Source,
  error: string | null,
) {
  const now = new Date().toISOString();
  if (source.direct) {
    await admin
      .from("workspace_ai_keys")
      .update({
        status: error ? "invalid" : "verified",
        last_error: error,
        ...(error ? {} : { verified_at: now }),
        updated_at: now,
      })
      .eq("workspace_id", workspaceId)
      .eq("provider", source.provider);
  } else if (source.connectionId) {
    const { markIntegrationError } = await import("@/lib/ai-integration-keys.server");
    await markIntegrationError(admin, source.connectionId, error);
  }
}

/**
 * Live model list for this workspace's key (the "Refresh models" action).
 * Also records whether the key still works, and whether the saved model is
 * still offered — so a revoked key or retired model is visible immediately.
 */
export async function listWorkspaceAiModels(
  admin: Client,
  workspaceId: string,
  provider: AiProviderId,
  fetchImpl: typeof fetch = fetch,
): Promise<AiModelListResult> {
  const source = (await keySources(admin, workspaceId)).find((s) => s.provider === provider);
  if (!source) {
    return {
      ok: false,
      provider,
      reason: "not_connected",
      message: `Connect your ${aiProvider(provider).vendor} API key to load its models.`,
      selectedModel: "",
    };
  }
  const result = await fetchProviderModels(provider, source.apiKey, fetchImpl);
  if (!result.ok) {
    if (result.reason !== "unreachable") await recordKeyStatus(admin, workspaceId, source, result.message);
    return { ok: false, provider, reason: result.reason, message: result.message, selectedModel: source.model };
  }
  await recordKeyStatus(admin, workspaceId, source, null);
  return {
    ok: true,
    provider,
    models: result.models,
    hiddenCount: result.hiddenCount,
    selectedModel: source.model,
    selectedAvailable: Boolean(source.model) && result.models.some((m) => m.id === source.model),
    fetchedAt: new Date().toISOString(),
  };
}

/** Throws a customer-safe error unless `model` is offered to this key right now. */
export async function assertModelAvailable(
  admin: Client,
  workspaceId: string,
  provider: AiProviderId,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const list = await listWorkspaceAiModels(admin, workspaceId, provider, fetchImpl);
  if (!list.ok) throw new Error(list.message);
  if (!list.models.some((m) => m.id === model)) {
    throw new Error(
      `“${model}” is not available to your ${aiProvider(provider).vendor} API key. Refresh models and pick one from the list.`,
    );
  }
}

/**
 * Save the workspace's default model for a provider. The id must be one the
 * provider returned for this key — verified live, never trusted from the browser.
 */
export async function selectWorkspaceAiModel(
  admin: Client,
  input: { workspaceId: string; provider: AiProviderId; model: string },
  fetchImpl: typeof fetch = fetch,
): Promise<WorkspaceAiKeyInfo> {
  const model = resolveAiModel(input.model);
  if (!model) throw new Error("Choose a model.");
  await assertModelAvailable(admin, input.workspaceId, input.provider, model, fetchImpl);

  const sources = (await keySources(admin, input.workspaceId)).filter(
    (s) => s.provider === input.provider,
  );
  const now = new Date().toISOString();
  const { data: directRow } = await admin
    .from("workspace_ai_keys")
    .select("provider")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", input.provider)
    .maybeSingle();
  if (directRow) {
    const { error } = await admin
      .from("workspace_ai_keys")
      .update({ model, updated_at: now })
      .eq("workspace_id", input.workspaceId)
      .eq("provider", input.provider);
    if (error) throw new Error(error.message);
  }
  // Keep an Integrations-tab connection for the same provider in step too.
  const { integrationAiKeys, setIntegrationModel } = await import(
    "@/lib/ai-integration-keys.server"
  );
  const bridged = (await integrationAiKeys(admin, input.workspaceId)).filter(
    (k) => k.provider === input.provider,
  );
  for (const b of bridged) await setIntegrationModel(admin, b.connectionId, model);
  if (!directRow && !bridged.length && !sources.length) {
    throw new Error(`Connect your ${aiProvider(input.provider).vendor} API key first.`);
  }
  return workspaceAiKeyInfo(admin, input.workspaceId, input.provider);
}

export async function saveWorkspaceAiKey(
  admin: Client,
  input: {
    workspaceId: string;
    apiKey: string;
    userId: string;
    provider?: AiProviderId;
    /** Optional exact model id; must be offered to the new key. */
    model?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<WorkspaceAiKeyInfo> {
  const provider = normalizeProvider(input.provider ?? "openai");
  const key = input.apiKey.trim();
  if (!looksLikeProviderKey(provider, key)) throw new Error(invalidKeyMessage(provider));
  // Validate against the live Models API before storing: an unusable key must
  // never replace a working one.
  const live = await fetchProviderModels(provider, key, fetchImpl);
  if (!live.ok) {
    throw new Error(
      live.reason === "unreachable" ? unreachableMessage(provider) : invalidKeyMessage(provider),
    );
  }
  const wanted = resolveAiModel(input.model);
  if (wanted && !live.models.some((m) => m.id === wanted)) {
    throw new Error(
      `“${wanted}” is not available to this ${aiProvider(provider).vendor} API key. Pick a model from the list.`,
    );
  }
  // Keep the previous pick when it is still offered to the new key; otherwise
  // leave it empty so the customer is asked to choose — never auto-pick.
  const { data: existing } = await admin
    .from("workspace_ai_keys")
    .select("model")
    .eq("workspace_id", input.workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  const previous = resolveAiModel((existing as { model?: string } | null)?.model);
  const model =
    wanted || (previous && live.models.some((m) => m.id === previous) ? previous : "");

  const now = new Date().toISOString();
  const { error } = await admin.from("workspace_ai_keys").upsert(
    {
      workspace_id: input.workspaceId,
      provider,
      model,
      key_ciphertext: encryptCredentials({ api_key: key }),
      key_last4: maskedKey(key),
      status: "verified",
      last_error: null,
      verified_at: now,
      created_by: input.userId,
      updated_at: now,
    },
    // One key per provider per workspace: saving Claude never overwrites OpenAI.
    { onConflict: "workspace_id,provider" },
  );
  if (error) throw new Error(error.message);
  return workspaceAiKeyInfo(admin, input.workspaceId, provider);
}

export async function deleteWorkspaceAiKey(
  admin: Client,
  workspaceId: string,
  provider?: AiProviderId | null,
) {
  let query = admin.from("workspace_ai_keys").delete().eq("workspace_id", workspaceId);
  if (provider) query = query.eq("provider", provider);
  const { error } = await query;
  if (error) throw new Error(error.message);
}
