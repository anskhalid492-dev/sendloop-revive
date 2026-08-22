import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Mail, Plus, Send, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useStorageImage } from "@/hooks/useStorageImage";
import { supabase } from "@/integrations/supabase/client";
import { createWorkspace } from "@/lib/workspaces.functions";
import {
  deleteWorkspace,
  getWorkspaceSettings,
  getWorkspaceActivity,
  getWorkspaceTeam,

  inviteTeammate,
  removeMember,
  resendInvitation,
  revokeInvitation,
  saveWorkspaceSettings,
  updateMemberRole,
  type TeamRow,
  type WorkspaceRole,
} from "@/lib/workspace-team.functions";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace & team settings — MunchReach" },
      {
        name: "description",
        content:
          "Manage your MunchReach workspace: name, sending window, teammates, roles, invitations and permissions.",
      },
      { property: "og:title", content: "Workspace & team settings — MunchReach" },
      {
        property: "og:description",
        content: "Workspace details, teammates, roles, invitations and permissions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacePage,
});

const TABS = ["General", "Team", "Permissions", "Danger Zone"] as const;
type Tab = (typeof TABS)[number];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const PERMISSIONS: { area: string; owner: string; admin: string; member: string }[] = [
  { area: "Workspace settings", owner: "Full", admin: "Edit", member: "View" },
  { area: "Billing & plan", owner: "Full", admin: "View", member: "None" },
  { area: "Team & invitations", owner: "Full", admin: "Invite & manage members", member: "View" },
  { area: "Domains & mailboxes", owner: "Full", admin: "Full", member: "View" },
  { area: "Campaigns", owner: "Full", admin: "Full", member: "Create & edit own" },
  { area: "Unified inbox", owner: "Full", admin: "Full", member: "Reply" },
  { area: "CRM contacts", owner: "Full", admin: "Full", member: "Edit" },
  { area: "Analytics", owner: "Full", admin: "Full", member: "View" },
  { area: "Delete workspace", owner: "Yes", admin: "No", member: "No" },
];

function roleRank(role: string) {
  return role === "owner" ? 3 : role === "admin" ? 2 : 1;
}

function WorkspacePage() {
  const { workspace, workspaces, selectWorkspace, isLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("General");
  const queryClient = useQueryClient();
  const workspaceId = workspace?.id ?? null;
  const myRole = workspace?.role ?? "member";
  const canManage = roleRank(myRole) >= 2;
  const isOwner = myRole === "owner";

  return (
    <AppShell title="Workspace" description="Workspace settings, team and permissions">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Active workspace</span>
            <Select value={workspaceId ?? ""} onValueChange={(id) => selectWorkspace(id)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={isLoading ? "Loading…" : "Select a workspace"} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="capitalize">
              {myRole}
            </Badge>
          </div>
          <CreateWorkspaceButton
            onCreated={async (id) => {
              await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
              selectWorkspace(id);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
          {TABS.map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "ghost"}
              onClick={() => setTab(t)}
            >
              {t}
            </Button>
          ))}
        </div>

        {!workspaceId ? (
          <div className="surface-card p-6 text-sm text-muted-foreground">
            {isLoading ? "Loading your workspaces…" : "Create a workspace to get started."}
          </div>
        ) : tab === "General" ? (
          <GeneralTab workspaceId={workspaceId} canEdit={canManage} />
        ) : tab === "Team" ? (
          <TeamTab workspaceId={workspaceId} myRole={myRole} canManage={canManage} />
        ) : tab === "Permissions" ? (
          <PermissionsTab myRole={myRole} />
        ) : (
          <DangerTab workspaceId={workspaceId} isOwner={isOwner} />
        )}
      </div>
    </AppShell>
  );
}

function CreateWorkspaceButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useServerFn(createWorkspace);
  const mutation = useMutation({
    mutationFn: () => create({ data: { name: name.trim() } }),
    onSuccess: (w) => {
      toast.success("Workspace created");
      setOpen(false);
      setName("");
      onCreated(w.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New workspace
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>Separate teams, domains and campaigns.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Outbound"
          />
          <DialogFooter>
            <Button
              disabled={name.trim().length < 2 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GeneralTab({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getWorkspaceSettings);
  const save = useServerFn(saveWorkspaceSettings);
  const query = useQuery({
    queryKey: ["workspace-settings", workspaceId],
    queryFn: () => fetchSettings({ data: { workspaceId } }),
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    slug: string;
    logoUrl: string | null;
    timezone: string;
    sendingTimezone: string;
    sendDays: number[];
    sendStartHour: number;
    sendEndHour: number;
  } | null>(null);

  useEffect(() => {
    const s = query.data;
    if (!s) return;
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setForm({
      name: s.name,
      slug: s.slug,
      logoUrl: s.logoUrl ?? null,
      timezone: s.timezone ?? browserTz,
      sendingTimezone: s.sendingTimezone ?? s.timezone ?? browserTz,
      sendDays: s.sendDays,
      sendStartHour: s.sendStartHour,
      sendEndHour: s.sendEndHour,
    });
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => save({ data: { workspaceId, ...form! } }),
    onSuccess: async () => {
      toast.success("Workspace updated");
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading || !form) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="surface-card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            value={form.name}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={form.slug}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tz">Workspace timezone</Label>
          <Input
            id="tz"
            value={form.timezone}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stz">Sending timezone</Label>
          <Input
            id="stz"
            value={form.sendingTimezone}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, sendingTimezone: e.target.value })}
          />
        </div>
      </div>

      <WorkspaceLogoField
        workspaceId={workspaceId}
        value={form.logoUrl}
        canEdit={canEdit}
        uploading={uploadingLogo}
        setUploading={setUploadingLogo}
        onChange={(next) => setForm((f) => (f ? { ...f, logoUrl: next } : f))}
      />

      <div className="space-y-2">
        <Label>Sending days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const active = form.sendDays.includes(d.value);
            return (
              <Button
                key={d.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={!canEdit}
                onClick={() =>
                  setForm({
                    ...form,
                    sendDays: active
                      ? form.sendDays.filter((v) => v !== d.value)
                      : [...form.sendDays, d.value].sort(),
                  })
                }
              >
                {d.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="start">Sending window starts (hour)</Label>
          <Input
            id="start"
            type="number"
            min={0}
            max={23}
            value={form.sendStartHour}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, sendStartHour: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="end">Sending window ends (hour)</Label>
          <Input
            id="end"
            type="number"
            min={1}
            max={24}
            value={form.sendEndHour}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, sendEndHour: Number(e.target.value) })}
          />
        </div>
      </div>

      {canEdit ? (
        <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          <Check className="size-4" /> Save changes
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can change workspace settings.
        </p>
      )}
    </div>
  );
}

export function TeamTab({
  workspaceId,
  myRole,
  canManage,
}: {
  workspaceId: string;
  myRole: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(getWorkspaceTeam);
  const invite = useServerFn(inviteTeammate);
  const resend = useServerFn(resendInvitation);
  const revoke = useServerFn(revokeInvitation);
  const changeRole = useServerFn(updateMemberRole);
  const remove = useServerFn(removeMember);

  const query = useQuery({
    queryKey: ["workspace-team", workspaceId],
    queryFn: () => fetchTeam({ data: { workspaceId } }),
  });

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [message, setMessage] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workspace-team", workspaceId] });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const inviteMutation = useMutation({
    mutationFn: () =>
      invite({
        data: {
          workspaceId,
          email: email.trim(),
          role,
          message: message.trim() || undefined,
          origin,
        },
      }),
    onSuccess: async (res) => {
      toast[res.emailSent ? "success" : "warning"](
        res.emailSent
          ? "Invitation sent"
          : "Invitation created — the email couldn't be delivered, so copy the invite link and share it directly.",
      );

      setOpen(false);
      setEmail("");
      setMessage("");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: { type: string; row: TeamRow; role?: WorkspaceRole }) => {
      if (action.type === "resend")
        return resend({ data: { invitationId: action.row.rowId, origin } });
      if (action.type === "revoke") return revoke({ data: { invitationId: action.row.rowId } });
      if (action.type === "role")
        return changeRole({ data: { memberId: action.row.rowId, role: action.role! } });
      return remove({ data: { memberId: action.row.rowId } });
    },
    onSuccess: async () => {
      toast.success("Team updated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data ?? [];
  const members = useMemo(() => rows.filter((r) => r.kind === "member"), [rows]);
  const invites = useMemo(() => rows.filter((r) => r.kind === "invitation"), [rows]);

  return (
    <div className="space-y-5">
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-primary" /> Members ({members.length})
          </h2>
          {canManage ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Mail className="size-4" /> Invite teammate
            </Button>
          ) : null}
        </div>

        {query.isLoading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-muted" />
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {members.map((m) => (
              <li key={m.rowId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.fullName ?? m.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                    {m.lastActiveAt
                      ? ` · active ${new Date(m.lastActiveAt).toLocaleDateString()}`
                      : m.joinedAt
                        ? ` · joined ${new Date(m.joinedAt).toLocaleDateString()}`
                        : ""}
                  </p>
                </div>
                {canManage && m.role !== "owner" ? (
                  <Select
                    value={m.role}
                    onValueChange={(value) =>
                      actionMutation.mutate({
                        type: "role",
                        row: m,
                        role: value as WorkspaceRole,
                      })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(myRole === "owner"
                        ? (["owner", "admin", "member"] as const)
                        : (["admin", "member"] as const)
                      ).map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                )}
                {canManage && m.role !== "owner" ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${m.email}`}
                    onClick={() => actionMutation.mutate({ type: "remove", row: m })}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="surface-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Send className="size-4 text-primary" /> Pending invitations ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {invites.map((i) => (
              <li key={i.rowId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {i.role} · {i.status}
                    {i.expiresAt ? ` · expires ${new Date(i.expiresAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actionMutation.mutate({ type: "resend", row: i })}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actionMutation.mutate({ type: "revoke", row: i })}
                    >
                      Revoke
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              They receive an email with a secure link to join this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(myRole === "owner"
                    ? (["owner", "admin", "member"] as const)
                    : (["admin", "member"] as const)
                  ).map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-message">Personal note (optional)</Label>
              <Textarea
                id="invite-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!email.includes("@") || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TeamActivityTimeline workspaceId={workspaceId} />
    </div>
  );
}

/** Joins, role changes, removals and invitation acceptance for this workspace. */
function TeamActivityTimeline({ workspaceId }: { workspaceId: string }) {
  const fetchActivity = useServerFn(getWorkspaceActivity);
  const query = useQuery({
    queryKey: ["workspace-activity", workspaceId],
    queryFn: () => fetchActivity({ data: { workspaceId, limit: 25 } }),
  });

  return (
    <section className="surface-card p-5">
      <h2 className="text-sm font-semibold">Team activity</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Member joins, role changes, removals and invitation activity.
      </p>
      {query.isLoading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No team activity yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {(query.data ?? []).map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <span>{row.detail ?? row.type.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function PermissionsTab({ myRole }: { myRole: string }) {
  return (
    <div className="surface-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Shield className="size-4 text-primary" /> Role permissions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Permissions are enforced in the database, not just in this UI. Your role:{" "}
        <span className="font-medium capitalize">{myRole}</span>.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Area</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Admin</th>
              <th className="px-3 py-2 text-left font-medium">Member</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.area} className="border-t border-border/60">
                <td className="px-3 py-2 font-medium">{p.area}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.owner}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.admin}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.member}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DangerTab({ workspaceId, isOwner }: { workspaceId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const del = useServerFn(deleteWorkspace);
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: () => del({ data: { workspaceId, confirm } }),
    onSuccess: async () => {
      toast.success("Workspace deleted");
      window.localStorage.removeItem("sendloop-workspace");
      await queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="surface-card border-destructive/40 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="size-4" /> Danger zone
      </h2>
      {!isOwner ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Only the workspace owner can delete this workspace.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Deleting removes every campaign, contact, mailbox connection and analytics record in
            this workspace. This cannot be undone. Type <strong>DELETE</strong> to confirm.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-40"
              aria-label="Type DELETE to confirm"
            />
            <Button
              variant="destructive"
              disabled={confirm !== "DELETE" || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Trash2 className="size-4" /> Delete workspace
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Workspace logo upload. Files live in the private `workspace-logos` bucket
 * under the workspace id, which is exactly what the storage policies scope to,
 * so one customer can never read another workspace's logo. Only the storage
 * path is persisted — rendering goes through a short-lived signed URL.
 */
function WorkspaceLogoField({
  workspaceId,
  value,
  canEdit,
  uploading,
  setUploading,
  onChange,
}: {
  workspaceId: string;
  value: string | null;
  canEdit: boolean;
  uploading: boolean;
  setUploading: (next: boolean) => void;
  onChange: (next: string | null) => void;
}) {
  const preview = useStorageImage("workspace-logos", value);

  async function handleFile(file: File) {
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Images must be 3 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const ext = file.type === "image/svg+xml" ? "svg" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${workspaceId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("workspace-logos")
        .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
      if (error) throw new Error(error.message);
      const previous = value;
      onChange(path);
      if (previous && !previous.startsWith("http")) {
        await supabase.storage.from("workspace-logos").remove([previous]);
      }
      toast.success("Logo uploaded — save changes to apply it");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Workspace logo</Label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
          {preview ? (
            <img src={preview} alt="Workspace logo" className="size-full object-contain p-1.5" />
          ) : (
            <Shield className="size-5 text-muted-foreground" />
          )}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="workspace-logo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => document.getElementById("workspace-logo-input")?.click()}
            >
              {uploading ? "Uploading…" : value ? "Replace logo" : "Upload logo"}
            </Button>
            {value ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Used inside this workspace only. It never replaces the MunchReach platform logo.
      </p>
    </div>
  );
}
