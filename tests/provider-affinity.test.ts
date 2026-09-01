import { describe, expect, it } from "vitest";

import { selectProvider } from "@/lib/provider-pool.server";

type Row = Record<string, unknown>;

/**
 * Minimal Supabase stub.
 *
 * `scopedColumnsExist: false` reproduces the production incident: a database
 * without `customer_enabled`/`system_enabled`. The pool must still load.
 */
function makeAdmin(rows: Row[], scopedColumnsExist: boolean) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select(columns: string) {
          if (table === "email_providers" && !scopedColumnsExist && columns.includes("customer_enabled")) {
            return {
              order: () => Promise.resolve({ data: null, error: { message: "column does not exist" } }),
              eq: () => Promise.resolve({ data: null, error: { message: "column does not exist" } }),
            };
          }
          if (table === "email_providers") {
            return {
              order: () => Promise.resolve({ data: rows, error: null }),
              eq: () => Promise.resolve({ data: rows, error: null }),
            };
          }
          // email_provider_secrets
          return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) };
        },
      };
      return builder;
    },
  };
}

const base = {
  name: "p",
  priority: 10,
  daily_capacity: 1000,
  hourly_capacity: 100,
  status: "verified",
  mode: "live",
  region: null,
  health_status: "healthy",
  sent_hour: 0,
  sent_day: 0,
  success_count: 1,
  failure_count: 0,
};

describe("provider routing affinity", () => {
  it("loads the pool even when the scope columns are missing", async () => {
    const admin = makeAdmin(
      [{ id: "resend-1", provider: "resend", is_enabled: true, ...base }],
      false,
    );
    const selected = await selectProvider(admin, { key: "example.com", preferredProvider: "resend" });
    expect(selected?.providerId).toBe("resend-1");
    expect(selected?.provider).toBe("resend");
  });

  it("never routes a sender to a provider it is not provisioned on", async () => {
    const admin = makeAdmin(
      [
        { id: "resend-1", provider: "resend", is_enabled: true, ...base },
        { id: "ses-1", provider: "ses", is_enabled: false, ...base },
      ],
      true,
    );
    // The SES-provisioned sender must NOT fall through to Resend (which does
    // not know the domain and rejects it as unverified).
    expect(await selectProvider(admin, { key: "smart.example", preferredProvider: "ses" })).toBeNull();
  });

  it("keeps a provisioned sender on its own healthy provider", async () => {
    const admin = makeAdmin(
      [
        { id: "resend-1", provider: "resend", is_enabled: true, ...base, priority: 1 },
        { id: "ses-1", provider: "ses", is_enabled: true, ...base, priority: 50 },
      ],
      true,
    );
    const selected = await selectProvider(admin, { key: "smart.example", preferredProvider: "ses" });
    expect(selected?.provider).toBe("ses");
  });
});
