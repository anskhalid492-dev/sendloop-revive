/**
 * Bring-your-own AI key storage.
 *
 * MunchReach does not resell AI: every workspace connects its own AI provider
 * key (OpenAI or Anthropic's Claude) and is billed by that provider directly.
 * Keys are encrypted at rest with the platform credential key and are only ever
 * decrypted server-side — the table is service-role only, so no browser query
 * can reach the ciphertext.
 */
import { aiProvider, resolveAiModel, type AiProviderId } from "@/lib/ai-providers";
import { encryptCredentials, decryptCredentials } from "@/lib/provider-credentials.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/** Kept for backwards compatibility with existing OpenAI-only callers. */
export const AI_MODEL_OPTIONS = aiProvider("openai").models;

export type WorkspaceAiKeyInfo = {
  connected: boolean;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  last4: string | null;
  status: string;
  lastError: string | null;
  verifiedAt: string | null;
};

export type WorkspaceAiCredentials = {
  provider: AiProviderId;
  apiKey: string;
  model: string;
};

export function maskedKey(key: string): string {
  return key.trim().slice(-4);
}

function normalizeProvider(value: unknown): AiProviderId {
  return value === "anthropic" ? "anthropic" : "openai";
}

/** Read the stored key for a workspace, decrypted. Returns null when unset. */
export async function workspaceAiCredentials(
  admin: Client,
  workspaceId: string,
): Promise<WorkspaceAiCredentials | null> {
  const { data } = await admin
    .from("workspace_ai_keys")
    .select("key_ciphertext, model, provider")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data?.key_ciphertext) return null;
  try {
    const secret = decryptCredentials<{ api_key: string }>(data.key_ciphertext);
    if (!secret?.api_key) return null;
    const provider = normalizeProvider(data.provider);
    return { provider, apiKey: secret.api_key, model: resolveAiModel(provider, data.model) };
  } catch {
    return null;
  }
}

/** Public-safe view of the connection, for the settings UI. */
export async function workspaceAiKeyInfo(
  admin: Client,
  workspaceId: string,
): Promise<WorkspaceAiKeyInfo> {
  const { data } = await admin
    .from("workspace_ai_keys")
    .select("provider, model, key_last4, status, last_error, verified_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const provider = normalizeProvider(data?.provider);
  return {
    connected: Boolean(data),
    provider,
    providerLabel: aiProvider(provider).label,
    model: resolveAiModel(provider, data?.model),
    last4: data?.key_last4 ?? null,
    status: data?.status ?? "missing",
    lastError: data?.last_error ?? null,
    verifiedAt: data?.verified_at ?? null,
  };
}

export function invalidKeyMessage(provider: AiProviderId): string {
  return `Invalid ${aiProvider(provider).vendor} API key. Please check your key and try again.`;
}

export function unreachableMessage(provider: AiProviderId): string {
  return `Couldn't connect to ${aiProvider(provider).vendor} right now. Please try again.`;
}

export const INVALID_KEY_MESSAGE = invalidKeyMessage("openai");
export const UNREACHABLE_MESSAGE = unreachableMessage("openai");

/** Shape check before we ever spend a network call on the key. */
export function looksLikeProviderKey(provider: AiProviderId, raw: string): boolean {
  return aiProvider(provider).keyPattern.test(raw.trim());
}

export function looksLikeOpenAiKey(raw: string): boolean {
  return looksLikeProviderKey("openai", raw);
}

/**
 * Read-only call against the provider so we never store an unusable key.
 * Raw provider errors never leave this function: the caller only sees the two
 * customer-facing messages above.
 */
export async function verifyAiKey(
  provider: AiProviderId,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!looksLikeProviderKey(provider, key)) return { ok: false, message: invalidKeyMessage(provider) };
  const request =
    provider === "anthropic"
      ? {
          url: "https://api.anthropic.com/v1/models?limit=1",
          headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        }
      : {
          url: "https://api.openai.com/v1/models",
          headers: { Authorization: `Bearer ${key}` },
        };
  try {
    const res = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return { ok: true, message: `Key verified with ${aiProvider(provider).vendor}.` };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: invalidKeyMessage(provider) };
    }
    return { ok: false, message: unreachableMessage(provider) };
  } catch {
    return { ok: false, message: unreachableMessage(provider) };
  }
}

export async function verifyOpenAiKey(apiKey: string) {
  return verifyAiKey("openai", apiKey);
}

export async function saveWorkspaceAiKey(
  admin: Client,
  input: {
    workspaceId: string;
    apiKey: string;
    model: string;
    userId: string;
    provider?: AiProviderId;
  },
): Promise<WorkspaceAiKeyInfo> {
  const provider = normalizeProvider(input.provider ?? "openai");
  // Validate before storing: an unusable key must never replace a working one.
  const check = await verifyAiKey(provider, input.apiKey);
  if (!check.ok) throw new Error(check.message);
  const now = new Date().toISOString();
  const { error } = await admin.from("workspace_ai_keys").upsert(
    {
      workspace_id: input.workspaceId,
      provider,
      model: resolveAiModel(provider, input.model),
      key_ciphertext: encryptCredentials({ api_key: input.apiKey.trim() }),
      key_last4: maskedKey(input.apiKey),
      status: check.ok ? "verified" : "invalid",
      last_error: check.ok ? null : check.message,
      verified_at: check.ok ? now : null,
      created_by: input.userId,
      updated_at: now,
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(error.message);
  return workspaceAiKeyInfo(admin, input.workspaceId);
}

export async function deleteWorkspaceAiKey(admin: Client, workspaceId: string) {
  const { error } = await admin.from("workspace_ai_keys").delete().eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
}
