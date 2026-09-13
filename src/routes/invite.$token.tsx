import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Mail, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { acceptInvitationByToken, getInvitationPreview } from "@/lib/invitations.functions";
import { NOINDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept your MunchReach invitation" },
      {
        name: "description",
        content: "Join your team's MunchReach workspace and start sending cold email campaigns.",
      },
      { property: "og:title", content: "Accept your MunchReach invitation" },
      { property: "og:description", content: "Join your team's MunchReach workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      NOINDEX_META,
    ],
  }),
  component: InvitePage,
});

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  campaign_manager: "Campaign manager",
  inbox_manager: "Inbox manager",
  analyst: "Analyst",
  client_viewer: "Client viewer",
  member: "Member",
};

function roleLabel(role: string | null) {
  if (!role) return "Member";
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link to="/" aria-label="MunchReach">
            <BrandLogo context="login" className="h-8 max-w-[190px]" />
          </Link>
        </div>
        <div className="surface-card space-y-5 p-7 text-center">{children}</div>
      </div>
    </main>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 text-left">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <span className="block truncate text-sm font-medium text-foreground">{value}</span>
      </span>
    </div>
  );
}

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { selectWorkspace } = useWorkspace();
  const accept = useServerFn(acceptInvitationByToken);
  const fetchPreview = useServerFn(getInvitationPreview);

  const [session, setSession] = useState<{ email: string } | null | undefined>(undefined);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  // The invitation link is preserved across sign-in, sign-up and Google OAuth.
  const returnTo = `/invite/${token}`;

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setSession(data.user ? { email: (data.user.email ?? "").toLowerCase() } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const preview = useQuery({
    queryKey: ["invitation-preview", token],
    queryFn: () => fetchPreview({ data: { token } }),
    retry: false,
  });

  async function handleAccept() {
    if (accepting) return; // double-click guard; the server is idempotent too
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await accept({ data: { token } });
      selectWorkspace(result.workspaceId);
      setJoined(result.workspaceName ?? "your new workspace");
      window.setTimeout(() => void navigate({ to: "/dashboard", replace: true }), 1400);
    } catch (error) {
      setAcceptError(
        error instanceof Error ? error.message : "This invitation could not be accepted.",
      );
    } finally {
      setAccepting(false);
    }
  }

  async function handleSwitchAccount() {
    await supabase.auth.signOut();
    void navigate({ to: "/signin", search: { redirect: returnTo } });
  }

  if (preview.isLoading || session === undefined) {
    return (
      <Shell>
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking your invitation…
        </p>
      </Shell>
    );
  }

  if (joined) {
    return (
      <Shell>
        <CheckCircle2 className="mx-auto size-10 text-primary" />
        <h1 className="text-xl font-semibold">You&apos;re now a member of {joined}.</h1>
        <p className="text-sm text-muted-foreground">Taking you to your workspace…</p>
        <Button className="w-full" onClick={() => void navigate({ to: "/dashboard" })}>
          Go to dashboard
        </Button>
      </Shell>
    );
  }

  const data = preview.data;
  if (!data || data.state !== "pending") {
    const copy =
      data?.state === "accepted"
        ? "This invitation has already been used. Sign in to reach the workspace."
        : data?.state === "revoked"
          ? "This invitation was cancelled by the workspace owner."
          : data?.state === "expired"
            ? "This invitation has expired. Ask your teammate to send a new one."
            : data?.state === "workspace_missing"
              ? "The workspace for this invitation no longer exists."
              : "This invitation link is not valid.";
    return (
      <Shell>
        <AlertTriangle className="mx-auto size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">{copy}</p>
        <div className="space-y-2">
          <Button className="w-full" onClick={() => void navigate({ to: "/signin" })}>
            Sign in
          </Button>
          <Button variant="outline" className="w-full" onClick={() => void navigate({ to: "/" })}>
            Back to MunchReach
          </Button>
        </div>
      </Shell>
    );
  }

  const invitedEmail = (data.email ?? "").toLowerCase();
  const wrongAccount = session !== null && session.email !== invitedEmail;

  return (
    <Shell>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold">You&apos;ve been invited to join a workspace</h1>
        <p className="text-sm text-muted-foreground">
          {data.inviterName ? `${data.inviterName} invited you to ` : "You were invited to "}
          <span className="font-medium text-foreground">{data.workspaceName}</span> on MunchReach.
        </p>
      </div>

      <div className="space-y-2">
        <Row icon={Users} label="Workspace" value={data.workspaceName ?? "Workspace"} />
        <Row icon={Mail} label="Invited email" value={data.email ?? ""} />
        <Row icon={ShieldCheck} label="Your role" value={roleLabel(data.role)} />
      </div>

      {data.message ? (
        <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-left text-sm text-muted-foreground">
          “{data.message}”
        </p>
      ) : null}

      {acceptError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {acceptError}
        </p>
      ) : null}

      {session === null ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Sign in or create your account with <strong>{data.email}</strong> to join.
          </p>
          <Button
            className="w-full"
            onClick={() => void navigate({ to: "/signup", search: { redirect: returnTo } })}
          >
            Create account
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void navigate({ to: "/signin", search: { redirect: returnTo } })}
          >
            I already have an account — sign in
          </Button>
        </div>
      ) : wrongAccount ? (
        <div className="space-y-2">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            This invitation was sent to a different email address. You are signed in as{" "}
            {session.email}.
          </p>
          <Button className="w-full" onClick={() => void handleSwitchAccount()}>
            Sign out and switch account
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={() => void handleAccept()} disabled={accepting}>
          {accepting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Joining…
            </>
          ) : (
            "Accept invitation"
          )}
        </Button>
      )}
    </Shell>
  );
}
