/**
 * Throwaway-account verification of the workspace invitation flow.
 * Creates ONLY accounts prefixed `invverify-` and deletes everything at the end.
 */
import { createClient } from "@supabase/supabase-js";

const URL = "https://rihgzkofoxcjljlbvbya.supabase.co";
const KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const TS = Date.now();
const OWNER = `invverify-owner-${TS}@example.com`;
const INVITEE = `invverify-invitee-${TS}@example.com`;
const OTHER = `invverify-other-${TS}@example.com`;
const PASS = `Iv!${crypto.randomUUID()}Aa9`;

const created: { users: string[]; workspaces: string[] } = { users: [], workspaces: [] };

async function makeUser(email: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASS,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) throw error;
  const id = data.user!.id;
  created.users.push(id);
  await admin.from("profiles").upsert({ id, email, full_name: name });
  return id;
}

function token() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function invite(
  workspaceId: string,
  ownerId: string,
  email: string,
  extra: Record<string, unknown> = {},
) {
  const t = token();
  const { error } = await admin.from("workspace_invitations").insert({
    workspace_id: workspaceId,
    email,
    role: "admin",
    token: t,
    invited_by: ownerId,
    message: "Join us on MunchReach",
    ...extra,
  });
  if (error) throw error;
  return t;
}

/** Server-fn call over HTTP, exactly like the browser does. */
async function serverFn(name: string, payload: unknown, bearer?: string) {
  const res = await fetch(`http://localhost:8080/_serverFn/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:8080",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body };
}

async function signIn(email: string) {
  const anon = createClient(URL, "sb_publishable_gTF0GOqvRfQ7f_ED446AVg_DV0rNQ8o", {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASS });
  if (error) throw error;
  return data.session!.access_token;
}

const results: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const ownerId = await makeUser(OWNER, "Verify Owner");
  const inviteeId = await makeUser(INVITEE, "Verify Invitee");
  await makeUser(OTHER, "Verify Other");

  const { data: ws, error: wsErr } = await admin
    .from("workspaces")
    .insert({ name: `invverify-ws-${TS}`, slug: `invverify-ws-${TS}`, owner_id: ownerId })
    .select("id")
    .single();
  if (wsErr) throw wsErr;
  const workspaceId = ws.id as string;
  created.workspaces.push(workspaceId);
  await admin
    .from("workspace_members")
    .upsert({ workspace_id: workspaceId, user_id: ownerId, role: "owner" });

  // ---- preview (unauthenticated) ----
  const pendingToken = await invite(workspaceId, ownerId, INVITEE);
  const prev = await serverFn("getInvitationPreview_createServerFn_handler", {
    data: { token: pendingToken },
  });
  const p = (prev.body as { result?: Record<string, unknown> })?.result ?? prev.body;
  check(
    "preview works without login and shows workspace/email/role/inviter",
    (p as Record<string, unknown>)?.["state"] === "pending" &&
      (p as Record<string, unknown>)?.["workspaceName"] === `invverify-ws-${TS}` &&
      (p as Record<string, unknown>)?.["email"] === INVITEE &&
      (p as Record<string, unknown>)?.["role"] === "admin" &&
      (p as Record<string, unknown>)?.["inviterName"] === "Verify Owner",
    JSON.stringify(p),
  );
  check(
    "preview never exposes workspace id or token",
    !JSON.stringify(p).includes(workspaceId) && !JSON.stringify(p).includes(pendingToken),
  );

  const bad = await serverFn("getInvitationPreview_createServerFn_handler", {
    data: { token: token() },
  });
  const bp = ((bad.body as { result?: Record<string, unknown> })?.result ?? bad.body) as Record<
    string,
    unknown
  >;
  check("invalid token → invalid state", bp?.["state"] === "invalid", JSON.stringify(bp));

  // expired + revoked previews
  const expiredToken = await invite(workspaceId, ownerId, INVITEE, {
    expires_at: new Date(Date.now() - 86400_000).toISOString(),
  });
  const revokedToken = await invite(workspaceId, ownerId, INVITEE, { status: "revoked" });
  for (const [label, t, expected] of [
    ["expired", expiredToken, "expired"],
    ["revoked", revokedToken, "revoked"],
  ] as const) {
    const r = await serverFn("getInvitationPreview_createServerFn_handler", { data: { token: t } });
    const rb = ((r.body as { result?: Record<string, unknown> })?.result ?? r.body) as Record<
      string,
      unknown
    >;
    check(`${label} invitation → ${expected} state`, rb?.["state"] === expected, JSON.stringify(rb));
  }

  // ---- accept with the wrong account ----
  const otherJwt = await signIn(OTHER);
  const wrong = await serverFn(
    "acceptInvitationByToken_createServerFn_handler",
    { data: { token: pendingToken } },
    otherJwt,
  );
  const wrongText = JSON.stringify(wrong.body);
  const { count: wrongMembers } = await admin
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  check(
    "wrong account is blocked and never joins",
    wrongText.includes("was sent to") && wrongMembers === 1,
    `members=${wrongMembers}`,
  );

  // ---- accept with the invited account, twice concurrently ----
  const jwt = await signIn(INVITEE);
  const [a, b] = await Promise.all([
    serverFn("acceptInvitationByToken_createServerFn_handler", { data: { token: pendingToken } }, jwt),
    serverFn("acceptInvitationByToken_createServerFn_handler", { data: { token: pendingToken } }, jwt),
  ]);
  const { data: members } = await admin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", inviteeId);
  check(
    "accept creates exactly one membership with the invitation role",
    members?.length === 1 && members[0]!.role === "admin",
    JSON.stringify(members),
  );
  check(
    "double accept is idempotent (no error state, no duplicates)",
    a.status === 200 && b.status === 200,
    `${a.status}/${b.status} ${JSON.stringify(a.body)} ${JSON.stringify(b.body)}`,
  );

  const { data: inv } = await admin
    .from("workspace_invitations")
    .select("status, accepted_by")
    .eq("token", pendingToken)
    .maybeSingle();
  check(
    "invitation marked accepted by the right user",
    inv?.status === "accepted" && inv?.accepted_by === inviteeId,
    JSON.stringify(inv),
  );

  // already-accepted preview
  const done = await serverFn("getInvitationPreview_createServerFn_handler", {
    data: { token: pendingToken },
  });
  const db = ((done.body as { result?: Record<string, unknown> })?.result ?? done.body) as Record<
    string,
    unknown
  >;
  check("already accepted → accepted state", db?.["state"] === "accepted", JSON.stringify(db));

  // expired accept attempt by the right user
  const expiredAccept = await serverFn(
    "acceptInvitationByToken_createServerFn_handler",
    { data: { token: expiredToken } },
    jwt,
  );
  check(
    "expired invitation cannot be accepted",
    JSON.stringify(expiredAccept.body).toLowerCase().includes("expired"),
    JSON.stringify(expiredAccept.body),
  );

  // resend (new token) then accept again → still one membership
  const fresh = await invite(workspaceId, ownerId, INVITEE);
  const again = await serverFn(
    "acceptInvitationByToken_createServerFn_handler",
    { data: { token: fresh } },
    jwt,
  );
  const { count: finalCount } = await admin
    .from("workspace_members")
    .select("user_id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  check(
    "re-invite of an existing member resolves cleanly, no duplicate rows",
    again.status === 200 && finalCount === 2,
    `members=${finalCount} ${JSON.stringify(again.body)}`,
  );

  // unauthenticated accept must fail
  const anonAccept = await serverFn("acceptInvitationByToken_createServerFn_handler", {
    data: { token: fresh },
  });
  check(
    "accept without a session is rejected",
    anonAccept.status >= 400,
    `status=${anonAccept.status}`,
  );
}

main()
  .then(() => console.log(results.join("\n")))
  .catch((e) => {
    console.error("ERROR", e);
    console.log(results.join("\n"));
  })
  .finally(async () => {
    for (const id of created.workspaces) await admin.from("workspaces").delete().eq("id", id);
    for (const id of created.users) {
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
    const { count: leftovers } = await admin
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .like("name", "invverify-%");
    console.log(`cleanup: leftover invverify workspaces = ${leftovers}`);
  });
