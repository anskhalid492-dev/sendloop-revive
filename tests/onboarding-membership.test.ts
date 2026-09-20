import { describe, expect, it } from "vitest";

import {
  ensureOwnerMembership,
  type MembershipClient,
  type MembershipError,
} from "@/lib/workspace-onboarding";

type Row = { id: string; workspace_id: string; user_id: string; role: string };

/**
 * In-memory stand-in for `workspace_members` that enforces the production RLS
 * policies (`members_insert_admin` WITH CHECK, `members_update_admin` USING
 * which refuses owner rows, `members_select_same_workspace`) plus the unique
 * (workspace_id, user_id) key and the `ensure_workspace_owner_member` trigger.
 */
class FakeDb {
  rows: Row[] = [];
  statements: string[] = [];
  private seq = 0;

  constructor(
    /** workspace id → owner user id */
    readonly workspaces: Record<string, string>,
  ) {}

  /** Mirrors the AFTER INSERT trigger on public.workspaces. */
  seedOwnerMembership(workspaceId: string) {
    this.rows.push({
      id: `m${++this.seq}`,
      workspace_id: workspaceId,
      user_id: this.workspaces[workspaceId]!,
      role: "owner",
    });
  }

  client(authUid: string | null): MembershipClient {
    const db = this;
    return {
      from() {
        return {
          select() {
            return {
              eq(_c1: string, workspaceId: string) {
                return {
                  eq(_c2: string, userId: string) {
                    return {
                      async maybeSingle() {
                        db.statements.push("select");
                        if (!authUid) {
                          return { data: null, error: { message: "JWT missing" } as MembershipError };
                        }
                        const row = db.rows.find(
                          (r) =>
                            r.workspace_id === workspaceId &&
                            r.user_id === userId &&
                            // members_select_same_workspace
                            (r.user_id === authUid ||
                              db.rows.some(
                                (m) => m.workspace_id === r.workspace_id && m.user_id === authUid,
                              )),
                        );
                        return { data: row ? { id: row.id, role: row.role } : null, error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          async insert(row: Record<string, unknown>) {
            db.statements.push("insert");
            if (!authUid) {
              return {
                error: {
                  message: 'permission denied for table workspace_members',
                } as MembershipError,
              };
            }
            const workspaceId = String(row["workspace_id"]);
            const userId = String(row["user_id"]);
            // members_insert_admin: own row, in a workspace you own.
            if (userId !== authUid || db.workspaces[workspaceId] !== authUid) {
              return {
                error: {
                  message: "new row violates row-level security policy for table workspace_members",
                } as MembershipError,
              };
            }
            if (db.rows.some((r) => r.workspace_id === workspaceId && r.user_id === userId)) {
              return {
                error: {
                  code: "23505",
                  message: "duplicate key value violates unique constraint",
                } as MembershipError,
              };
            }
            db.rows.push({
              id: `m${++db.seq}`,
              workspace_id: workspaceId,
              user_id: userId,
              role: String(row["role"] ?? "member"),
            });
            return { error: null };
          },
        };
      },
    } as unknown as MembershipClient;
  }
}

describe("onboarding owner membership", () => {
  it("newly signed-up user completes onboarding and reuses the trigger-created row", async () => {
    const db = new FakeDb({ w1: "u1" });
    db.seedOwnerMembership("w1");

    const result = await ensureOwnerMembership(db.client("u1"), "w1", "u1");

    expect(result.created).toBe(false);
    expect(result.membershipId).toBe("m1");
    expect(db.rows).toHaveLength(1);
    // The old upsert issued an UPDATE against an owner row, which is what RLS
    // rejected. No write may happen on this path.
    expect(db.statements).toEqual(["select"]);
  });

  it("creates the membership when no trigger seeded one", async () => {
    const db = new FakeDb({ w1: "u1" });

    const result = await ensureOwnerMembership(db.client("u1"), "w1", "u1");

    expect(result.created).toBe(true);
    expect(db.rows).toEqual([
      { id: "m1", workspace_id: "w1", user_id: "u1", role: "owner" },
    ]);
  });

  it("refusing arbitrary workspaces: a user cannot insert into a workspace they do not own", async () => {
    const db = new FakeDb({ w1: "u1", w2: "u2" });
    db.seedOwnerMembership("w2");

    await expect(ensureOwnerMembership(db.client("u1"), "w2", "u1")).rejects.toThrow(
      /row-level security/i,
    );
    expect(db.rows).toHaveLength(1);
  });

  it("cannot create a membership for another user", async () => {
    const db = new FakeDb({ w1: "u1" });

    await expect(ensureOwnerMembership(db.client("u1"), "w1", "u2")).rejects.toThrow(
      /row-level security/i,
    );
    expect(db.rows).toHaveLength(0);
  });

  it("an existing member of the workspace keeps working", async () => {
    const db = new FakeDb({ w1: "u1" });
    db.seedOwnerMembership("w1");
    db.rows.push({ id: "mx", workspace_id: "w1", user_id: "u9", role: "member" });

    const result = await ensureOwnerMembership(db.client("u1"), "w1", "u1");
    expect(result.created).toBe(false);
    expect(db.rows.find((r) => r.user_id === "u9")?.role).toBe("member");
  });

  it("duplicate onboarding submissions do not create duplicate memberships", async () => {
    const db = new FakeDb({ w1: "u1" });

    const first = await ensureOwnerMembership(db.client("u1"), "w1", "u1");
    const second = await ensureOwnerMembership(db.client("u1"), "w1", "u1");
    const third = await ensureOwnerMembership(db.client("u1"), "w1", "u1");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it("a concurrent insert that loses the unique key resolves to the existing row", async () => {
    const db = new FakeDb({ w1: "u1" });
    const client = db.client("u1");
    // Row appears between the read and the insert (the other Finish click won).
    const racy: MembershipClient = {
      from(table) {
        const real = client.from(table);
        return {
          select: (cols: string) => {
            if (db.rows.length === 0) {
              return {
                eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              };
            }
            return real.select(cols);
          },
          insert: async (row: Record<string, unknown>) => {
            if (db.rows.length === 0) db.seedOwnerMembership("w1");
            return real.insert(row);
          },
        };
      },
    } as unknown as MembershipClient;

    const result = await ensureOwnerMembership(racy, "w1", "u1");
    expect(result.created).toBe(false);
    expect(db.rows).toHaveLength(1);
  });

  it("an unauthenticated caller cannot create a workspace membership", async () => {
    const db = new FakeDb({ w1: "u1" });

    await expect(ensureOwnerMembership(db.client(null), "w1", "u1")).rejects.toThrow(/JWT missing/);
    expect(db.rows).toHaveLength(0);
  });
});
