/** Verifies invitation state, then deletes every invverify-* throwaway record. */
import { createClient } from "@supabase/supabase-js";

const URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
const admin = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const seed = JSON.parse(await Bun.file("/tmp/browser/invite/seed.json").text());

const { data: members } = await admin
  .from("workspace_members")
  .select("user_id, role")
  .eq("workspace_id", seed.workspaceId);
const { data: invites } = await admin
  .from("workspace_invitations")
  .select("token, status, accepted_by")
  .eq("workspace_id", seed.workspaceId);

console.log("members:", JSON.stringify(members));
const inviteeRows = (members ?? []).filter((m: any) => m.user_id === seed.inviteeId);
console.log(
  inviteeRows.length === 1 && inviteeRows[0].role === "admin"
    ? "PASS  exactly one invitee membership with the invited role"
    : `FAIL  invitee memberships: ${JSON.stringify(inviteeRows)}`,
);
console.log(
  (members ?? []).some((m: any) => m.user_id === seed.otherId)
    ? "FAIL  wrong account was added to the workspace"
    : "PASS  wrong account never joined the workspace",
);
const pending = (invites ?? []).find((i: any) => i.token === seed.pendingToken);
console.log(
  pending?.status === "accepted" && pending?.accepted_by === seed.inviteeId
    ? "PASS  invitation marked accepted by the invited user"
    : `FAIL  invitation row: ${JSON.stringify(pending)}`,
);

if (process.env["KEEP"] !== "1") {
  await admin.from("workspaces").delete().eq("id", seed.workspaceId);
  for (const id of [seed.ownerId, seed.inviteeId, seed.otherId]) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
  const { count: wsLeft } = await admin
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .like("name", "invverify-%");
  const { data: usersLeft } = await admin.auth.admin.listUsers({ perPage: 200 });
  const stray = (usersLeft?.users ?? []).filter((u) => (u.email ?? "").startsWith("invverify-"));
  console.log(`cleanup: workspaces left=${wsLeft}, accounts left=${stray.length}`);
}
