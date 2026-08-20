import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/workspace-team.functions";

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
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitation);
  const [state, setState] = useState<"checking" | "signin" | "joining" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        setState("signin");
        return;
      }
      setState("joining");
      try {
        const result = await accept({ data: { token } });
        window.localStorage.setItem("sendloop-workspace", result.workspaceId);
        void navigate({ to: "/dashboard" });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "This invitation is no longer valid.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, accept, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="surface-card w-full max-w-md space-y-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Workspace invitation</h1>
        {state === "checking" || state === "joining" ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {state === "joining" ? "Joining the workspace…" : "Checking your invitation…"}
          </p>
        ) : state === "signin" ? (
          <>
            <p className="text-sm text-muted-foreground">
              Sign in with the email this invitation was sent to, then return to this link.
            </p>
            <Button onClick={() => navigate({ to: "/signin" })}>Sign in to continue</Button>
          </>
        ) : (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </main>
  );
}
