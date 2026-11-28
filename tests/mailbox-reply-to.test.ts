import { describe, expect, it, vi } from "vitest";
import { mailboxReplyToSchema, replyToAccountScope, withMailboxReplyTo } from "@/lib/mailbox-reply-to";
import { buildGraphMessage } from "@/lib/microsoft-graph.server";

describe("per-mailbox Reply-To — offline throwaway fixtures", () => {
  it("accepts one address and normalizes it", () => {
    expect(mailboxReplyToSchema.parse("  MAIN@example.test  ")).toBe("main@example.test");
  });
  it("allows clearing the optional setting", () => {
    expect(mailboxReplyToSchema.parse(" ")).toBe("");
    const headers = { "Reply-To": "sender@example.test", "X-Test": "fixture" };
    expect(withMailboxReplyTo(headers, null)).toBe(headers);
  });
  it.each(["broken", "a@example.test,b@example.test", "Name <a@example.test>", "a@example.test\r\nBcc: other@example.test"])("rejects non-single addresses: %s", value => {
    expect(mailboxReplyToSchema.safeParse(value).success).toBe(false);
  });
  it("replaces every case variant without changing threading headers", () => {
    expect(withMailboxReplyTo({ "reply-to": "sender@example.test", "In-Reply-To": "<send@example.test>" }, "main@example.test"))
      .toEqual({ "Reply-To": "main@example.test", "In-Reply-To": "<send@example.test>" });
  });
  it("sets Microsoft's native replyTo rather than an unsupported standard custom header", () => {
    const result = buildGraphMessage({ from: "sender@example.test", to: "lead@example.test", subject: "fixture", headers: { "Reply-To": "main@example.test" } }, "throwaway-key");
    expect(result.message.replyTo).toEqual([{ emailAddress: { address: "main@example.test" } }]);
    expect(result.message.internetMessageHeaders.some(header => header.name === "Reply-To")).toBe(false);
  });
  it("keeps the Graph default unchanged when Reply-To is blank", () => {
    expect(buildGraphMessage({ from: "sender@example.test", to: "lead@example.test", subject: "fixture" }, "throwaway-key").message.replyTo).toBeUndefined();
  });
  it("adds only configured accounts in the receiving workspace", async () => {
    const filters: Record<string, string> = {};
    const chain = { select: () => chain, eq: (key: string, value: string) => { filters[key] = value; return chain; }, then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: "throwaway-sender" }], error: null }) };
    expect(await replyToAccountScope({ from: () => chain }, "throwaway-workspace", "throwaway-main", "MAIN@example.test"))
      .toEqual(["throwaway-main", "throwaway-sender"]);
    expect(filters).toEqual({ workspace_id: "throwaway-workspace", reply_to: "main@example.test" });
  });
  it("never broadens the account scope without a workspace", async () => {
    const from = vi.fn();
    expect(await replyToAccountScope({ from }, null, "throwaway-main", "main@example.test")).toEqual(["throwaway-main"]);
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed on a settings-read error", async () => {
    const chain = { select: () => chain, eq: () => chain, then: (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: "wrong" }], error: { message: "offline failure" } }) };
    expect(await replyToAccountScope({ from: () => chain }, "throwaway-workspace", "throwaway-main", "main@example.test")).toEqual(["throwaway-main"]);
  });
});