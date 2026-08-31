import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  adminRevokeAllSessions,
  adminRevokeSession,
  adminSecurityOverview,
} from "@/lib/admin-security.functions";

export const Route = createFileRoute("/_authenticated/admin/security")({
  component: AdminSecurityPage,
  head: () => ({
    meta: [{ title: "Admin security — MunchReach" }],
  }),
});

type SessionRow = {
  id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  aal: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

type EventRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  event_type: string;
  result: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: string;
};

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function device(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const browser = /Firefox|Edg|Chrome|Safari/.exec(userAgent)?.[0] ?? "Browser";
  const os = /Windows|Mac OS X|Android|iPhone|Linux/.exec(userAgent)?.[0] ?? "Unknown OS";
  return `${browser} · ${os}`;
}

function AdminSecurityPage() {
  const load = useServerFn(adminSecurityOverview);
  const revoke = useServerFn(adminRevokeSession);
  const revokeAll = useServerFn(adminRevokeAllSessions);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"sessions" | "events">("sessions");

  const overview = useQuery({
    queryKey: ["admin-security-overview"],
    queryFn: () => load({}),
  });

  const revokeOne = useMutation({
    mutationFn: (sessionRowId: string) => revoke({ data: { sessionRowId } }),
    onSuccess: () => {
      toast.success("Session revoked.");
      queryClient.invalidateQueries({ queryKey: ["admin-security-overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeEverything = useMutation({
    mutationFn: () => revokeAll({ data: { keepCurrent: true } }),
    onSuccess: (result: any) => {
      toast.success(`${result?.revoked ?? 0} admin session(s) revoked.`);
      queryClient.invalidateQueries({ queryKey: ["admin-security-overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sessions = ((overview.data as any)?.sessions ?? []) as SessionRow[];
  const events = ((overview.data as any)?.events ?? []) as EventRow[];
  const failures = events.filter((event) => event.result !== "success").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Admin security</h2>
          <p className="text-sm text-muted-foreground">
            Active staff sessions, security events and emergency revocation. Session tokens are never
            exposed here.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <ShieldAlert className="mr-2 size-4" /> Revoke all other admin sessions
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke every other admin session?</AlertDialogTitle>
              <AlertDialogDescription>
                All staff — except your current session — will be signed out of the admin area
                immediately and must authenticate again with their second factor. This action is
                recorded in the security log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => revokeEverything.mutate()}>
                Revoke sessions
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Active admin sessions</p>
          <p className="mt-1 text-2xl font-semibold">
            {sessions.filter((session) => !session.revoked_at).length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Recent security events</p>
          <p className="mt-1 text-2xl font-semibold">{events.length}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Denied / failed</p>
          <p className="mt-1 text-2xl font-semibold">{failures}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === "sessions" ? "default" : "outline"} size="sm" onClick={() => setTab("sessions")}>
          Sessions
        </Button>
        <Button variant={tab === "events" ? "default" : "outline"} size="sm" onClick={() => setTab("events")}>
          Security events
        </Button>
      </div>

      {overview.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {overview.isError ? (
        <p className="text-sm text-destructive">{(overview.error as Error).message}</p>
      ) : null}

      {tab === "sessions" ? (
        <div className="surface-card divide-y divide-border">
          {sessions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No admin sessions recorded yet.</p>
          ) : null}
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{device(session.user_agent)}</p>
                <p className="text-xs text-muted-foreground">
                  IP {session.ip ?? "unknown"} · started {when(session.created_at)} · last activity{" "}
                  {when(session.last_seen_at)}
                </p>
                <p className="text-xs text-muted-foreground">User {session.user_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={session.aal === "aal2" ? "secondary" : "outline"}>
                  {session.aal === "aal2" ? (
                    <>
                      <ShieldCheck className="mr-1 size-3" /> 2FA
                    </>
                  ) : (
                    "single factor"
                  )}
                </Badge>
                {session.revoked_at ? (
                  <Badge variant="outline">Revoked {when(session.revoked_at)}</Badge>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke this admin session?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The device loses admin access on its next request and must sign in again.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => revokeOne.mutate(session.id)}>
                          Revoke session
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="surface-card divide-y divide-border">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No security events recorded yet.</p>
          ) : null}
          {events.map((event) => (
            <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">{event.event_type.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {event.detail ?? "—"} · IP {event.ip ?? "unknown"} · {device(event.user_agent)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.email ?? event.user_id ?? "unknown user"} · {when(event.created_at)}
                </p>
              </div>
              <Badge variant={event.result === "success" ? "secondary" : "destructive"}>
                {event.result}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
