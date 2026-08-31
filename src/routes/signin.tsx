import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getPublicAuthSettings } from "@/lib/auth-settings.functions";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absoluteUrl } from "@/lib/seo";

export const Route = createFileRoute("/signin")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] as string } : {},
  head: () => ({
    meta: [
      { title: "Sign in to MunchReach — Cold Email Workspace" },
      {
        name: "description",
        content:
          "Sign in to your MunchReach workspace to run cold email campaigns, automate follow-ups and manage every reply in one inbox.",
      },
      { property: "og:title", content: "Sign in to MunchReach" },
      {
        property: "og:description",
        content: "Access your cold email campaigns, leads and unified inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: absoluteUrl("/signin") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/signin") }],
  }),
  component: SignInPage,
});

const REMEMBER_KEY = "sendloop.remember-email";

function safeRedirect(target: string | undefined): string {
  if (!target) return "/dashboard";
  // Only allow same-origin internal paths.
  if (!target.startsWith("/") || target.startsWith("//")) return "/dashboard";
  if (target.startsWith("/signin") || target.startsWith("/signup") || target.startsWith("/auth")) {
    return "/dashboard";
  }
  return target;
}

function SignInPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const destination = safeRedirect(search.redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") navigate({ to: destination, replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, destination]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      const message =
        error.message === "Invalid login credentials"
          ? "That email and password combination doesn't match an account."
          : error.message === "Email not confirmed"
            ? "Please confirm your email address, then log in again."
            : error.message;
      setFormError(message);
      toast.error(message);
      return;
    }
    if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
    else window.localStorage.removeItem(REMEMBER_KEY);
    if (data.session) navigate({ to: destination, replace: true });
  }

  const googleQuery = useQuery({
    queryKey: ["public-auth-settings"],
    queryFn: () => getPublicAuthSettings(),
    staleTime: 60_000,
  });

  async function handleGoogle() {
    if (search.redirect) {
      window.sessionStorage.setItem("munchreach.post-auth", destination);
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) toast.error("Google sign-in failed. Please try again.");
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to run campaigns, track replies and keep your pipeline moving."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {googleQuery.data?.googleEnabled !== false && (
        <>
          <Button
            variant="outline"
            className="h-11 w-full gap-3 border-border/80 bg-background text-sm font-medium shadow-sm transition-all hover:bg-muted/60 hover:shadow"
            onClick={handleGoogle}
          >
            <GoogleIcon className="size-[18px]" />
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              or continue with email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {/* When Google sign-in is switched off it stays hidden for everyone —
          staff sign in with their email and password like any other account. */}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs font-medium text-foreground">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium text-foreground">
              Password
            </Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={remember}
            onCheckedChange={(value) => setRemember(value === true)}
            aria-label="Remember me"
          />
          Keep me signed in
        </label>

        <AnimatePresence>
          {formError ? (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {formError}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <Button
          type="submit"
          className="h-11 w-full text-sm font-semibold shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--primary)_80%,transparent)] transition-all hover:-translate-y-px active:translate-y-0"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}

