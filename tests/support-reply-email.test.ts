import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyAdminSupportReply } from "@/lib/admin-support.functions";
import type { EmitInput } from "@/lib/transactional-events.server";

const ticket = {
  id: "11111111-1111-1111-1111-111111111111",
  subject: "Microsoft mailbox connection",
  created_by: "22222222-2222-2222-2222-222222222222",
  workspace_id: "33333333-3333-3333-3333-333333333333",
  contact_email: "guest@example.invalid",
  ticket_ref: null,
};

const message = {
  id: "44444444-4444-4444-4444-444444444444",
  body: "Hi Christopher,\n\nConnect Microsoft now opens Microsoft's secure sign-in page.",
};

afterEach(() => vi.restoreAllMocks());

describe("Admin support reply customer email", () => {
  it("emails a public reply to the registered ticket owner with the exact reply text", async () => {
    const emit = vi.fn(async (_input: EmitInput) => {});

    await notifyAdminSupportReply(ticket, message, false, emit);

    expect(emit).toHaveBeenCalledExactlyOnceWith({
      eventKey: "support.ticket.replied",
      userId: "22222222-2222-2222-2222-222222222222",
      to: null,
      workspaceId: "33333333-3333-3333-3333-333333333333",
      idempotencyKey: "support.replied:44444444-4444-4444-4444-444444444444",
      immediate: true,
      variables: {
        "ticket.subject": "Microsoft mailbox connection",
        "ticket.reference": "SL-11111111",
        "ticket.message": message.body,
      },
    });
  });

  it("uses the stored contact address only for a guest ticket", async () => {
    const emit = vi.fn(async (_input: EmitInput) => {});

    await notifyAdminSupportReply(
      { ...ticket, created_by: null, contact_email: "Guest@Example.invalid" },
      message,
      false,
      emit,
    );

    expect(emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ userId: null, to: "Guest@Example.invalid" }),
    );
  });

  it("preserves an existing ticket reference and deduplicates by message ID", async () => {
    const emit = vi.fn(async (_input: EmitInput) => {});

    await notifyAdminSupportReply({ ...ticket, ticket_ref: "MATE-12345" }, message, false, emit);
    await notifyAdminSupportReply({ ...ticket, ticket_ref: "MATE-12345" }, message, false, emit);

    for (const call of emit.mock.calls) {
      expect(call[0].variables?.["ticket.reference"]).toBe("MATE-12345");
      expect(call[0].idempotencyKey).toBe(`support.replied:${message.id}`);
    }
  });

  it("never emails private internal notes", async () => {
    const emit = vi.fn(async (_input: EmitInput) => {});

    await notifyAdminSupportReply(ticket, message, true, emit);

    expect(emit).not.toHaveBeenCalled();
  });

  it("does not fail or repeat the saved reply when email dispatch errors", async () => {
    const emit = vi.fn(async (_input: EmitInput) => {
      throw new Error("isolated dispatch failure");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyAdminSupportReply(ticket, message, false, emit)).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledOnce();
  });
});
