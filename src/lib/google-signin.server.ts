/**
 * Direct Google Sign-In (Google Identity Services) on top of the existing
 * Supabase Auth user/session system.
 *
 * Flow: the browser obtains a one-time authorization code from Google's
 * Identity Services popup, the server exchanges it (client secret stays here),
 * verifies the returned Google ID token (signature, issuer, audience, expiry,
 * verified email), finds or creates the matching Supabase Auth user and mints
 * a normal Supabase session. The Supabase Google OAuth provider is NOT used,
 * and nothing here depends on Google Cloud Identity Platform.
 */

export const GOOGLE_UNAVAILABLE = "Google Sign-In is currently unavailable. Please try another sign-in method.";
export const GOOGLE_FAILED = "Google sign-in could not be verified. Please try again.";
export const GOOGLE_UNCONFIRMED =
  "An account with this email is waiting for email confirmation. Confirm your email (or reset your password), then try Google again.";
export const GOOGLE_ACCOUNT_MISMATCH =
  "This email is already linked to a different Google account. Please sign in with your email and password.";

export class GoogleSignInError extends Error {}

export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"] as const;
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const CLOCK_SKEW_SECONDS = 30;

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
export type JwksFetcher = () => Promise<Jwk[]>;

let jwksCache: { keys: Jwk[]; expires: number } | null = null;

const defaultJwks: JwksFetcher = async () => {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new GoogleSignInError(GOOGLE_FAILED);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { keys, expires: Date.now() + 60 * 60 * 1000 };
  return keys;
};

function b64urlToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const bin = atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as Record<string, unknown>;
  } catch {
    throw new GoogleSignInError(GOOGLE_FAILED);
  }
}

/**
 * Verifies a Google ID token: RS256 signature against Google's published keys,
 * issuer, audience (and azp) equal to the configured client ID, expiry, and a
 * present + verified email. Throws GoogleSignInError on any failure.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  opts: { jwks?: JwksFetcher; nowSeconds?: number } = {},
): Promise<GoogleIdentity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleSignInError(GOOGLE_FAILED);
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson(h);
  const payload = decodeJson(p);
  if (header["alg"] !== "RS256" || typeof header["kid"] !== "string") throw new GoogleSignInError(GOOGLE_FAILED);

  const keys = await (opts.jwks ?? defaultJwks)();
  const jwk = keys.find((k) => k.kid === header["kid"]);
  if (!jwk) throw new GoogleSignInError(GOOGLE_FAILED);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(s) as BufferSource,
    new TextEncoder().encode(`${h}.${p}`) as BufferSource,
  );
  if (!valid) throw new GoogleSignInError(GOOGLE_FAILED);

  if (!GOOGLE_ISSUERS.includes(payload["iss"] as (typeof GOOGLE_ISSUERS)[number])) {
    throw new GoogleSignInError(GOOGLE_FAILED);
  }
  const aud = payload["aud"];
  const audOk = Array.isArray(aud) ? aud.length === 1 && aud[0] === clientId : aud === clientId;
  if (!audOk) throw new GoogleSignInError(GOOGLE_FAILED);
  if (payload["azp"] !== undefined && payload["azp"] !== clientId) throw new GoogleSignInError(GOOGLE_FAILED);

  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = Number(payload["exp"]);
  if (!Number.isFinite(exp) || exp + CLOCK_SKEW_SECONDS < now) throw new GoogleSignInError(GOOGLE_FAILED);
  const iat = Number(payload["iat"]);
  if (Number.isFinite(iat) && iat - CLOCK_SKEW_SECONDS > now) throw new GoogleSignInError(GOOGLE_FAILED);

  const sub = typeof payload["sub"] === "string" ? payload["sub"] : "";
  const email = typeof payload["email"] === "string" ? payload["email"].trim().toLowerCase() : "";
  const verified = payload["email_verified"] === true || payload["email_verified"] === "true";
  if (!sub || !email) throw new GoogleSignInError(GOOGLE_FAILED);
  if (!verified) throw new GoogleSignInError("Your Google account email is not verified. Please verify it with Google or use another sign-in method.");

  return {
    sub,
    email,
    name: typeof payload["name"] === "string" ? payload["name"] : null,
    picture: typeof payload["picture"] === "string" ? payload["picture"] : null,
  };
}

/** Exchanges a GIS popup authorization code for tokens. Secret never leaves the server. */
export async function exchangeGoogleCode(code: string, clientId: string, clientSecret: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        // GIS popup code flow uses the special "postmessage" redirect URI.
        redirect_uri: "postmessage",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new GoogleSignInError("Could not reach Google. Please try again.");
  }
  let body: { id_token?: string } = {};
  try {
    body = (await res.json()) as { id_token?: string };
  } catch {
    /* handled below */
  }
  if (!res.ok || typeof body.id_token !== "string") throw new GoogleSignInError(GOOGLE_FAILED);
  return body.id_token;
}

// ---------------------------------------------------------------------------
// Supabase Auth user matching + session minting
// ---------------------------------------------------------------------------

export type AuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  app_metadata: Record<string, unknown>;
};

export type AuthOps = {
  /** Returns the new user, or `null` when the email already belongs to a user. */
  createUser: (identity: GoogleIdentity) => Promise<AuthUser | null>;
  /** Server-side one-time sign-in token for an existing user (no email sent). */
  prepareSignIn: (email: string) => Promise<{ user: AuthUser; tokenHash: string }>;
  setAppMetadata: (userId: string, appMetadata: Record<string, unknown>) => Promise<void>;
  mintSession: (tokenHash: string) => Promise<{ access_token: string; refresh_token: string }>;
};

export type GoogleClient = { clientId: string; clientSecret: string };

export type GoogleSignInDeps = {
  getClient: () => Promise<GoogleClient | null>;
  exchangeCode: (code: string, client: GoogleClient) => Promise<string>;
  verify: (idToken: string, clientId: string) => Promise<GoogleIdentity>;
  auth: AuthOps;
};

export type GoogleSignInResult =
  | { ok: true; isNewUser: boolean; session: { access_token: string; refresh_token: string } }
  | { ok: false; error: string };

export async function completeGoogleSignInWith(deps: GoogleSignInDeps, code: string): Promise<GoogleSignInResult> {
  try {
    const client = await deps.getClient();
    if (!client) return { ok: false, error: GOOGLE_UNAVAILABLE };

    const idToken = await deps.exchangeCode(code, client);
    const identity = await deps.verify(idToken, client.clientId);

    const created = await deps.auth.createUser(identity);
    const { user, tokenHash } = await deps.auth.prepareSignIn(identity.email);
    if ((user.email ?? "").toLowerCase() !== identity.email) throw new GoogleSignInError(GOOGLE_FAILED);

    if (!created) {
      // Pre-hijack protection: never hand an unconfirmed account (whose owner
      // never proved the email) to a Google sign-in.
      if (!user.email_confirmed_at) return { ok: false, error: GOOGLE_UNCONFIRMED };
      const linked = user.app_metadata["google_sub"];
      if (typeof linked === "string" && linked && linked !== identity.sub) {
        return { ok: false, error: GOOGLE_ACCOUNT_MISMATCH };
      }
      if (!linked) await deps.auth.setAppMetadata(user.id, { ...user.app_metadata, google_sub: identity.sub });
    }

    const session = await deps.auth.mintSession(tokenHash);
    return { ok: true, isNewUser: Boolean(created), session };
  } catch (error) {
    if (error instanceof GoogleSignInError) return { ok: false, error: error.message };
    return { ok: false, error: GOOGLE_FAILED };
  }
}

function toAuthUser(u: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}): AuthUser {
  return {
    id: u.id,
    email: u.email ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    app_metadata: (u.app_metadata ?? {}) as Record<string, unknown>,
  };
}

/** Real Supabase Auth operations (service role stays on the server). */
export async function supabaseAuthOps(): Promise<AuthOps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return {
    async createUser(identity) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: identity.email,
        email_confirm: true,
        user_metadata: {
          full_name: identity.name ?? undefined,
          avatar_url: identity.picture ?? undefined,
        },
        app_metadata: { google_sub: identity.sub },
      });
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "email_exists" || /already (been )?registered/i.test(error.message)) return null;
        throw new GoogleSignInError(GOOGLE_FAILED);
      }
      if (!data.user) throw new GoogleSignInError(GOOGLE_FAILED);
      return toAuthUser(data.user);
    },
    async prepareSignIn(email) {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
      const tokenHash = data?.properties?.hashed_token;
      if (error || !data?.user || !tokenHash) throw new GoogleSignInError(GOOGLE_FAILED);
      return { user: toAuthUser(data.user), tokenHash };
    },
    async setAppMetadata(userId, appMetadata) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
      if (error) throw new GoogleSignInError(GOOGLE_FAILED);
    },
    async mintSession(tokenHash) {
      const { publicClient } = await import("@/lib/auth-settings.server");
      const client = publicClient();
      const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
      const s = data?.session;
      if (error || !s) throw new GoogleSignInError(GOOGLE_FAILED);
      return { access_token: s.access_token, refresh_token: s.refresh_token };
    },
  };
}
