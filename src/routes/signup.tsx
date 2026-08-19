import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { getPublicAuthSettings } from "@/lib/auth-settings.functions";
import { lovable } from "@/integrations/lovable";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { captureReferralCode } from "@/hooks/useReferralClaim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your free Sendloop account" },
      {
        name: "description",
        content:
          "Start free with Sendloop. Import leads, launch cold email sequences and let Sendloop handle the sending infrastructure for you.",
      },
      { property: "og:title", content: "Create your free Sendloop account" },
      {
        property: "og:description",
        content: "Launch cold email campaigns in minutes — no sending setup required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignUpPage,
});

const schema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name").max(100),
    email: z.string().trim().email("Enter a valid work email").max(255),
    password: z.string().min(8, "Use at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function SignUpPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // Referral links land here as /signup?ref=CODE; keep the code until the
    // account exists so the server can attribute the signup.
    captureReferralCode(new URLSearchParams(window.location.search).get("ref"));
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
    const parsed = schema.safeParse({ fullName, email, password, confirm });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check your details";
      setFormError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: parsed.data.fullName },
      },
    });
    setLoading(false);
    if (error) {
      setFormError(error.message);
      toast.error(error.message);
      return;
    }
    if (data.session) {
      // First signup: no workspace yet, so land straight in onboarding.
      navigate({ to: "/onboarding", replace: true });
      return;
    }
    navigate({ to: "/verify-email", search: { email: parsed.data.email } });
  }

  const googleQuery = useQuery({
    queryKey: ["public-auth-settings"],
    queryFn: () => getPublicAuthSettings(),
    staleTime: 60_000,
  });

  async function handleGoogle() {
    const { googleEnabled } = await getPublicAuthSettings();
    if (!googleEnabled) {
      toast.error("Google sign-in is currently disabled. Please use your email and password.");
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Google sign-up failed. Please try again.");
  }

  const score = strength(password);
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  const focusRing =
    "transition-shadow focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]";

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start. No sending provider setup required."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {googleQuery.data?.googleEnabled !== false && (
        <>
          <Button variant="outline" className="w-full" onClick={handleGoogle}>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={focusRing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={focusRing}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={focusRing}
          />
          {password ? (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: i < score ? 1 : 0.35 }}
                    className={`h-1 flex-1 rounded-full ${i < score ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{labels[score]}</p>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={focusRing}
          />
          {confirm && confirm !== password ? (
            <p className="text-xs text-destructive">Passwords do not match</p>
          ) : null}
        </div>

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
              <Loader2 className="mr-2 size-4 animate-spin" /> Creating account…
            </>
          ) : (
            "Create free account"
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By signing up you agree to our{" "}
          <Link to="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
