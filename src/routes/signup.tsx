import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { getPublicAuthSettings } from "@/lib/auth-settings.functions";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { TURNSTILE_ACTIONS } from "@/lib/turnstile-config";
import { signUpWithTurnstile } from "@/lib/auth-turnstile.functions";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

import { captureReferralCode } from "@/hooks/useReferralClaim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { absoluteUrl } from "@/lib/seo";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordStrength,
  validatePassword,
} from "@/lib/password-policy";

export const Route = createFileRoute("/signup")({
  /** `?redirect=/billing?plan=starter` preserves the plan a visitor picked. */
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] as string } : {},
  head: () => ({
    meta: [
      { title: "Create your free MunchReach account" },
      {
        name: "description",
        content:
          "Start free with MunchReach. Import leads, launch cold email sequences and let MunchReach handle the sending infrastructure for you.",
      },
      { property: "og:title", content: "Create your free MunchReach account" },
      {
        property: "og:description",
        content: "Launch cold email campaigns in minutes — no sending setup required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: absoluteUrl("/signup") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/signup") }],
  }),
  component: SignUpPage,
});

const schema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your name").max(100),
    email: z.string().trim().email("Enter a valid work email").max(255),
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`).max(PASSWORD_MAX_LENGTH),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

const strength = passwordStrength;

function safeRedirect(target: string | undefined): string | null {
  if (!target) return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  if (target.startsWith("/signin") || target.startsWith("/signup") || target.startsWith("/auth")) {
    return null;
  }
  return target;
}

function SignUpPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTo = safeRedirect(search.redirect);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  useEffect(() => {
    // Referral links land here as /signup?ref=CODE; keep the code until the
    // account exists so the server can attribute the signup.
    captureReferralCode(new URLSearchParams(window.location.search).get("ref"));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirectTo ?? "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && event === "SIGNED_IN") {
        navigate({ to: redirectTo ?? "/dashboard", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirectTo]);

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
    // Policy + breach check before the account is created.
    const policyError = await validatePassword(parsed.data.password, {
      email: parsed.data.email,
      fullName: parsed.data.fullName,
    });
    if (policyError) {
      setLoading(false);
      setFormError(policyError);
      toast.error(policyError);
      return;
    }
    // Turnstile is verified server-side before the account is created.
    let result: Awaited<ReturnType<typeof signUpWithTurnstile>>;
    try {
      result = await signUpWithTurnstile({
        data: {
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          password: parsed.data.password,
          emailRedirectTo: window.location.origin,
          ...(turnstileToken ? { turnstileToken } : {}),
        },
      });
    } catch (error) {
      setLoading(false);
      setTurnstileToken(null);
      setWidgetKey((value) => value + 1);
      const message =
        error instanceof Error ? error.message : "Sign-up failed. Please try again.";
      setFormError(message);
      toast.error(message);
      return;
    }
    if (!result.ok) {
      setLoading(false);
      setTurnstileToken(null);
      setWidgetKey((value) => value + 1);
      setFormError(result.error);
      toast.error(result.error);
      return;
    }
    if (result.session) {
      await supabase.auth.setSession(result.session);
    }
    setLoading(false);
    if (result.session) {
      // First signup: no workspace yet, so land straight in onboarding unless a
      // destination (e.g. billing with a chosen plan) was carried in.
      navigate({ to: redirectTo ?? "/onboarding", replace: true });
      return;
    }
    navigate({ to: "/verify-email", search: { email: parsed.data.email } });
  }

  const googleQuery = useQuery({
    queryKey: ["public-auth-settings"],
    queryFn: () => getPublicAuthSettings(),
    staleTime: 60_000,
  });

  // Direct Google Identity Services sign-up (not Supabase OAuth). New users land
  // in onboarding like an email signup; existing users go to their account.
  const onGoogleSignedIn = useCallback(
    ({ isNewUser }: { isNewUser: boolean }) => {
      navigate({ to: redirectTo ?? (isNewUser ? "/onboarding" : "/dashboard"), replace: true });
    },
    [navigate, redirectTo],
  );
  const google = useGoogleSignIn(onGoogleSignedIn);
  const handleGoogle = () => void google.start();

  const score = strength(password);
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];
  const focusRing =
    "h-10 rounded-lg border-border/80 bg-background text-sm shadow-sm transition-shadow placeholder:text-muted-foreground/60 focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)]";
  const labelClass = "text-xs font-medium text-foreground";

  return (
    <AuthLayout
      title="Create your MunchReach account"
      subtitle="Start building your outbound engine today."
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
          <Button
            variant="outline"
            className="h-10 w-full gap-3 border-border/80 bg-background text-sm font-medium shadow-sm transition-all hover:bg-muted/60 hover:shadow"
            onClick={handleGoogle}
          >
            <GoogleIcon className="size-[18px]" />
            Sign up with Google
          </Button>

          <div className="my-4 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              or continue with email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form className="space-y-3.5" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="name" className={labelClass}>
            Full name
          </Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Alex Morgan"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={focusRing}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className={labelClass}>
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
            className={focusRing}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className={labelClass}>
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
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
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className={labelClass}>
            Confirm password
          </Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={focusRing}
          />
          {confirm && confirm !== password ? (
            <p className="text-xs text-destructive">Passwords do not match</p>
          ) : null}
        </div>

        <TurnstileWidget
          key={widgetKey}
          action={TURNSTILE_ACTIONS.signup}
          onToken={setTurnstileToken}
          className="empty:hidden"
        />

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
          className="h-10 w-full text-sm font-semibold shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--primary)_80%,transparent)] transition-all hover:-translate-y-px active:translate-y-0"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Creating account…
            </>
          ) : (
            "Create free account"
          )}
        </Button>
        <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            By creating an account you agree to our{" "}
            <Link to="/terms" className="text-foreground underline underline-offset-2">
              Terms
            </Link>
            ,{" "}
            <Link to="/privacy" className="text-foreground underline underline-offset-2">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link to="/compliance" className="text-foreground underline underline-offset-2">
              Compliance
            </Link>
            .
          </span>
        </p>
      </form>
    </AuthLayout>
  );
}

