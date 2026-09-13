/**
 * Seeds throwaway data for the invitation UI check. Every record it creates is
 * named `invverify-*` and removed again by invite-cleanup.ts.
 */
import { createClient } from "@supabase/supabase-js";

const URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
const admin = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const TS = Date.now();
const PASS = `Iv!${crypto.randomUUID()}Aa9`;

function hex() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function user(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  const id = data.user!.id;
  await admin.from("profiles").upsert({ id, email, full_name: name });
  return id;
}

const owner = `invverify-owner-${TS}@example.com`;
const invitee = `invverify-invitee-${TS}@example.com`;
const other = `invverify-other-${TS}@example.com`;

const ownerId = await user(owner, "Verify Owner");
const inviteeId = await user(invitee, "Verify Invitee");
const otherId = await user(other, "Verify Other");

const { data: ws, error } = await admin
  .from("workspaces")
  .insert({ name: `invverify-ws-${TS}`, slug: `invverify-ws-${TS}`, owner_id: ownerId })
  .select("id, name")
  .single();
if (error) throw error;
await admin
  .from("workspace_members")
  .upsert({ workspace_id: ws.id, user_id: ownerId, role: "owner" });

async function invitation(email: string, extra: Record<string, unknown> = {}) {
  const token = hex();
  const { error: e } = await admin.from("workspace_invitations").insert({
    workspace_id: ws.id,
    email,
    role: "admin",
    token,
    invited_by: ownerId,
    message: "Join us on MunchReach",
    ...extra,
  });
  if (e) throw e;
  return token;
}

const out = {
  ts: TS,
  password: PASS,
  workspaceId: ws.id,
  workspaceName: ws.name,
  ownerId,
  inviteeId,
  otherId,
  emails: { owner, invitee, other },
  pendingToken: await invitation(invitee),
  secondToken: await invitation(invitee),
  expiredToken: await invitation(invitee, {
    expires_at: new Date(Date.now() - 86_400_000).toISOString(),
  }),
  revokedToken: await invitation(invitee, { status: "revoked" }),
  invalidToken: hex(),
};

await Bun.write("/tmp/browser/invite/seed.json", JSON.stringify(out, null, 2));
console.log("seeded", out.workspaceName);
