/**
 * Workspace invitation preview + acceptance.
 *
 * The invite page must be usable before the recipient has an account, so the
 * preview runs unauthenticated through the service-role client and returns
 * only what the page needs to render (workspace name, invited email, role,
 * inviter name). Workspace ids, tokens and internal columns never leave the
 * server. Acceptance always happens through the existing
 * `accept_workspace_invitation` security-definer routine, which re-checks the
 * token, status, expiry and email match in Postgres.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

const tokenSchema = z.object({ token: z.string().trim().min(10).max(200) });

export type InvitationState =
  | "pending"
  | "expired"
  | "accepted"
  | "revoked"
  | "invalid"
  | "workspace_missing";

export type InvitationPreview = {
  state: InvitationState;
  email: string | null;
  role: string | null;
  workspaceName: string | null;
  inviterName: string | null;
  message: string | null;
  expiresAt: string | null;
};

const NOT_FOUND: InvitationPreview = {
  state: "invalid",
  email: null,
  role: null,
  workspaceName: null,
  inviterName: null,
  message: null,
  expiresAt: null,
};

/** Public: describe an invitation so the page can render before sign-in. */
export const getInvitationPreview = createServerFn({ method: "POST" })
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data }): Promise<InvitationPreview> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Client;

    const { data: row } = await admin
      .from("workspace_invitations")
      .select("workspace_id, email, role, message, status, expires_at, invited_by")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) return NOT_FOUND;

    const [{ data: workspace }, { data: inviter }] = await Promise.all([
      admin.from("workspaces").select("name").eq("id", row.workspace_id).maybeSingle(),
      row.invited_by
        ? admin.from("profiles").select("full_name, email").eq("id", row.invited_by).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const expired = new Date(String(row.expires_at)).getTime() < Date.now();
    const state: InvitationState =
      row.status === "accepted"
        ? "accepted"
        : row.status === "revoked"
          ? "revoked"
          : !workspace
            ? "workspace_missing"
            : row.status === "expired" || expired
              ? "expired"
              : row.status === "pending"
                ? "pending"
                : "invalid";

    return {
      state,
      email: String(row.email),
      role: String(row.role),
      workspaceName: workspace ? String(workspace.name) : null,
      inviterName:
        (inviter?.full_name as string | null) ?? (inviter?.email as string | null) ?? null,
      message: (row.message as string | null) ?? null,
      expiresAt: String(row.expires_at),
    };
  });

export type AcceptResult = {
  workspaceId: string;
  workspaceName: string | null;
  alreadyMember: boolean;
};

/**
 * Accept an invitation as the signed-in user. Idempotent: a second call (double
 * click, retry, another tab) resolves to the same membership instead of failing.
 */
export const acceptInvitationByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => tokenSchema.parse(input))
  .handler(async ({ data, context }): Promise<AcceptResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Client;

    const { data: row } = await admin
      .from("workspace_invitations")
      .select("id, workspace_id, email, role, status, expires_at, accepted_by")
      .eq("token", data.token)
      .maybeSingle();
    if (!row) throw new Error("This invitation link is not valid.");

    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, name")
      .eq("id", row.workspace_id)
      .maybeSingle();
    if (!workspace) throw new Error("The workspace for this invitation no longer exists.");

    const authEmail = String(
      (context.claims as Record<string, unknown> | undefined)?.["email"] ?? "",
    ).toLowerCase();
    if (authEmail && authEmail !== String(row.email).toLowerCase()) {
      throw new Error(`This invitation was sent to ${row.email}.`);
    }

    // Already a member (accepted earlier, or accepted in another session).
    const { data: existing } = await admin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", row.workspace_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      if (row.status === "pending") {
        await admin
          .from("workspace_invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            accepted_by: context.userId,
          })
          .eq("id", row.id)
          .eq("status", "pending");
      }
      return {
        workspaceId: String(workspace.id),
        workspaceName: String(workspace.name),
        alreadyMember: true,
      };
    }

    if (row.status === "revoked") throw new Error("This invitation was cancelled.");
    if (row.status === "accepted") {
      throw new Error("This invitation has already been used.");
    }
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      throw new Error("This invitation has expired. Ask for a new one.");
    }

    // Postgres re-validates the token, status, expiry and email match.
    const client = context.supabase as Client;
    const { error } = await client.rpc("accept_workspace_invitation", { _token: data.token });
    if (error) throw new Error(error.message);

    return {
      workspaceId: String(workspace.id),
      workspaceName: String(workspace.name),
      alreadyMember: false,
    };
  });
