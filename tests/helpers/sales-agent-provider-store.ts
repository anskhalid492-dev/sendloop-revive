import { encryptCredentials } from "@/lib/provider-credentials.server";
import type { ProviderStore } from "@/lib/sales-agent-provider.server";

process.env["PROVIDER_CREDENTIALS_KEY"] ??= "test-only-credentials-key";

/** In-memory provider store; `key` is encrypted exactly like production. */
export function memStore(init: { provider: "openai" | "anthropic"; model: string; key: string } | null) {
  let value: Record<string, unknown> | null = init
    ? { provider: init.provider, model: init.model, key_ciphertext: encryptCredentials({ api_key: init.key }), status: "configured", last_tested_at: null, last_error: null, updated_at: null }
    : null;
  const writes: unknown[] = [];
  const store: ProviderStore & { writes: unknown[]; raw: () => unknown } = {
    read: async () => value as never,
    write: async (v) => {
      value = v as never;
      writes.push(v);
    },
    writes,
    raw: () => value,
  };
  return store;
}
