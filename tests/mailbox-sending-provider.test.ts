import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveMailboxSendingProvider } from "@/lib/mailbox-sending-provider.server";

type DomainRow = Record<string, unknown> | null;

function adminWithDomain(row: DomainRow) {
  return {
    from: () => ({
      select: () => ({
        ilike: () => ({ maybeSingle: async () => ({ data: row }) }),
      }),
    }),
  };
}

const selectProvider = vi.fn();

vi.mock("@/lib/provider-pool.server", () => ({
  selectProvider: (...args: unknown[]) => selectProvider(...args),
}));

const maileroo = {
  provider: "maileroo",
  providerId: "maileroo-id",
  credentials: { api_key: "account-key" },
  mode: "live" as const,
  region: null,
};

describe("mailbox send-time provider resolution", () => {
  beforeEach(() => {
    selectProvider.mockReset();
  });

  it("routes to the active provider when the mailbox's stored provider is disabled", async () => {
    // First call (domain pin on resend) yields nothing: resend is switched off.
    selectProvider.mockResolvedValueOnce(null).mockResolvedValueOnce(maileroo);

    const resolved = await resolveMailboxSendingProvider(
      adminWithDomain({
        provider: "resend",
        provider_id: "resend-id",
        stage: "ready",
        verified_at: "2026-08-24T00:00:00Z",
        dns_status: "verified",
      }),
      { id: "mailbox-1", from_email: "user@example.com", provider: "resend", provider_id: "resend-id" },
    );

    expect(resolved?.provider).toBe("maileroo");
    expect(resolved?.pinned).toBe(false);
  });

  it("keeps a verified domain on its own provider while that provider is still active", async () => {
    selectProvider.mockResolvedValueOnce({ ...maileroo, provider: "resend", providerId: "resend-id" });

    const resolved = await resolveMailboxSendingProvider(
      adminWithDomain({
        provider: "resend",
        provider_id: "resend-id",
        stage: "ready",
        verified_at: "2026-08-24T00:00:00Z",
        dns_status: "verified",
      }),
      { id: "mailbox-1", from_email: "user@example.com", provider: "resend", provider_id: "resend-id" },
    );

    expect(resolved?.provider).toBe("resend");
    expect(resolved?.pinned).toBe(true);
    expect(selectProvider).toHaveBeenCalledTimes(1);
  });

  it("resolves a mailbox with no linked provider record to the active provider", async () => {
    selectProvider.mockResolvedValueOnce(maileroo);

    const resolved = await resolveMailboxSendingProvider(adminWithDomain(null), {
      id: "mailbox-2",
      from_email: "user@nowhere.test",
      provider: "resend",
      provider_id: null,
    });

    expect(resolved?.provider).toBe("maileroo");
    // No pinned attempt is made, and no platform environment key for the stale
    // provider is ever consulted.
    expect(selectProvider).toHaveBeenCalledTimes(1);
    expect(selectProvider.mock.calls[0]?.[1]).toMatchObject({ preferredProvider: null });
  });

  it("refuses the send when no infrastructure is active", async () => {
    selectProvider.mockResolvedValue(null);

    const resolved = await resolveMailboxSendingProvider(adminWithDomain(null), {
      id: "mailbox-3",
      from_email: "user@nowhere.test",
      provider: "resend",
      provider_id: null,
    });

    expect(resolved).toBeNull();
  });
});
