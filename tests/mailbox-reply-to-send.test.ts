import { beforeEach, describe, expect, it, vi } from "vitest";
const relay = vi.hoisted(() => vi.fn(async () => ({ ok: true, message: "Offline fixture accepted", messageId: "throwaway-send@example.test" })));
vi.mock("@/lib/mailbox-relay.server", () => ({ relaySendMail: relay }));
import { findCustomerMailbox, sendViaCustomerMailbox } from "@/lib/customer-mailbox-send.server";

const mailbox = { id: "throwaway-sender", email_address: "sender@example.test", display_name: "Fixture", smtp_host: "smtp.example.test", smtp_port: 587,
  smtp_secure: false, smtp_username: "sender@example.test", smtp_password: "offline-ref", status: "connected", is_active: true };
const message = { to: "lead@example.test", subject: "Offline fixture", text: "Fixture", headers: { "Reply-To": "sender@example.test", "In-Reply-To": "<parent@example.test>" } };
function admin(replyTo: string | null) {
  return {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      const chain = { select: () => chain, eq: (key: string, value: string) => { filters[key] = value; return chain; }, maybeSingle: async () => {
        expect(filters["workspace_id"]).toBe("throwaway-workspace");
        expect(filters[table === "mailboxes" ? "email_address" : "from_email"]).toBe("sender@example.test");
        return { data: table === "mailboxes" ? { ...mailbox } : { reply_to: replyTo }, error: null };
      } };
      return chain;
    },
    rpc: vi.fn(async () => ({ data: "offline-password", error: null })),
  };
}
beforeEach(() => relay.mockClear());
describe("Reply-To SMTP transport — no real network", () => {
  it("loads the saved address in the sender workspace and passes it to SMTP", async () => {
    const db = admin("main@example.test");
    const row = await findCustomerMailbox(db, "throwaway-workspace", "sender@example.test");
    if (!row) throw new Error("Fixture mailbox missing");
    expect((await sendViaCustomerMailbox(db, row, message)).ok).toBe(true);
    expect(relay).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ from: "sender@example.test", headers: { "Reply-To": "main@example.test", "In-Reply-To": "<parent@example.test>" } }), undefined);
  });
  it("blank retains the existing sender Reply-To", async () => {
    const db = admin(null);
    const row = await findCustomerMailbox(db, "throwaway-workspace", "sender@example.test");
    if (!row) throw new Error("Fixture mailbox missing");
    await sendViaCustomerMailbox(db, row, message);
    expect(relay).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers: message.headers }), undefined);
  });
  it("does not redirect warmup to the custom campaign address", async () => {
    const db = admin("main@example.test");
    const row = await findCustomerMailbox(db, "throwaway-workspace", "sender@example.test");
    if (!row) throw new Error("Fixture mailbox missing");
    const headers = { "Reply-To": "sender@example.test", "X-MunchReach-Warmup": "1" };
    await sendViaCustomerMailbox(db, row, { ...message, headers });
    expect(relay).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ headers }), undefined);
  });
});