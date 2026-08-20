/**
 * Workspace & team settings server functions.
 *
 * Every mutation goes through a security-definer RPC that re-checks the
 * caller's workspace role in Postgres, so the UI can never grant access it
 * doesn't have.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type TeamRow = {
  rowId: string;
  kind: "member" | "invitation";
  userId: string | null;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  joinedAt: string | null;
  lastActiveAt: string | null;
  invitedByEmail: string | null;
  expiresAt: string | null;
  message: string | null;
};

const roleEnum = z.enum(["owner", "admin", "member"]);

/** Members + pending invitations for one workspace. */
export const getWorkspaceTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("workspace_team", {
      _workspace_id: data.workspaceId,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      rowId: String(r["row_id"]),
      kind: (r["kind"] as TeamRow["kind"]) ?? "member",
      userId: (r["user_id"] as string | null) ?? null,
      email: String(r["email"] ?? ""),
      fullName: (r["full_name"] as string | null) ?? null,
      avatarUrl: (r["avatar_url"] as string | null) ?? null,
      role: String(r["role"] ?? "member"),
      status: String(r["status"] ?? "active"),
      joinedAt: (r["joined_at"] as string | null) ?? null,
      lastActiveAt: (r["last_active_at"] as string | null) ?? null,
      invitedByEmail: (r["invited_by_email"] as string | null) ?? null,
      expiresAt: (r["expires_at"] as string | null) ?? null,
      message: (r["message"] as string | null) ?? null,
    })) as TeamRow[];
  });

/** Invite a teammate by email and send the invitation link. */
export const inviteTeammate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().trim().email().max(200),
        role: roleEnum,
        message: z.string().trim().max(500).optional(),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("invite_workspace_member", {
      _workspace_id: data.workspaceId,
      _email: data.email.toLowerCase(),
      _role: data.role,
      _message: data.message ?? null,
    });
    if (error) throw new Error(error.message);
    const invitation = (rows ?? [])[0] as { id: string; token: string } | undefined;
    if (!invitation) throw new Error("Invitation could not be created");

    const [{ data: workspace }, { data: profile }] = await Promise.all([
      client.from("workspaces").select("name").eq("id", data.workspaceId).maybeSingle(),
      client.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
    ]);

    const { sendInvitationEmail } = await import("@/lib/invitations.server");
    const result = await sendInvitationEmail({
      to: data.email,
      workspaceName: String(workspace?.name ?? "your workspace"),
      inviterName: String(profile?.full_name ?? profile?.email ?? "A teammate"),
      role: data.role,
      message: data.message ?? null,
      acceptUrl: `${data.origin.replace(/\/$/, "")}/invite/${invitation.token}`,
    });

    return { id: invitation.id, emailSent: result.sent, emailError: result.error ?? null };
  });

/** Re-issue the token and resend the email for a pending invitation. */
export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ invitationId: z.string().uuid(), origin: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: rows, error } = await client.rpc("resend_workspace_invitation", {
      _invitation_id: data.invitationId,
    });
    if (error) throw new Error(error.message);
    const invitation = (rows ?? [])[0] as { id: string; token: string } | undefined;
    if (!invitation) throw new Error("Invitation not found");

    const { data: row } = await client
      .from("workspace_invitations")
      .select("email, role, message, workspace_id")
      .eq("id", data.invitationId)
      .maybeSingle();
    const { data: workspace } = await client
      .from("workspaces")
      .select("name")
      .eq("id", row?.workspace_id)
      .maybeSingle();

    const { sendInvitationEmail } = await import("@/lib/invitations.server");
    const result = await sendInvitationEmail({
      to: String(row?.email ?? ""),
      workspaceName: String(workspace?.name ?? "your workspace"),
      inviterName: "A teammate",
      role: String(row?.role ?? "member"),
      message: (row?.message as string | null) ?? null,
      acceptUrl: `${data.origin.replace(/\/$/, "")}/invite/${invitation.token}`,
    });
    return { emailSent: result.sent, emailError: result.error ?? null };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ invitationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client.rpc("revoke_workspace_invitation", {
      _invitation_id: data.invitationId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ memberId: z.string().uuid(), role: roleEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client.rpc("update_workspace_member_role", {
      _member_id: data.memberId,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client.rpc("remove_workspace_member", { _member_id: data.memberId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type WorkspaceSettings = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string | null;
  sendingTimezone: string | null;
  sendDays: number[];
  sendStartHour: number;
  sendEndHour: number;
  ownerId: string;
  createdAt: string;
};

export const getWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: row, error } = await client
      .from("workspaces")
      .select(
        "id, name, slug, logo_url, timezone, sending_timezone, send_days, send_start_hour, send_end_hour, owner_id, created_at",
      )
      .eq("id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Workspace not found");
    const r = row as Record<string, unknown>;
    return {
      id: String(r["id"]),
      name: String(r["name"]),
      slug: String(r["slug"]),
      logoUrl: (r["logo_url"] as string | null) ?? null,
      timezone: (r["timezone"] as string | null) ?? null,
      sendingTimezone: (r["sending_timezone"] as string | null) ?? null,
      sendDays: (r["send_days"] as number[] | null) ?? [1, 2, 3, 4, 5],
      sendStartHour: Number(r["send_start_hour"] ?? 9),
      sendEndHour: Number(r["send_end_hour"] ?? 17),
      ownerId: String(r["owner_id"]),
      createdAt: String(r["created_at"]),
    } as WorkspaceSettings;
  });

export const saveWorkspaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        name: z.string().trim().min(2).max(60),
        slug: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
        // Storage path inside the private workspace-logos bucket (or an
        // absolute URL for legacy rows) — never a blob: preview URL.
        logoUrl: z
          .string()
          .trim()
          .max(500)
          .refine((v) => !v.startsWith("blob:") && !v.startsWith("data:"), "Invalid logo reference")
          .nullable()
          .optional(),
        timezone: z.string().max(64),
        sendingTimezone: z.string().max(64),
        sendDays: z.array(z.number().int().min(0).max(6)).min(1),
        sendStartHour: z.number().int().min(0).max(23),
        sendEndHour: z.number().int().min(1).max(24),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client.rpc("update_workspace_settings", {
      _workspace_id: data.workspaceId,
      _name: data.name,
      _slug: data.slug,
      _logo_url: data.logoUrl ?? null,
      _timezone: data.timezone,
      _sending_timezone: data.sendingTimezone,
      _send_days: data.sendDays,
      _send_start_hour: data.sendStartHour,
      _send_end_hour: data.sendEndHour,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), confirm: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { error } = await client.rpc("delete_workspace", {
      _workspace_id: data.workspaceId,
      _confirm: data.confirm,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Accept an invitation by token; returns the joined workspace id. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const client = context.supabase as Client;
    const { data: workspaceId, error } = await client.rpc("accept_workspace_invitation", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    return { workspaceId: workspaceId as string };
  });

export type WorkspaceActivity = {
  id: string;
  type: string;
  detail: string | null;
  target_email: string | null;
  created_at: string;
};

/** Team activity timeline: joins, role changes, removals, invitations. */
export const getWorkspaceActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS scopes rows to workspaces the caller belongs to.
    const { data: rows, error } = await context.supabase
      .from("workspace_activity")
      .select("id, type, detail, target_email, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkspaceActivity[];
  });
