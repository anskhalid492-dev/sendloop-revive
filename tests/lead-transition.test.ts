/**
 * The one lead status / CRM stage transition service.
 *
 * These tests drive `applyLeadTransition` against an in-memory stand-in for the
 * database so every rule is checked: the pipeline stage really moves, the
 * timeline records old → new, closed outcomes stop queued follow-ups, other
 * workspaces are refused and repeated calls stay idempotent.
 */
import { describe, expect, it, vi } from "vitest";

// Automation events use the real server client; never let fixture IDs reach it.
vi.mock("@/lib/automation-engine.server", () => ({ emitAutomationEvent: vi.fn(async () => ({ runs: 0 })) }));

import { applyLeadTransition } from "@/lib/lead-transition.server";
import {
  LEAD_STATUS_FOR_STAGE_KEY,
  STAGE_KEY_FOR_LEAD_STATUS,
  TRANSITION_FOR_CONVERSATION_STATUS,
} from "@/lib/lead-stage-map";

type Row = Record<string, unknown>;

function makeDb() {
  const tables: Record<string, Row[]> = {
    leads: [
      {
        id: "lead-1",
        workspace_id: "ws-1",
        status: "replied",
        stage_id: "stage-replied",
        crm_stage: "engaged",
      },
    ],
    crm_stages: [
      { id: "stage-new", key: "new", name: "New", workspace_id: "ws-1", is_won: false, is_lost: false },
      { id: "stage-replied", key: "replied", name: "Replied", workspace_id: "ws-1", is_won: false, is_lost: false },
      { id: "stage-meeting", key: "meeting_booked", name: "Meeting booked", workspace_id: "ws-1", is_won: false, is_lost: false },
      { id: "stage-won", key: "won", name: "Won", workspace_id: "ws-1", is_won: true, is_lost: false },
      { id: "stage-lost", key: "lost", name: "Lost", workspace_id: "ws-1", is_won: false, is_lost: true },
      { id: "other-won", key: "won", name: "Won", workspace_id: "ws-2", is_won: true, is_lost: false },
    ],
    lead_activities: [],
    campaign_messages: [
      { id: "m1", lead_id: "lead-1", status: "pending" },
      { id: "m2", lead_id: "lead-1", status: "sent" },
    ],
    campaign_recipients: [{ id: "r1", lead_id: "lead-1", status: "in_progress", next_send_at: "x" }],
    campaign_replies: [{ id: "rep1", lead_id: "lead-1", sentiment: "neutral" }],
  };

  const client = {
    rpc: async () => ({ data: null, error: null }),
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      const filters: Array<(row: Row) => boolean> = [];
      const api: Record<string, unknown> = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return api;
        },
        neq(column: string, value: unknown) {
          filters.push((row) => row[column] !== value);
          return api;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return api;
        },
        // Lazy, like PostgREST: the patch only lands once every filter in the
        // chain has been applied.
        update(patch: Row) {
          const apply = () => {
            const matched = rows.filter((row) => filters.every((f) => f(row)));
            matched.forEach((row) => Object.assign(row, patch));
            return matched;
          };
          const updater: Record<string, unknown> = {
            eq(column: string, value: unknown) {
              filters.push((row) => row[column] === value);
              return updater;
            },
            neq(column: string, value: unknown) {
              filters.push((row) => row[column] !== value);
              return updater;
            },
            in(column: string, values: unknown[]) {
              filters.push((row) => values.includes(row[column]));
              return updater;
            },
            select: () => ({
              maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
              single: async () => ({ data: apply()[0] ?? null, error: null }),
            }),
            then: (resolve: (v: unknown) => void) => resolve({ data: apply(), error: null }),
          };
          return updater;
        },
        insert(row: Row | Row[]) {
          (Array.isArray(row) ? row : [row]).forEach((r) => rows.push({ ...r }));
          return Promise.resolve({ data: null, error: null });
        },
        async maybeSingle() {
          const found = rows.find((row) => filters.every((f) => f(row)));
          return { data: found ?? null, error: null };
        },
        then(resolve: (v: unknown) => void) {
          resolve({ data: rows.filter((row) => filters.every((f) => f(row))), error: null });
        },
      };
      return api;
    },
  };

  return { tables, client };
}

describe("lead status / CRM stage mapping", () => {
  it("maps the inbox Won action onto the real Won stage", () => {
    expect(TRANSITION_FOR_CONVERSATION_STATUS["won"]).toEqual({
      status: "completed",
      stageKey: "won",
    });
    expect(STAGE_KEY_FOR_LEAD_STATUS["completed"]).toBe("won");
    expect(LEAD_STATUS_FOR_STAGE_KEY["won"]).toBe("completed");
  });

  it("does not move the pipeline for inbox-only facts", () => {
    expect(TRANSITION_FOR_CONVERSATION_STATUS["ooo"]?.stageKey).toBeUndefined();
    expect(TRANSITION_FOR_CONVERSATION_STATUS["unsubscribed"]?.stageKey).toBeUndefined();
    expect(TRANSITION_FOR_CONVERSATION_STATUS["bounced"]?.stageKey).toBeUndefined();
    expect(STAGE_KEY_FOR_LEAD_STATUS["bounced"]).toBeUndefined();
  });
});

describe("applyLeadTransition", () => {
  it("Unified Inbox Lead → Won moves the stage, status and legacy mirror", async () => {
    const { tables, client } = makeDb();
    const result = await applyLeadTransition(client, {
      leadId: "lead-1",
      status: "completed",
      stageKey: "won",
      source: "inbox",
      actorId: "user-1",
    });

    expect(result.changed).toBe(true);
    expect(result.stageId).toBe("stage-won");
    const lead = tables["leads"]![0]!;
    expect(lead["status"]).toBe("completed");
    expect(lead["stage_id"]).toBe("stage-won");
    expect(lead["crm_stage"]).toBe("customer");
  });

  it("records old → new values on the timeline exactly once per change", async () => {
    const { tables, client } = makeDb();
    await applyLeadTransition(client, {
      leadId: "lead-1",
      status: "completed",
      stageKey: "won",
      source: "inbox",
      actorId: "user-1",
    });
    const activities = tables["lead_activities"]!;
    expect(activities).toHaveLength(2);
    const status = activities.find((a) => a["type"] === "status_changed")!;
    expect(String(status["detail"])).toContain("from replied to completed");
    expect(status["actor_id"]).toBe("user-1");
    const stage = activities.find((a) => a["type"] === "stage_changed")!;
    expect(String(stage["detail"])).toContain("from Replied to Won");
  });

  it("stops queued follow-ups on a closed outcome but keeps history", async () => {
    const { tables, client } = makeDb();
    await applyLeadTransition(client, { leadId: "lead-1", stageKey: "lost", source: "crm_board" });
    const messages = tables["campaign_messages"]!;
    expect(messages.find((m) => m["id"] === "m1")!["status"]).toBe("cancelled");
    expect(messages.find((m) => m["id"] === "m2")!["status"]).toBe("sent");
    expect(tables["campaign_recipients"]![0]!["status"]).toBe("stopped");
    expect(tables["leads"]![0]!["status"]).toBe("not_interested");
  });

  it("derives the status from the stage on a board move", async () => {
    const { client, tables } = makeDb();
    const result = await applyLeadTransition(client, {
      leadId: "lead-1",
      stageId: "stage-meeting",
      source: "crm_board",
    });
    expect(result.status).toBe("meeting");
    expect(tables["leads"]![0]!["stage_id"]).toBe("stage-meeting");
  });

  it("refuses a stage from another workspace", async () => {
    const { client } = makeDb();
    await expect(
      applyLeadTransition(client, { leadId: "lead-1", stageId: "other-won", source: "crm_board" }),
    ).rejects.toThrow(/another workspace/);
  });

  it("fails loudly for a contact that does not exist", async () => {
    const { client } = makeDb();
    await expect(
      applyLeadTransition(client, { leadId: "nope", stageKey: "won", source: "inbox" }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("is idempotent: repeating the same change writes nothing new", async () => {
    const { tables, client } = makeDb();
    await applyLeadTransition(client, { leadId: "lead-1", stageKey: "won", source: "inbox" });
    const after = tables["lead_activities"]!.length;
    const second = await applyLeadTransition(client, {
      leadId: "lead-1",
      stageKey: "won",
      source: "inbox",
    });
    expect(second.changed).toBe(false);
    expect(tables["lead_activities"]!.length).toBe(after);
  });

  it("moving Won → Replied brings the contact back into the open pipeline", async () => {
    const { tables, client } = makeDb();
    await applyLeadTransition(client, { leadId: "lead-1", stageKey: "won", source: "inbox" });
    await applyLeadTransition(client, { leadId: "lead-1", stageKey: "replied", source: "inbox" });
    expect(tables["leads"]![0]!["stage_id"]).toBe("stage-replied");
    expect(tables["leads"]![0]!["status"]).toBe("replied");
  });
});
