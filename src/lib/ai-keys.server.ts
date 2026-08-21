/**
 * Bring-your-own AI key storage.
 *
 * MunchReach does not resell AI: every workspace connects its own OpenAI API
 * key and is billed by OpenAI directly. Keys are encrypted at rest with the
 * platform credential key and are only ever decrypted server-side — the table
 * is service-role only, so no browser query can reach the ciphertext.
 */
import { encryptCredentials, decryptCredentials } from "@/lib/provider-credentials.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const AI_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "GPT-4o mini — fastest and cheapest" },
  { value: "gpt-4o", label: "GPT-4o — highest quality" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini — balanced" },
  { value: "gpt-4.1", label: "GPT-4.1 — long instructions" },
] as const;

export type WorkspaceAiKeyInfo = {
  connected: boolean;
  provider: string;
  model: string;
  last4: string | null;
  status: string;
  lastError: string | null;
  verifiedAt: string | null;
};

export type WorkspaceAiCredentials = { apiKey: string; model: string };

export function maskedKey(key: string): string {
  return key.trim().slice(-4);
}

/** Read the stored key for a workspace, decrypted. Returns null when unset. */
export async function workspaceAiCredentials(
  admin: Client,
  workspaceId: string,
): Promise<WorkspaceAiCredentials | null> {
  const { data } = await admin
    .from("workspace_ai_keys")
    .select("key_ciphertext, model")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data?.key_ciphertext) return null;
  try {
    const secret = decryptCredentials<{ api_key: string }>(data.key_ciphertext);
    if (!secret?.api_key) return null;
    return { apiKey: secret.api_key, model: data.model || "gpt-4o-mini" };
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
  return {
    connected: Boolean(data),
    provider: data?.provider ?? "openai",
    model: data?.model ?? "gpt-4o-mini",
    last4: data?.key_last4 ?? null,
    status: data?.status ?? "missing",
    lastError: data?.last_error ?? null,
    verifiedAt: data?.verified_at ?? null,
  };
}

/** Read-only call against OpenAI so we never store an unusable key silently. */
export async function verifyOpenAiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) return { ok: true, message: "Key verified with OpenAI." };
    if (res.status === 401) return { ok: false, message: "OpenAI rejected this key." };
    if (res.status === 429)
      return { ok: false, message: "OpenAI rate limited the check. Try again in a moment." };
    return { ok: false, message: `OpenAI returned an error (${res.status}).` };
  } catch {
    return { ok: false, message: "Could not reach OpenAI to verify the key." };
  }
}

export async function saveWorkspaceAiKey(
  admin: Client,
  input: { workspaceId: string; apiKey: string; model: string; userId: string },
): Promise<WorkspaceAiKeyInfo> {
  const check = await verifyOpenAiKey(input.apiKey);
  const now = new Date().toISOString();
  const { error } = await admin.from("workspace_ai_keys").upsert(
    {
      workspace_id: input.workspaceId,
      provider: "openai",
      model: input.model,
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
