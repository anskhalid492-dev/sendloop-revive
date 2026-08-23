import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { NOINDEX_META } from "@/lib/seo";

const searchSchema = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/verify-email")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Verify your email — MunchReach" },
      {
        name: "description",
        content:
          "Confirm your email address to activate your MunchReach workspace and start sending cold email campaigns.",
      },
      { property: "og:title", content: "Verify your email — MunchReach" },
      { property: "og:description", content: "Confirm your email to activate your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      NOINDEX_META,
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email } = Route.useSearch();
  const [sending, setSending] = useState(false);

  async function resend() {
    if (!email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Confirmation email sent again");
  }

  return (
    <AuthLayout
      title="Confirm your email"
      subtitle="One quick step before your workspace goes live."
      footer={
        <Link to="/signin" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <MailCheck className="mx-auto size-8 text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">
          We sent a confirmation link{email ? (
            <>
              {" "}to <span className="font-medium text-foreground">{email}</span>
            </>
          ) : null}
          . Click it and you&apos;ll be signed straight into MunchReach.
        </p>
        {email ? (
          <Button variant="outline" className="mt-5 w-full" onClick={resend} disabled={sending}>
            {sending ? "Resending…" : "Resend confirmation email"}
          </Button>
        ) : null}
      </div>
    </AuthLayout>
  );
}
