import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildGraphMessage, getGraphAccessToken, MicrosoftReauthRequired, toRelayMessage, sendViaGraph, connectMicrosoftMailbox, isMicrosoftSmtpMailbox } from "@/lib/microsoft-graph.server";
import { microsoftConfig, MICROSOFT_REDIRECT_URI, parseTokenResponse } from "@/lib/microsoft-oauth.server";

// Offline fixtures only: fake in-memory table, stubbed fetch, no real credentials or customer data.
beforeAll(() => { process.env["PROVIDER_CREDENTIALS_KEY"] = "offline-test-only-key"; });
const config = microsoftConfig({ clientId: "11111111-1111-4111-8111-111111111111", clientSecret: "offline-fixture",
  tenantId: "organizations", redirectUri: MICROSOFT_REDIRECT_URI });
const SCOPE = "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read";

async function fakeAdmin(expiresAt: number) {
  const { encryptCredentials, decryptCredentials } = await import("@/lib/provider-credentials.server");
  const row = { mailbox_id: "m1", encrypted_tokens: encryptCredentials({ accessToken: "old-a", refreshToken: "old-r", expiresAt }), token_version: 1, status: "connected" };
  const mailbox = { status: "connected" };
  const admin = { from: (t: string) => {
    let patch: Record<string, unknown> | null = null; const eqs: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      select: () => q, update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (k: string, v: unknown) => { eqs[k] = v; return q; },
      maybeSingle: async () => ({ data: { ...row }, error: null }),
      then: (res: (v: unknown) => void) => {
        let n = 0;
        if (patch && t === "microsoft_mailbox_tokens" && (eqs["token_version"] === undefined || eqs["token_version"] === row.token_version)) { Object.assign(row, patch); n = 1; }
        if (patch && t === "mailboxes") Object.assign(mailbox, patch);
        res({ data: Array(n).fill({ mailbox_id: "m1" }), error: null });
      },
    };
    return q;
  } };
  return { admin, row, mailbox, decrypt: () => decryptCredentials<{ refreshToken: string }>(row.encrypted_tokens!) };
}

describe("Microsoft Graph mailbox", () => {
  it("restricts in-place upgrades to Microsoft SMTP and IMAP hosts", () => {
    expect(isMicrosoftSmtpMailbox({ smtp_host: "smtp.office365.com", imap_host: "outlook.office365.com" })).toBe(true);
    expect(isMicrosoftSmtpMailbox({ smtp_host: "smtp-mail.outlook.com", imap_host: "imap-mail.outlook.com" })).toBe(true);
    expect(isMicrosoftSmtpMailbox({ smtp_host: "smtp.gmail.com", imap_host: "imap.gmail.com" })).toBe(false);
    expect(isMicrosoftSmtpMailbox({ smtp_host: "smtp.office365.com", imap_host: "imap.example.test" })).toBe(false);
  });
  it.each([200, 403])("upgrades a saved SMTP mailbox only after stored-token inbox verification (%s)", async (status) => {
    const mailbox = { id: "throwaway-microsoft-mailbox", smtp_host: "smtp.office365.com", imap_host: "outlook.office365.com",
      smtp_password: "offline-vault-reference", imap_password: "offline-vault-reference", status: "pending",
      daily_send_limit: 50, warmup_enabled: true, is_active: false };
    let stored: Record<string, unknown> | null = null;
    const admin = { from: (table: string) => {
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q, eq: () => q,
        upsert: (value: Record<string, unknown>) => { stored = value; return q; },
        update: (value: Record<string, unknown>) => { patch = value; return q; },
        maybeSingle: async () => ({ data: table === "workspace_members" ? { user_id: "throwaway-user" } : table === "mailboxes" ? { ...mailbox } : stored, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (patch && table === "mailboxes") Object.assign(mailbox, patch);
          if (patch && table === "microsoft_mailbox_tokens" && stored) Object.assign(stored, patch);
          resolve({ data: null, error: null });
        },
      };
      return q;
    } };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      expect(stored?.["encrypted_tokens"]).toBeTypeOf("string");
      expect(mailbox.smtp_host).toBe("smtp.office365.com");
      return new Response(null, { status });
    });
    const tx = { userId: "throwaway-user", workspaceId: "throwaway-workspace", state: "offline", verifier: "offline",
      issuedAt: 0, expiresAt: 600000, clientId: config.clientId, tenantId: config.tenantId, redirectUri: MICROSOFT_REDIRECT_URI };
    const attempt = connectMicrosoftMailbox(admin, tx, { accessToken: "offline-access", refreshToken: "offline-refresh",
      expiresAt: Date.now() + 3600000, scope: SCOPE, profile: { id: "throwaway-microsoft-identity", email: "throwaway@example.test", displayName: null } }, { fetcher });
    if (status === 200) {
      expect(await attempt).toEqual({ mailboxId: "throwaway-microsoft-mailbox", email: "throwaway@example.test" });
      expect(mailbox.smtp_host).toBe("graph.microsoft.com");
      expect(mailbox.imap_host).toBe("graph.microsoft.com");
      expect(mailbox.smtp_password).toBeNull();
      expect(mailbox.imap_password).toBeNull();
      expect(mailbox.status).toBe("connected");
    } else {
      await expect(attempt).rejects.toThrow("inbox access could not be verified");
      expect(mailbox.smtp_host).toBe("smtp.office365.com");
      expect(mailbox.smtp_password).toBe("offline-vault-reference");
      expect(mailbox.status).toBe("pending");
    }
    expect(mailbox.id).toBe("throwaway-microsoft-mailbox");
    expect(mailbox.daily_send_limit).toBe(50);
    expect(mailbox.warmup_enabled).toBe(true);
    expect(mailbox.is_active).toBe(false);
  });
  it("requires Mail.Send, Mail.Read and User.Read in the granted scope", () => {
    expect(() => parseTokenResponse({ access_token: "a", refresh_token: "r", token_type: "Bearer", scope: "User.Read" })).toThrow("permissions");
    expect(parseTokenResponse({ access_token: "a", refresh_token: "r", token_type: "Bearer", scope: SCOPE, expires_in: 3600 }, 0).expiresAt).toBe(3_600_000);
  });
  it("reuses an unexpired access token without calling Microsoft", async () => {
    const { admin } = await fakeAdmin(Date.now() + 3_600_000);
    const fetcher = vi.fn();
    expect(await getGraphAccessToken(admin, "m1", { config, fetcher: fetcher as never })).toBe("old-a");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refreshes near expiry and stores the rotated refresh token encrypted", async () => {
    const f = await fakeAdmin(Date.now());
    const fetcher = vi.fn(async () => Response.json({ access_token: "new-a", refresh_token: "new-r", token_type: "Bearer", scope: SCOPE, expires_in: 3600 }));
    expect(await getGraphAccessToken(f.admin, "m1", { config, fetcher: fetcher as never })).toBe("new-a");
    expect(f.row.token_version).toBe(2);
    expect(f.decrypt().refreshToken).toBe("new-r");
    expect(f.row.encrypted_tokens).not.toContain("new-r");
  });
  it("marks the mailbox not connected when Microsoft revokes the refresh token", async () => {
    const f = await fakeAdmin(Date.now());
    const fetcher = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(getGraphAccessToken(f.admin, "m1", { config, fetcher: fetcher as never })).rejects.toBeInstanceOf(MicrosoftReauthRequired);
    expect(f.row.status).toBe("revoked");
    expect(f.row.encrypted_tokens).toBeNull();
    expect(f.mailbox.status).toBe("failed");
  });
  it("sends through Graph sendMail (no SMTP) and recovers the Message-ID from Sent Items", async () => {
    const f = await fakeAdmin(Date.now() + 3_600_000);
    let key = "";
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me/sendMail")) {
        key = JSON.parse(String(init?.body)).message.internetMessageHeaders.find((h: { name: string }) => h.name === "X-MunchReach-Send-Key").value;
        return new Response(null, { status: 202 });
      }
      return Response.json({ value: [{ internetMessageId: "<abc@outlook>", internetMessageHeaders: [{ name: "X-MunchReach-Send-Key", value: key }] }] });
    });
    const r = await sendViaGraph(f.admin, "m1", { from: "a@x.com", to: "b@y.com", subject: "Hi", text: "Hello" }, { fetcher: fetcher as never, lookupDelaysMs: [0] });
    expect(r).toEqual({ ok: true, message: "Accepted by Microsoft 365.", messageId: "<abc@outlook>" });
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
  });
  it("keeps Cc visible, Bcc hidden, and drops non-X headers Graph refuses", () => {
    const p = buildGraphMessage({ from: "a@x.com", to: "b@y.com", envelopeTo: ["b@y.com", "c@y.com", "d@y.com"], subject: "s", text: "t",
      headers: { Cc: "C <c@y.com>", "In-Reply-To": "<x>", "X-Campaign": "1" } }, "k");
    expect(p.message.ccRecipients).toEqual([{ emailAddress: { address: "c@y.com" } }]);
    expect(p.message.bccRecipients).toEqual([{ emailAddress: { address: "d@y.com" } }]);
    expect(p.message.internetMessageHeaders.map(h => h.name)).toEqual(["X-Campaign", "X-MunchReach-Send-Key"]);
  });
  it("maps Graph messages with threading headers for reply matching", () => {
    const m = toRelayMessage({ id: "g", internetMessageId: "<r@x>", subject: "Re: Hi", receivedDateTime: "2026-11-28T10:00:00Z",
      from: { emailAddress: { address: "lead@y.com", name: "Lead" } }, toRecipients: [{ emailAddress: { address: "a@x.com" } }],
      body: { content: "Thanks" }, internetMessageHeaders: [{ name: "In-Reply-To", value: "<abc@outlook>" }] }, 1);
    expect(m).toMatchObject({ messageId: "<r@x>", inReplyTo: "<abc@outlook>", from: "Lead <lead@y.com>", text: "Thanks" });
  });
});
