/**
 * Server-only storage for the Google Sign-In (Google OAuth Web Client)
 * configuration managed in Admin → Settings → Authentication. Direct Google
 * Sign-In reads the Client ID/Secret from here via getGoogleSignInClient*; it
 * does not use Google Cloud Identity Platform. The client secret is encrypted
 * with the existing provider credential cipher and stored in one
 * platform_settings row; it is never returned, logged or audited.
 */
import {
  MASKED_SECRET,
  normalizeDomain,
  validateGoogleIdpInput,
  type GoogleIdpInput,
  type GoogleIdpView,
} from "@/lib/auth-providers-config";

export const GOOGLE_IDP_SETTING_KEY = "auth_provider_google_idp";

export type StoredGoogleIdp = {
  project_id: string | null;
  client_id: string | null;
  secret_ciphertext: string | null;
  authorized_domain: string | null;
  enabled: boolean;
  /** Admin explicitly turned it off (credentials kept). */
  disabled?: boolean;
  last_tested_at: string | null;
  last_test_result: GoogleIdpView["lastTestResult"];
  last_test_message: string | null;
  updated_at: string | null;
};

const EMPTY: StoredGoogleIdp = {
  project_id: null,
  client_id: null,
  secret_ciphertext: null,
  authorized_domain: null,
  enabled: false,
  last_tested_at: null,
  last_test_result: null,
  last_test_message: null,
  updated_at: null,
};

export type GoogleIdpStore = { read: () => Promise<StoredGoogleIdp | null>; write: (v: StoredGoogleIdp | null) => Promise<void> };

const dbStore: GoogleIdpStore = {
  async read() {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("platform_settings").select("value").eq("key", GOOGLE_IDP_SETTING_KEY).maybeSingle();
    if (error) throw new Error("Could not read authentication settings.");
    return (data?.value as StoredGoogleIdp | null) ?? null;
  },
  async write(v) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert({ key: GOOGLE_IDP_SETTING_KEY, value: (v ?? EMPTY) as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("Could not save authentication settings.");
  },
};
let override: GoogleIdpStore | null = null;
export function __setGoogleIdpStore(s: GoogleIdpStore | null) {
  override = s;
}
const store = () => override ?? dbStore;

function normalize(raw: StoredGoogleIdp | null): StoredGoogleIdp {
  return raw && typeof raw === "object" ? { ...EMPTY, ...raw, enabled: raw.enabled === true } : { ...EMPTY };
}

export function toView(s: StoredGoogleIdp): GoogleIdpView {
  const complete = Boolean(s.project_id && s.client_id && s.secret_ciphertext);
  const status: GoogleIdpView["status"] = !complete ? "not_configured" : s.enabled ? "enabled" : s.disabled ? "disabled" : "configured";
  return {
    status,
    projectId: s.project_id,
    clientId: s.client_id,
    hasSecret: Boolean(s.secret_ciphertext),
    maskedSecret: s.secret_ciphertext ? MASKED_SECRET : null,
    authorizedDomain: s.authorized_domain,
    enabled: complete && s.enabled,
    lastTestedAt: s.last_tested_at,
    lastTestResult: s.last_test_result,
    lastTestMessage: s.last_test_message,
    updatedAt: s.updated_at,
  };
}

export async function getGoogleIdpView(): Promise<GoogleIdpView> {
  return toView(normalize(await store().read()));
}

/** Client ID for the browser — only when the saved configuration is complete and enabled. */
export async function getGoogleSignInClientId(): Promise<string | null> {
  const view = toView(normalize(await store().read()));
  return view.enabled && view.clientId ? view.clientId : null;
}

/** Server-only Client ID + decrypted secret for live Google Sign-In, or null when unavailable. */
export async function getGoogleSignInClient(): Promise<{ clientId: string; clientSecret: string } | null> {
  const current = normalize(await store().read());
  if (!toView(current).enabled || !current.client_id || !current.secret_ciphertext) return null;
  const clientSecret = await decryptSecret(current.secret_ciphertext);
  return clientSecret ? { clientId: current.client_id, clientSecret } : null;
}

async function encryptSecret(secret: string) {
  const { encryptCredentials } = await import("@/lib/provider-credentials.server");
  return encryptCredentials({ client_secret: secret });
}
async function decryptSecret(ct: string): Promise<string | null> {
  try {
    const { decryptCredentials } = await import("@/lib/provider-credentials.server");
    const v = decryptCredentials<{ client_secret?: string }>(ct);
    return typeof v.client_secret === "string" && v.client_secret ? v.client_secret : null;
  } catch {
    return null;
  }
}

export async function saveGoogleIdpConfig(input: GoogleIdpInput): Promise<GoogleIdpView> {
  const current = normalize(await store().read());
  const error = validateGoogleIdpInput(input, Boolean(current.secret_ciphertext));
  if (error) throw new Error(error);
  const projectId = input.projectId.trim();
  const clientId = input.clientId.trim();
  const domain = normalizeDomain(input.authorizedDomain)!;
  const secret = (input.clientSecret ?? "").trim();
  const unchanged =
    !secret && current.project_id === projectId && current.client_id === clientId && current.authorized_domain === domain;
  if (unchanged) throw new Error("This configuration is already saved.");
  const credentialsChanged = Boolean(secret) || current.project_id !== projectId || current.client_id !== clientId;
  const next: StoredGoogleIdp = {
    ...current,
    project_id: projectId,
    client_id: clientId,
    authorized_domain: domain,
    secret_ciphertext: secret ? await encryptSecret(secret) : current.secret_ciphertext,
    // Credential changes invalidate any prior test result.
    last_tested_at: credentialsChanged ? null : current.last_tested_at,
    last_test_result: credentialsChanged ? null : current.last_test_result,
    last_test_message: credentialsChanged ? null : current.last_test_message,
    updated_at: new Date().toISOString(),
  };
  await store().write(next);
  return toView(next);
}

/** Marks the prepared configuration enabled/disabled. Does NOT affect live sign-in. */
export async function setGoogleIdpEnabled(enabled: boolean): Promise<GoogleIdpView> {
  const current = normalize(await store().read());
  if (!current.project_id || !current.client_id || !current.secret_ciphertext) {
    throw new Error("Save a complete configuration first.");
  }
  const next = { ...current, enabled, disabled: !enabled, updated_at: new Date().toISOString() };
  await store().write(next);
  return toView(next);
}

export async function removeGoogleIdpConfig(): Promise<GoogleIdpView> {
  await store().write({ ...EMPTY, updated_at: new Date().toISOString() });
  return toView(EMPTY);
}

export type TokenProbe = (clientId: string, clientSecret: string) => Promise<{ status: number; error: string | null }>;

/**
 * Validates client credentials with Google's token endpoint using a
 * deliberately invalid authorization code: `invalid_grant` means Google
 * accepted the client ID/secret; `invalid_client` means it did not. No user is
 * signed in, created or modified.
 */
const realProbe: TokenProbe = async (clientId, clientSecret) => {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: "munchreach-connection-test",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://munchreach.com",
    }),
    signal: AbortSignal.timeout(8000),
  });
  let error: string | null = null;
  try {
    error = ((await res.json()) as { error?: string }).error ?? null;
  } catch {
    /* ignore */
  }
  return { status: res.status, error };
};
let probeOverride: TokenProbe | null = null;
export function __setGoogleTokenProbe(p: TokenProbe | null) {
  probeOverride = p;
}

export const NOT_FULLY_CONFIGURED = "Google Cloud Identity Platform is not fully configured yet.";

export async function testGoogleIdpConnection(): Promise<GoogleIdpView> {
  const current = normalize(await store().read());
  if (!current.project_id || !current.client_id || !current.secret_ciphertext) {
    throw new Error("Save a complete configuration first.");
  }
  const secret = await decryptSecret(current.secret_ciphertext);
  let result: StoredGoogleIdp["last_test_result"];
  let message: string;
  if (!secret) {
    result = "error";
    message = "The saved Client Secret could not be read. Re-enter it and save again.";
  } else {
    try {
      const r = await (probeOverride ?? realProbe)(current.client_id, secret);
      if (r.error === "invalid_client" || r.error === "unauthorized_client") {
        result = "credentials_invalid";
        message = "Google rejected the Client ID or Client Secret.";
      } else if (r.error === "invalid_grant" || r.error === "redirect_uri_mismatch") {
        // Google accepted the client credentials (the fake code is rejected).
        result = "credentials_valid";
        message = "Google Client ID and configuration are saved. Google Sign-In is not active yet.";
      } else {
        result = "error";
        message = `Google returned an unexpected response (HTTP ${r.status}).`;
      }
    } catch {
      result = "error";
      message = "Could not reach Google. Try again shortly.";
    }
  }
  const next = { ...current, last_tested_at: new Date().toISOString(), last_test_result: result, last_test_message: message };
  await store().write(next);
  return toView(next);
}
