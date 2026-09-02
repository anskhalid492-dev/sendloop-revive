import { describe, expect, it } from "vitest";

import { buildSentSnapshot, sentCopyOf } from "@/lib/sent-snapshot";
import { ensureSentEmailMirrored } from "@/lib/inbox.server";

/** Minimal in-memory PostgREST-ish client: select/eq/maybeSingle + insert. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  function builder(table: string, filters: Record<string, unknown>) {
    const api = {
      select(columns: string) {
        // A column that does not exist in this deployment fails the whole read,
        // exactly like PostgREST does.
        const known = Object.keys(tables[table]?.[0] ?? {});
        const wanted = columns.split(",").map((c) => c.trim());
        if (known.length && wanted.some((c) => !known.includes(c))) {
          return { ...api, __broken: true } as never;
        }
        return api;
      },
      eq(column: string, value: unknown) {
        return builder(table, { ...filters, [column]: value });
      },
      async maybeSingle() {
        const row = (tables[table] ?? []).find((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v),
        );
        return { data: row ?? null, error: null };
      },
      insert(values: Record<string, unknown>) {
        const row = { id: `row-${(tables[table] ?? []).length + 1}`, ...values };
        tables[table] = [...(tables[table] ?? []), row];
        return {
          select: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        };
      },
    };
    return api;
  }
  return { from: (table: string) => builder(table, {}) };
}

const campaignTemplate = "Hi {{company}}, we make custom boxes.";

function campaignMessage(id: string, company: string, line: string) {
  return {
    id,
    subject: `Boxes for ${company}`,
    body: `Hi ${company},\n\n${line}`,
    to_email: `${id}@example.com`,
    sending_account_id: "acct-1",
    provider_message_id: `prov-${id}`,
    sent_at: "2026-09-02T10:00:00.000Z",
    final_subject: `Boxes for ${company}`,
    final_body: `Hi ${company},\n\n${line}`,
    final_html: `<p>${line}</p>`,
    final_from_email: "michael@example.com",
    final_from_name: "Michael",
    final_to_email: `${id}@example.com`,
    rendered_at: "2026-09-02T10:00:00.000Z",
  };
}

describe("final sent email snapshot", () => {
  it("captures the fully rendered per-recipient email", () => {
    const snapshot = buildSentSnapshot({
      subject: "Boxes for Papa Chuy's",
      body: "Hi Papa Chuy's, your logo on the box.",
      html: "<p>hi</p>",
      fromEmail: "michael@example.com",
      fromName: "Michael",
      toEmail: "jesus@example.com",
      renderedAt: "2026-09-02T10:00:00.000Z",
    });
    expect(snapshot.final_body).toContain("your logo on the box");
    expect(snapshot.final_to_email).toBe("jesus@example.com");
  });

  it("prefers the stored final render over the queue copy", () => {
    const copy = sentCopyOf({ subject: "generic", body: campaignTemplate, final_subject: "real", final_body: "personal line" });
    expect(copy).toMatchObject({ subject: "real", body: "personal line", exact: true });
  });

  it("falls back to the existing message content for older sends", () => {
    const copy = sentCopyOf({ subject: "old", body: "old body" });
    expect(copy).toMatchObject({ subject: "old", body: "old body", exact: false });
  });
});

describe("unified inbox shows the exact email per prospect", () => {
  it("mirrors two different personalizations of the same campaign", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      conversation_messages: [],
      campaign_messages: [
        campaignMessage("m1", "Papa Chuy's Bakery", "Your logo on the box people make reels about."),
        campaignMessage("m2", "Sunrise Donuts", "Low minimums so you never order 10,000 boxes."),
      ],
      sending_accounts: [{ id: "acct-1", from_email: "michael@example.com", from_name: "Michael" }],
    };
    const db = fakeDb(tables);

    await ensureSentEmailMirrored(db, {
      conversationId: "conv-1",
      workspaceId: "ws-1",
      campaignMessageId: "m1",
    });
    await ensureSentEmailMirrored(db, {
      conversationId: "conv-2",
      workspaceId: "ws-1",
      campaignMessageId: "m2",
    });

    const rows = tables.conversation_messages ?? [];
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.conversation_id === "conv-1");
    const second = rows.find((r) => r.conversation_id === "conv-2");
    expect(first?.body).toContain("reels");
    expect(first?.body).not.toContain("{{company}}");
    expect(second?.body).toContain("Low minimums");
    expect(first?.body).not.toEqual(second?.body);
  });

  it("never replaces a stored sent email when a reply arrives", async () => {
    const tables: Record<string, Record<string, unknown>[]> = {
      conversation_messages: [
        {
          id: "existing",
          workspace_id: "ws-1",
          conversation_id: "conv-1",
          campaign_message_id: "m1",
          direction: "outbound",
          body: "Hi Papa Chuy's Bakery,\n\nYour logo on the box.",
        },
      ],
      campaign_messages: [campaignMessage("m1", "Papa Chuy's Bakery", "different copy now")],
      sending_accounts: [{ id: "acct-1", from_email: "michael@example.com", from_name: "Michael" }],
    };
    const db = fakeDb(tables);

    const id = await ensureSentEmailMirrored(db, {
      conversationId: "conv-1",
      workspaceId: "ws-1",
      campaignMessageId: "m1",
    });

    expect(id).toBe("existing");
    expect(tables.conversation_messages).toHaveLength(1);
    expect(tables.conversation_messages?.[0]?.body).toContain("Your logo on the box.");
  });
});
