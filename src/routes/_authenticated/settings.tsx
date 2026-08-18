import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sendloop" },
      {
        name: "description",
        content: "Settings in your Sendloop cold email workspace.",
      },
      { property: "og:title", content: "Settings — Sendloop" },
      { property: "og:description", content: "Settings in your Sendloop cold email workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-6xl">
        <div className="surface-card p-10 text-center">
          <h2 className="text-xl font-semibold">Settings</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section arrives in the next build phase.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
