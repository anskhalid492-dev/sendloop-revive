import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  __setGoogleIdpStore,
  __setGoogleTokenProbe,
  getGoogleIdpView,
  removeGoogleIdpConfig,
  saveGoogleIdpConfig,
  setGoogleIdpEnabled,
  testGoogleIdpConnection,
  type StoredGoogleIdp,
} from "@/lib/auth-providers-config.server";
import { MASKED_SECRET, normalizeDomain, validateGoogleIdpInput } from "@/lib/auth-providers-config";

const SECRET = "GOCSPX-super-secret-value-xyz";
const VALID = {
  projectId: "munchreach-prod",
  clientId: "1234567890-abcdef.apps.googleusercontent.com",
  clientSecret: SECRET,
  authorizedDomain: "munchreach.com",
};
const read = (p: string) => readFileSync(p, "utf8");

let saved: StoredGoogleIdp | null = null;
beforeAll(() => {
  process.env.PROVIDER_CREDENTIALS_KEY ??= "test-key-0123456789abcdef0123456789abcdef";
});
function useMem() {
  saved = null;
  __setGoogleIdpStore({ read: async () => saved, write: async (v) => void (saved = v ? JSON.parse(JSON.stringify(v)) : null) });
}
afterEach(() => {
  __setGoogleIdpStore(null);
  __setGoogleTokenProbe(null);
});

describe("validation", () => {
  it("rejects bad project id, client id, missing secret, http domain", () => {
    expect(validateGoogleIdpInput({ ...VALID, projectId: "Bad_ID" }, false)).toMatch(/Project ID/);
    expect(validateGoogleIdpInput({ ...VALID, clientId: "" }, false)).toMatch(/Client ID/);
    expect(validateGoogleIdpInput({ ...VALID, clientSecret: "" }, false)).toMatch(/Client Secret/);
    expect(validateGoogleIdpInput({ ...VALID, clientSecret: "" }, true)).toBeNull();
    expect(normalizeDomain("http://munchreach.com")).toBeNull();
    expect(normalizeDomain("https://munchreach.com/")).toBe("munchreach.com");
    expect(validateGoogleIdpInput(VALID, false)).toBeNull();
  });
});

describe("storage lifecycle", () => {
  it("starts not configured", async () => {
    useMem();
    expect((await getGoogleIdpView()).status).toBe("not_configured");
  });

  it("saves encrypted, returns only a mask, never the secret", async () => {
    useMem();
    const view = await saveGoogleIdpConfig(VALID);
    expect(view.status).toBe("configured");
    expect(view.maskedSecret).toBe(MASKED_SECRET);
    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(JSON.stringify(saved)).not.toContain(SECRET);
    expect(JSON.stringify(await getGoogleIdpView())).not.toContain(SECRET);
  });

  it("updates keeping the stored secret, rejects duplicate save", async () => {
    useMem();
    await saveGoogleIdpConfig(VALID);
    const ct = saved!.secret_ciphertext;
    await expect(saveGoogleIdpConfig({ ...VALID, clientSecret: "" })).rejects.toThrow(/already saved/);
    const v = await saveGoogleIdpConfig({ ...VALID, clientSecret: "", projectId: "munchreach-two" });
    expect(v.projectId).toBe("munchreach-two");
    expect(saved!.secret_ciphertext).toBe(ct);
  });

  it("enable, disable keeps credentials; remove clears", async () => {
    useMem();
    await saveGoogleIdpConfig(VALID);
    expect((await setGoogleIdpEnabled(true)).status).toBe("enabled");
    const d = await setGoogleIdpEnabled(false);
    expect(d.status).toBe("disabled");
    expect(d.hasSecret).toBe(true);
    const r = await removeGoogleIdpConfig();
    expect(r.status).toBe("not_configured");
    expect(saved!.secret_ciphertext).toBeNull();
  });
});

describe("test connection", () => {
  it("accepted credentials report valid without signing anyone in", async () => {
    useMem();
    await saveGoogleIdpConfig(VALID);
    const probe = vi.fn(async (_id: string, s: string) => {
      expect(s).toBe(SECRET);
      return { status: 400, error: "invalid_grant" };
    });
    __setGoogleTokenProbe(probe);
    const v = await testGoogleIdpConnection();
    expect(v.lastTestResult).toBe("credentials_valid");
    expect(v.lastTestMessage).toBe("Google Client ID and configuration are saved. Google Sign-In is not active yet.");
    expect(JSON.stringify(v)).not.toContain(SECRET);
  });

  it("reports rejected credentials", async () => {
    useMem();
    await saveGoogleIdpConfig(VALID);
    __setGoogleTokenProbe(async () => ({ status: 401, error: "invalid_client" }));
    expect((await testGoogleIdpConnection()).lastTestResult).toBe("credentials_invalid");
  });
});

describe("access control and scope", () => {
  const fns = read("src/lib/auth-providers-config.functions.ts");
  it("every server function requires auth and the platform admin guard", () => {
    const handlers = fns.split("createServerFn(").slice(1);
    expect(handlers).toHaveLength(5);
    for (const h of handlers) {
      expect(h).toContain("requireSupabaseAuth");
      expect(h).toContain("await guard(context");
    }
    expect(fns).toContain("assertPlatformAdmin");
  });

  it("remove requires explicit confirmation", () => {
    expect(fns).toContain('z.literal("REMOVE")');
  });

  it("audit entries never include secret values", () => {
    expect(fns).not.toMatch(/writeAudit\([^)]*clientSecret/);
  });

  it("pages, guards and the root never import the server config directly", () => {
    for (const p of ["src/routes/auth.tsx", "src/routes/signin.tsx", "src/routes/signup.tsx", "src/routes/_authenticated/route.tsx", "src/routes/__root.tsx", "src/lib/auth-settings.functions.ts"]) {
      expect(read(p)).not.toMatch(/auth-providers-config|google_idp|GoogleIdp/);
    }
  });

  it("client card never reads browser storage or URL for secrets", () => {
    const card = read("src/components/admin/GoogleIdentityPlatformCard.tsx");
    expect(card).not.toMatch(/localStorage|sessionStorage|import\.meta\.env|searchParams/);
  });
});
