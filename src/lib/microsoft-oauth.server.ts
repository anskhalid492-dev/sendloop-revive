import { z } from "zod";

export const MICROSOFT_REDIRECT_URI = "https://munchreach.com/api/public/integrations/microsoft/callback";
export const MICROSOFT_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/User.Read",
  "openid", "profile", "email", "offline_access",
] as const;
export const MICROSOFT_COOKIE = "__Host-munchreach-microsoft-oauth";
export const TRANSACTION_SECONDS = 600;

const configSchema = z.object({
  clientId: z.string().uuid(),
  clientSecret: z.string().min(1),
  tenantId: z.union([z.string().uuid(), z.literal("organizations")]),
  redirectUri: z.literal(MICROSOFT_REDIRECT_URI),
});
export type MicrosoftConfig = z.infer<typeof configSchema>;
export function microsoftConfig(input: unknown): MicrosoftConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) throw new Error("Microsoft OAuth is not configured.");
  return result.data;
}

const transactionSchema = z.object({
  userId: z.string().uuid(), workspaceId: z.string().uuid(),
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number(), issuedAt: z.number(),
  clientId: z.string().uuid(), tenantId: z.string(),
  redirectUri: z.literal(MICROSOFT_REDIRECT_URI),
});
export type MicrosoftTransaction = z.infer<typeof transactionSchema>;
const encoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
function randomValue(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
}
async function cookieKey(config: MicrosoftConfig): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(config.clientSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: encoder.encode(config.clientId),
    info: encoder.encode("munchreach:microsoft-oauth-cookie:v1") }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function sealTransaction(config: MicrosoftConfig, transaction: MicrosoftTransaction): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(MICROSOFT_COOKIE) },
    await cookieKey(config), encoder.encode(JSON.stringify(transaction)));
  return `${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function validateTransaction(config: MicrosoftConfig, sealed: string, state: string, now = Date.now()): Promise<MicrosoftTransaction | null> {
  try {
    if (sealed.length > 4096) return null;
    const parts = sealed.split(".");
    const iv = parts[0], ciphertext = parts[1];
    if (!iv || !ciphertext || parts.length !== 2) return null;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv), additionalData: encoder.encode(MICROSOFT_COOKIE) },
      await cookieKey(config), decode(ciphertext));
    const tx = transactionSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
    if (tx.state !== state || tx.expiresAt <= now || tx.issuedAt > now ||
        tx.expiresAt - tx.issuedAt !== TRANSACTION_SECONDS * 1000 ||
        tx.clientId !== config.clientId || tx.tenantId !== config.tenantId || tx.redirectUri !== config.redirectUri) return null;
    return tx;
  } catch { return null; }
}
export async function prepareMicrosoftConsent(config: MicrosoftConfig, userId: string, workspaceId: string, now = Date.now()) {
  const tx = transactionSchema.parse({ userId, workspaceId, state: randomValue(), verifier: randomValue(),
    issuedAt: now, expiresAt: now + TRANSACTION_SECONDS * 1000,
    clientId: config.clientId, tenantId: config.tenantId, redirectUri: config.redirectUri });
  const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: "code", response_mode: "query", scope: MICROSOFT_SCOPES.join(" "),
    state: tx.state, code_challenge: await pkceChallenge(tx.verifier), code_challenge_method: "S256",
    prompt: "select_account" }).toString();
  return { authorizationUrl: url.toString(), cookie: await sealTransaction(config, tx) };
}

/** Preparation-only verification. Tokens stay in request memory; no connected mailbox is created. */
export async function verifyMicrosoftCode(config: MicrosoftConfig, tx: MicrosoftTransaction, code: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!code || code.length > 8192) throw new Error("Microsoft authorization code is invalid.");
  const response = await fetcher(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: "authorization_code", code,
      code_verifier: tx.verifier, scope: MICROSOFT_SCOPES.join(" ") }),
  });
  // Provider responses can contain credentials: never log/return their bodies.
  if (!response.ok) throw new Error("Microsoft authorization exchange failed.");
  const tokens = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1),
    token_type: z.string(), scope: z.string() }).safeParse(await response.json());
  if (!tokens.success || tokens.data.token_type.toLowerCase() !== "bearer") throw new Error("Microsoft authorization response is incomplete.");
  const granted = new Set(tokens.data.scope.split(" ").map(s => s.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase()));
  if (!["mail.send", "mail.read", "user.read"].every(s => granted.has(s))) throw new Error("Microsoft mail permissions were not granted.");
  const me = await fetcher("https://graph.microsoft.com/v1.0/me?$select=id", {
    headers: { Authorization: `Bearer ${tokens.data.access_token}` }, redirect: "manual", signal: AbortSignal.timeout(12_000),
  });
  if (!me.ok || !z.object({ id: z.string().min(1) }).safeParse(await me.json()).success) throw new Error("Microsoft account verification failed.");
}