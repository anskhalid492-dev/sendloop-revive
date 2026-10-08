/**
 * Shared (browser-safe) types and validation for platform authentication
 * provider configuration. Only Google is implemented; the provider list is a
 * union so Microsoft / Apple can be added later without reshaping storage.
 * Nothing here is a secret — the client secret never reaches this module's
 * consumers on the browser side.
 */
export const AUTH_CONFIG_PROVIDERS = ["google"] as const;
export type AuthConfigProvider = (typeof AUTH_CONFIG_PROVIDERS)[number];

export type GoogleIdpStatus = "not_configured" | "configured" | "enabled" | "disabled";
export const MASKED_SECRET = "••••••••••••••••••";

export type GoogleIdpView = {
  status: GoogleIdpStatus;
  projectId: string | null;
  clientId: string | null;
  hasSecret: boolean;
  maskedSecret: string | null;
  authorizedDomain: string | null;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestResult: "credentials_valid" | "credentials_invalid" | "not_fully_configured" | "error" | null;
  lastTestMessage: string | null;
  updatedAt: string | null;
};

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const DOMAIN = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export type GoogleIdpInput = {
  projectId: string;
  clientId: string;
  clientSecret?: string | null | undefined;
  authorizedDomain: string;
};

/** Returns an error message, or null when valid. `hasStoredSecret` allows keeping the saved secret. */
export function validateGoogleIdpInput(input: GoogleIdpInput, hasStoredSecret: boolean): string | null {
  const projectId = input.projectId.trim();
  if (!PROJECT_ID.test(projectId)) {
    return "Project ID must be 6–30 characters: lowercase letters, digits and hyphens, starting with a letter.";
  }
  const clientId = input.clientId.trim();
  if (!clientId) return "Enter the Google Web Client ID.";
  if (!CLIENT_ID.test(clientId)) return "Client ID should look like 1234567890-abc.apps.googleusercontent.com.";
  const secret = (input.clientSecret ?? "").trim();
  if (!secret && !hasStoredSecret) return "Enter the Google Web Client Secret.";
  if (secret && (secret.length < 10 || /\s/.test(secret))) return "The Client Secret looks invalid.";
  const domain = normalizeDomain(input.authorizedDomain);
  if (domain === null) return "Authorized domain must be an HTTPS domain such as munchreach.com.";
  return null;
}

/** Accepts "munchreach.com" or "https://munchreach.com"; rejects http:// and localhost. */
export function normalizeDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (v.startsWith("http://")) return null;
  v = v.replace(/^https:\/\//, "").replace(/\/+$/, "");
  return DOMAIN.test(v) ? v : null;
}
