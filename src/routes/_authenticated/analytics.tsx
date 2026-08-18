import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Sendloop" },
      {
        name: "description",
        content: "Analytics in your Sendloop cold email workspace.",
      },
      { property: "og:title", content: "Analytics — Sendloop" },
      { property: "og:description", content: "Analytics in your Sendloop cold email workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-6xl">
        <div className="surface-card p-10 text-center">
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section arrives in the next build phase.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
