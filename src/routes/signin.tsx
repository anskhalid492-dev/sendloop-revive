import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign in to Sendloop — Cold Email Workspace" },
      {
        name: "description",
        content:
          "Sign in to your Sendloop workspace to run cold email campaigns, automate follow-ups and manage every reply in one inbox.",
      },
      { property: "og:title", content: "Sign in to Sendloop" },
      {
        property: "og:description",
        content: "Access your cold email campaigns, leads and unified inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignInPage,
});

const REMEMBER_KEY = "sendloop.remember-email";

function SignInPage() {
  const navigate = useNavigate();
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
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const message =
        error.message === "Invalid login credentials"
          ? "That email and password combination doesn't match an account."
          : error.message;
      setFormError(message);
      toast.error(message);
      return;
    }
    if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
    else window.localStorage.removeItem(REMEMBER_KEY);
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-in failed. Please try again.");
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your Sendloop workspace."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Sign up free
          </Link>
        </>
      }
    >
      <Button variant="outline" className="w-full" onClick={handleGoogle}>
        Continue with Google
      </Button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="transition-shadow focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="transition-shadow focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={remember}
            onCheckedChange={(value) => setRemember(value === true)}
            aria-label="Remember me"
          />
          Remember me
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Signing in…
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
