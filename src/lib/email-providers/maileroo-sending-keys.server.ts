/**
 * Maileroo domain sending keys — MunchReach-managed, server-side only.
 *
 * Maileroo splits its credentials in two:
 *   1. an ACCOUNT API key (`Authorization: Bearer roo_…`, https://api.maileroo.com/v1)
 *      used to manage domains, DNS, inbound routes, webhooks — and sending keys;
 *   2. a per-DOMAIN SENDING key (`X-Api-Key`, https://smtp.maileroo.com/api/v2)
 *      which is the only credential the email API accepts.
 *
 * Both are MunchReach-owned. Customers never see, enter or manage either one.
 * The domain sending key is created/retrieved on demand through the account API
 * (`GET|POST /v1/domains/:domain_id/sending-keys`) and cached in process memory
 * only — it is never persisted in our database, never returned to a browser and
 * never written to a log.
 */
import { findMailerooDomain, MAILEROO_ACCOUNT_API } from "@/lib/domain-providers/maileroo.server";
import { mailerooHeaders } from "@/lib/domain-providers/maileroo.server";
import { providerFetch } from "@/lib/domain-providers/adapter.server";

/** Name of the sending key MunchReach provisions on every managed domain. */
export const MANAGED_SENDING_KEY_NAME = "MunchReach";

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { key: string; at: number }>();

/** Test seam — clears the in-process sending-key cache. */
export function resetMailerooSendingKeyCache(): void {
  cache.clear();
}

type SendingKey = { id?: number | string; name?: string; sending_key?: string };

function unwrap<T>(json: unknown): T | null {
  if (!json || typeof json !== "object") return null;
  return ((json as { data?: unknown }).data as T) ?? null;
}

function pickManaged(keys: SendingKey[]): string | null {
  const managed = keys.find((entry) => entry.name === MANAGED_SENDING_KEY_NAME && entry.sending_key);
  const any = keys.find((entry) => Boolean(entry.sending_key));
  return (managed ?? any)?.sending_key ?? null;
}

export type SendingKeyResolution = {
  key: string | null;
  /** Internal detail for admin logs; contains no secret material. */
  detail: string;
};

/**
 * Resolves the MunchReach-owned sending key for one domain.
 *
 * Order: in-process cache -> keys already on the domain -> create one. An
 * explicit `sending_key` stored by an admin (legacy configuration) always wins,
 * so existing working setups keep sending unchanged.
 */
export async function resolveMailerooSendingKey(
  creds: Record<string, string>,
  domain: string,
): Promise<SendingKeyResolution> {
  const stored = (creds["sending_key"] ?? "").trim();
  if (stored) return { key: stored, detail: "Using the sending key stored for this provider." };

  const accountKey = (creds["api_key"] ?? "").trim();
  if (!accountKey) {
    return { key: null, detail: "No Maileroo account API credential is configured." };
  }

  const target = domain.toLowerCase().replace(/\.$/, "");
  const cached = cache.get(target);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { key: cached.key, detail: "Using the cached managed sending key." };
  }

  // A failed lookup is not the same as an unregistered domain; say which happened.
  let found: Awaited<ReturnType<typeof findMailerooDomain>>;
  try {
    found = await findMailerooDomain(creds, target);
  } catch (error) {
    return {
      key: null,
      detail: `The infrastructure lookup for ${target} could not be completed: ${
        error instanceof Error ? error.message : "unknown failure"
      }`,
    };
  }
  if (!found?.id) {
    return { key: null, detail: `Domain ${target} is not registered on the infrastructure.` };
  }

  const list = await providerFetch(`${MAILEROO_ACCOUNT_API}/domains/${found.id}/sending-keys`, {
    headers: mailerooHeaders(creds),
  });
  if (list.ok) {
    const payload = unwrap<SendingKey[] | { sending_keys?: SendingKey[] }>(list.json);
    const items = Array.isArray(payload) ? payload : (payload?.sending_keys ?? []);
    const existing = pickManaged(items);
    if (existing) {
      cache.set(target, { key: existing, at: Date.now() });
      return { key: existing, detail: "Reused the managed sending key for this domain." };
    }
  } else if (list.status === 401 || list.status === 403) {
    return {
      key: null,
      detail: `The account API credential cannot read sending keys [${list.status}].`,
    };
  }

  const created = await providerFetch(`${MAILEROO_ACCOUNT_API}/domains/${found.id}/sending-keys`, {
    method: "POST",
    headers: mailerooHeaders(creds),
    body: JSON.stringify({ name: MANAGED_SENDING_KEY_NAME }),
  });
  if (!created.ok) {
    return {
      key: null,
      detail: `The provider refused to create a sending key [${created.status}].`,
    };
  }
  const key = unwrap<SendingKey>(created.json)?.sending_key ?? null;
  if (!key) {
    return { key: null, detail: "The provider returned no sending key for this domain." };
  }
  cache.set(target, { key, at: Date.now() });
  return { key, detail: "Created a managed sending key for this domain." };
}
