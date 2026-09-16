import { describe, expect, it } from "vitest";

import { findCustomerMailbox } from "@/lib/customer-mailbox-send.server";
import { PAUSED_MAILBOX_MESSAGE, isMailboxPaused } from "@/lib/mailbox-active.server";

/** Minimal admin stub returning one mailbox row for any lookup. */
function adminWith(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
    }),
  };
}

const connected = {
  id: "m1",
  email_address: "sender@example.com",
  display_name: "Sender",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_secure: "starttls",
  smtp_username: "sender@example.com",
  smtp_password: "ref",
  status: "connected",
  is_active: true,
};

describe("mailbox active gate", () => {
  it("returns a connected, active mailbox", async () => {
    const row = await findCustomerMailbox(adminWith(connected), "ws1", "Sender@Example.com");
    expect(row?.email_address).toBe("sender@example.com");
  });

  it("refuses a paused mailbox exactly like no connected mailbox", async () => {
    const row = await findCustomerMailbox(
      adminWith({ ...connected, is_active: false }),
      "ws1",
      "sender@example.com",
    );
    expect(row).toBeNull();
  });

  it("still refuses a mailbox that is not connected", async () => {
    const row = await findCustomerMailbox(
      adminWith({ ...connected, status: "pending" }),
      "ws1",
      "sender@example.com",
    );
    expect(row).toBeNull();
  });

  it("detects the paused state for the customer-facing message", async () => {
    await expect(
      isMailboxPaused(adminWith({ is_active: false }), "ws1", "sender@example.com"),
    ).resolves.toBe(true);
    await expect(
      isMailboxPaused(adminWith({ is_active: true }), "ws1", "sender@example.com"),
    ).resolves.toBe(false);
    expect(PAUSED_MAILBOX_MESSAGE).toBe(
      "This mailbox is paused. Reactivate it under Email Accounts to use it.",
    );
  });
});
