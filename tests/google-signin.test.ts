import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_ACCOUNT_MISMATCH,
  GOOGLE_UNAVAILABLE,
  GOOGLE_UNCONFIRMED,
  completeGoogleSignInWith,
  verifyGoogleIdToken,
  type AuthOps,
  type AuthUser,
  type GoogleIdentity,
  type GoogleSignInDeps,
} from "@/lib/google-signin.server";
import {
  __setGoogleIdpStore,
  getGoogleSignInClient,
  getGoogleSignInClientId,
  saveGoogleIdpConfig,
  setGoogleIdpEnabled,
  type StoredGoogleIdp,
} from "@/lib/auth-providers-config.server";

const read = (p: string) => readFileSync(p, "utf8");
const CLIENT_ID = "1234567890-abcdef.apps.googleusercontent.com";
const SECRET = "GOCSPX-super-secret-value-xyz";

// ---------------------------------------------------------------- token signing
let privateKey: CryptoKey;
let jwk: { kid: string; kty: string; n: string; e: string };
const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);

beforeAll(async () => {
  process.env.PROVIDER_CREDENTIALS_KEY ??= "test-key-0123456789abcdef0123456789abcdef";
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  jwk = { kid: "k1", kty: "RSA", n: pub.n!, e: pub.e! };
});

async function sign(payload: Record<string, unknown>, kid = "k1", key?: CryptoKey) {
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const h = enc({ alg: "RS256", kid, typ: "JWT" });
  const p = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key ?? privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}
const good = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  azp: CLIENT_ID,
  sub: "google-sub-1",
  email: "Jane@Example.com",
  email_verified: true,
  name: "Jane",
  iat: now - 10,
  exp: now + 3600,
  ...over,
});
const jwks = async () => [jwk];

describe("server-side Google ID token verification", () => {
  it("accepts a valid token and normalizes the email", async () => {
    const id = await verifyGoogleIdToken(await sign(good()), CLIENT_ID, { jwks });
    expect(id).toMatchObject({ sub: "google-sub-1", email: "jane@example.com" });
  });
  it("rejects a bad signature", async () => {
    const other = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    await expect(verifyGoogleIdToken(await sign(good(), "k1", other.privateKey), CLIENT_ID, { jwks })).rejects.toThrow();
  });
  it("rejects an invalid audience", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ aud: "999-other.apps.googleusercontent.com" })), CLIENT_ID, { jwks })).rejects.toThrow();
  });
  it("rejects an invalid issuer", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ iss: "https://evil.example.com" })), CLIENT_ID, { jwks })).rejects.toThrow();
  });
  it("rejects an expired token", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ exp: now - 600 })), CLIENT_ID, { jwks })).rejects.toThrow();
  });
  it("rejects an unverified Google email", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ email_verified: false })), CLIENT_ID, { jwks })).rejects.toThrow(/not verified/);
  });
  it("rejects a token without an email", async () => {
    await expect(verifyGoogleIdToken(await sign(good({ email: undefined })), CLIENT_ID, { jwks })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------- user matching
type Fake = { users: AuthUser[]; ops: AuthOps; created: number; updated: Record<string, unknown>[] };
function fakeAuth(initial: AuthUser[] = []): Fake {
  const f: Fake = { users: [...initial], created: 0, updated: [], ops: null as never };
  f.ops = {
    createUser: async (i: GoogleIdentity) => {
      if (f.users.some((u) => u.email === i.email)) return null;
      const u: AuthUser = { id: `new-${f.users.length}`, email: i.email, email_confirmed_at: "now", app_metadata: { google_sub: i.sub } };
      f.users.push(u);
      f.created++;
      return u;
    },
    prepareSignIn: async (email) => {
      const user = f.users.find((u) => u.email === email)!;
      return { user, tokenHash: `hash-${user.id}` };
    },
    setAppMetadata: async (id, meta) => {
      f.updated.push(meta);
      const u = f.users.find((x) => x.id === id)!;
      u.app_metadata = meta;
    },
    mintSession: async (hash) => ({ access_token: `at-${hash}`, refresh_token: "rt" }),
  };
  return f;
}
function deps(auth: AuthOps, identity: Partial<GoogleIdentity> = {}, client = true): GoogleSignInDeps {
  return {
    getClient: async () => (client ? { clientId: CLIENT_ID, clientSecret: SECRET } : null),
    exchangeCode: async () => "id-token",
    verify: async (_t, clientId) => {
      expect(clientId).toBe(CLIENT_ID);
      return { sub: "google-sub-1", email: "jane@example.com", name: "Jane", picture: null, ...identity };
    },
    auth,
  };
}
const EXISTING: AuthUser = { id: "existing-1", email: "jane@example.com", email_confirmed_at: "2026-01-01", app_metadata: { provider: "email" } };

describe("Google user matching on Supabase Auth", () => {
  it("existing verified-email user signs into the existing account, no duplicate", async () => {
    const f = fakeAuth([{ ...EXISTING }]);
    const r = await completeGoogleSignInWith(deps(f.ops), "code-123456");
    expect(r).toEqual({ ok: true, isNewUser: false, session: { access_token: "at-hash-existing-1", refresh_token: "rt" } });
    expect(f.created).toBe(0);
    expect(f.users).toHaveLength(1);
    expect(f.updated[0]).toEqual({ provider: "email", google_sub: "google-sub-1" });
  });

  it("new Google user is created once and routed to onboarding (isNewUser)", async () => {
    const f = fakeAuth();
    const r = await completeGoogleSignInWith(deps(f.ops), "code-123456");
    expect(r.ok && r.isNewUser).toBe(true);
    expect(f.created).toBe(1);
    const again = await completeGoogleSignInWith(deps(f.ops), "code-123456");
    expect(again.ok && again.isNewUser).toBe(false);
    expect(f.users).toHaveLength(1);
  });

  it("refuses unconfirmed existing accounts (pre-hijack protection)", async () => {
    const f = fakeAuth([{ ...EXISTING, email_confirmed_at: null }]);
    expect(await completeGoogleSignInWith(deps(f.ops), "code-123456")).toEqual({ ok: false, error: GOOGLE_UNCONFIRMED });
  });

  it("refuses an account linked to a different Google identity", async () => {
    const f = fakeAuth([{ ...EXISTING, app_metadata: { google_sub: "someone-else" } }]);
    expect(await completeGoogleSignInWith(deps(f.ops), "code-123456")).toEqual({ ok: false, error: GOOGLE_ACCOUNT_MISMATCH });
  });

  it("missing/disabled configuration returns the clean unavailable message", async () => {
    const f = fakeAuth();
    expect(await completeGoogleSignInWith(deps(f.ops, {}, false), "code-123456")).toEqual({ ok: false, error: GOOGLE_UNAVAILABLE });
  });

  it("verification failure returns a clean error and creates no user", async () => {
    const f = fakeAuth();
    const d = deps(f.ops);
    d.verify = vi.fn(async () => {
      throw new Error("boom internal");
    });
    const r = await completeGoogleSignInWith(d, "code-123456");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("boom");
    expect(f.created).toBe(0);
  });
});

// ---------------------------------------------------------------- admin config source
describe("Client ID comes from the admin configuration", () => {
  let saved: StoredGoogleIdp | null = null;
  afterEach(() => __setGoogleIdpStore(null));
  it("only exposes the client id when the saved config is enabled", async () => {
    __setGoogleIdpStore({ read: async () => saved, write: async (v) => void (saved = v ? JSON.parse(JSON.stringify(v)) : null) });
    expect(await getGoogleSignInClientId()).toBeNull();
    await saveGoogleIdpConfig({ projectId: "munchreach-prod", clientId: CLIENT_ID, clientSecret: SECRET, authorizedDomain: "munchreach.com" });
    expect(await getGoogleSignInClientId()).toBeNull();
    await setGoogleIdpEnabled(true);
    expect(await getGoogleSignInClientId()).toBe(CLIENT_ID);
    expect(await getGoogleSignInClient()).toEqual({ clientId: CLIENT_ID, clientSecret: SECRET });
    await setGoogleIdpEnabled(false);
    expect(await getGoogleSignInClient()).toBeNull();
  });
});

// ---------------------------------------------------------------- static guarantees
describe("implementation guarantees", () => {
  const pages = ["src/routes/signin.tsx", "src/routes/signup.tsx", "src/hooks/useGoogleSignIn.ts", "src/lib/google-identity-browser.ts"];
  it("Google buttons never call Supabase OAuth or /auth/v1/authorize", () => {
    for (const p of pages) {
      expect(read(p)).not.toMatch(/signInWithOAuth|\/auth\/v1\/authorize|signInWithIdToken/);
    }
    expect(read("src/routes/signin.tsx")).toContain("useGoogleSignIn");
    expect(read("src/routes/signup.tsx")).toContain("useGoogleSignIn");
    expect(read("src/lib/google-identity-browser.ts")).toContain("https://accounts.google.com/gsi/client");
  });

  it("Client ID is read from the admin config, not env vars", () => {
    const fns = read("src/lib/google-signin.functions.ts");
    expect(fns).toContain("getGoogleSignInClientId");
    for (const p of [...pages, "src/lib/google-signin.functions.ts"]) expect(read(p)).not.toMatch(/import\.meta\.env|VITE_GOOGLE/);
  });

  it("client secret and service role never reach browser code", () => {
    for (const p of pages) {
      const src = read(p);
      expect(src).not.toMatch(/client_secret|clientSecret|client\.server|SERVICE_ROLE|\.server"/);
    }
    // The public config function returns only availability + client id.
    expect(read("src/lib/google-signin.functions.ts")).toMatch(/return \{ available: Boolean\(clientId\), clientId \}/);
  });

  it("sessions are normal Supabase Auth sessions; no Identity Platform dependency", () => {
    const server = read("src/lib/google-signin.server.ts");
    expect(server).toContain("auth.admin.createUser");
    expect(server).toContain("verifyOtp");
    expect(read("src/hooks/useGoogleSignIn.ts")).toContain("supabase.auth.setSession");
    for (const p of ["src/lib/google-signin.server.ts", "src/lib/google-signin.functions.ts", ...pages]) {
      expect(read(p)).not.toMatch(/identitytoolkit|identityplatform|firebase/i);
    }
    expect(read("package.json")).not.toMatch(/firebase|identity-platform/);
  });

  it("email/password sign-in is unchanged", () => {
    const signin = read("src/routes/signin.tsx");
    expect(signin).toContain("signInWithTurnstile");
    expect(read("src/lib/auth-turnstile.functions.ts")).toContain("signInWithPassword");
  });
});
