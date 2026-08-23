import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { requestPasswordResetEmail } from "@/lib/auth-email.functions";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your MunchReach password" },
      {
        name: "description",
        content:
          "Forgot your MunchReach password? Enter your work email and we'll send you a secure link to set a new one.",
      },
      { property: "og:title", content: "Reset your MunchReach password" },
      { property: "og:description", content: "Get a secure password reset link by email." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordResetEmail({
        data: {
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={sent ? "Check your inbox" : "Forgot your password?"}
      subtitle={
        sent
          ? undefined
          : "Enter the email you signed up with and we'll send a reset link."
      }
      footer={
        <>
          Remembered it?{" "}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Back to log in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <MailCheck className="mx-auto size-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            a password reset link is on its way. The link expires in one hour.
          </p>
        </div>
      ) : (
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
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
