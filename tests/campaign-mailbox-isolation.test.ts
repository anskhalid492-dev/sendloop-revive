import { describe, expect, it } from "vitest";
import { selectCampaignMailboxes, loadCampaignWorkspaceAccounts } from "@/lib/campaign-mailboxes";

const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const mb = (id: string, ws: string, extra: Record<string, unknown> = {}) => ({
  id, workspace_id: ws, status: "verified", paused: false, customer_enabled: true, ...extra,
});
const rows = [
  mb("a1", A), mb("a2", A), mb("a3", A, { status: "disconnected" }), mb("a4", A, { customer_enabled: false }),
  mb("a5", A, { paused: true }), mb("b1", B), mb("b2", B), mb("b3", B),
];

describe("campaign mailbox isolation", () => {
  it("workspace A never sees workspace B mailboxes and only eligible ones", () => {
    expect(selectCampaignMailboxes(rows, A).map((r) => r.id)).toEqual(["a1", "a2"]);
  });
  it("workspace B sees only its own", () => {
    expect(selectCampaignMailboxes(rows, B).map((r) => r.id)).toEqual(["b1", "b2", "b3"]);
  });

  function fakeClient(opts: { member: boolean; campaignWs: string | null }) {
    const filters: Array<[string, unknown]> = [];
    const q: any = {
      select: () => q, order: () => q, not: () => q,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
      maybeSingle: async () => ({ data: opts.campaignWs ? { workspace_id: opts.campaignWs } : null, error: null }),
      then: (res: any) => res({ data: rows.filter((r) => filters.every(([c, v]) => c === "id" || (r as any)[c] === v)), error: null }),
    };
    return { filters, client: { from: () => { filters.length = 0; return q; }, rpc: async () => ({ data: opts.member, error: null }) } };
  }

  it("denies a non-member (including platform admins) of the campaign workspace", async () => {
    const { client } = fakeClient({ member: false, campaignWs: B });
    await expect(loadCampaignWorkspaceAccounts(client, "c", "userA")).rejects.toThrow(/access/);
  });
  it("denies an unknown/other-tenant campaign id", async () => {
    const { client } = fakeClient({ member: true, campaignWs: null });
    await expect(loadCampaignWorkspaceAccounts(client, "c", "userA")).rejects.toThrow(/not found/);
  });
  it("queries by the campaign workspace server-side", async () => {
    const { client } = fakeClient({ member: true, campaignWs: A });
    const res = await loadCampaignWorkspaceAccounts(client, "c", "userA");
    expect(res.accounts.map((a: any) => a.id)).toEqual(["a1", "a2"]);
  });
});
