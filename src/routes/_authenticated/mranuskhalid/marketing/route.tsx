import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/mranuskhalid/marketing")({
  component: MarketingLayout,
});

const TABS = [
  { to: "/mranuskhalid/marketing", label: "Overview", exact: true },
  { to: "/mranuskhalid/marketing/subscribers", label: "Subscribers" },
  { to: "/mranuskhalid/marketing/segments", label: "Segments" },
  { to: "/mranuskhalid/marketing/campaigns", label: "Campaigns" },
  { to: "/mranuskhalid/marketing/templates", label: "Templates" },
  { to: "/mranuskhalid/marketing/automations", label: "Automations" },
  { to: "/mranuskhalid/marketing/providers", label: "Providers" },
  { to: "/mranuskhalid/marketing/domains", label: "Domains" },
  { to: "/mranuskhalid/marketing/analytics", label: "Analytics" },
  { to: "/mranuskhalid/marketing/settings", label: "Settings" },
];

function MarketingLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Marketing Engine</h1>
            <p className="text-sm text-muted-foreground">
              Internal platform marketing — completely separate from customer cold outbound.
            </p>
          </div>
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
