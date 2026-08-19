import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  FileText,
  ArrowLeft,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mailbox,
  Menu,
  Plug,
  ScrollText,
  Send,
  Server,
  Settings,
  Shield,
  Share2,
  Users,
  X,
  Inbox,
  MessageSquareQuote,
  Gift,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/admin", label: "Admin Overview", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { to: "/admin/providers", label: "Providers", icon: Server },
  { to: "/admin/infrastructure", label: "Sending Infrastructure", icon: Share2 },
  { to: "/admin/inbound-events", label: "Inbound Events", icon: Inbox },
  { to: "/admin/notifications", label: "Alert Audit Log", icon: BellRing },
  { to: "/admin/pool", label: "Sending Pool", icon: Mailbox },
  { to: "/admin/campaigns", label: "Campaigns", icon: Send },
  { to: "/admin/templates", label: "Templates", icon: FileText },
  { to: "/admin/reviews", label: "Customer Reviews", icon: MessageSquareQuote },
  { to: "/admin/referrals", label: "Referral Program", icon: Gift },
  { to: "/admin/integrations", label: "Integrations", icon: Plug },
  { to: "/admin/analytics", label: "System Analytics", icon: BarChart3 },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
  { to: "/admin/logs", label: "Logs", icon: ScrollText },
  { to: "/admin/settings", label: "System Settings", icon: Settings },
] as const;

export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/signin", replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <Link to="/admin" className="mb-4 flex items-center gap-2 px-2 py-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-foreground/90 text-background">
          <Shield className="size-4" />
        </span>
        <span className="text-base font-bold tracking-tight">
          Sendloop <span className="text-muted-foreground">Admin</span>
        </span>
      </Link>
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === item.to
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
      <div className="mt-auto space-y-1 pt-4">
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" />
            Customer dashboard
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="flex h-16 items-center gap-3 border-b border-border/60 px-4 sm:px-6">
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <div>
            <h1 className="text-sm font-semibold">{title}</h1>
            {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
          </div>
        </header>
        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
