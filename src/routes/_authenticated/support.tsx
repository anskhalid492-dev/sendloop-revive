import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, LifeBuoy, MessageCircle } from "lucide-react";

import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support — Sendloop" },
      { name: "description", content: "Get help from the Sendloop deliverability team." },
      { property: "og:title", content: "Support — Sendloop" },
      { property: "og:description", content: "Get help from the Sendloop team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <AppShell title="Support" description="We're here to help">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="surface-card p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <MessageCircle className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Email our team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Write to support@sendloop.io and we reply within one business day.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="/help-center" className="surface-card block p-6 transition hover:border-primary/40">
            <BookOpen className="size-5 text-primary" />
            <h3 className="mt-3 font-semibold">Help center</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Guides for campaigns, leads, deliverability and reporting.
            </p>
          </Link>
          <Link to="/contact" className="surface-card block p-6 transition hover:border-primary/40">
            <LifeBuoy className="size-5 text-primary" />
            <h3 className="mt-3 font-semibold">Contact us</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Deliverability review, onboarding help or plan questions.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
