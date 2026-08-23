import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BellRing,
  AtSign,
  ContactRound,
  Flame,
  Globe,
  FileText,
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronRight,
  Coins,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Mailbox,
  Menu,
  Plug,
  Search,
  ScrollText,
  Send,
  Server,
  Settings,
  Shield,
  Share2,
  Users,
  Workflow,
  X,
  Inbox,
  MessageSquareQuote,
  Gift,
  FileSearch,
  FileCode,
  Newspaper,
  PanelsTopLeft,
  Route as RouteIcon,
  Webhook,
  KeyRound,
  HelpCircle,


} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { adminGlobalSearch } from "@/lib/admin-dashboard.functions";
import { listAdminNotifications } from "@/lib/ops.functions";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";

type NavItem = { to: string; label: string; icon: typeof Users };

const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Customers",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/workspaces", label: "Workspaces", icon: Building2 },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { to: "/admin/providers", label: "Email Providers", icon: Server },
      { to: "/admin/infrastructure", label: "Sending Infrastructure", icon: Share2 },
      { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
      { to: "/admin/environment", label: "System Configuration", icon: KeyRound },
      { to: "/admin/pool", label: "Sending Pool", icon: Mailbox },
      { to: "/admin/inbound-events", label: "Inbound Events", icon: Inbox },
      { to: "/admin/system-emails", label: "System Emails", icon: Mail },
      { to: "/admin/email-log", label: "System Email Log", icon: ScrollText },
      { to: "/admin/notifications", label: "Alert Audit Log", icon: BellRing },

    ],
  },
  {
    title: "Outreach",
    items: [
      { to: "/admin/campaigns", label: "Campaigns", icon: Send },
      { to: "/admin/leads", label: "Leads", icon: ContactRound },
      { to: "/admin/email-accounts", label: "Email Accounts", icon: AtSign },
      { to: "/admin/domains", label: "Domain Verification", icon: Globe },
      { to: "/admin/warmup", label: "Warmup", icon: Flame },
      { to: "/admin/crm", label: "CRM", icon: Users },
      { to: "/admin/automations", label: "Automations", icon: Workflow },
    ],
  },
  {
    title: "Website & Content",
    items: [
      { to: "/admin/seo", label: "SEO Manager", icon: FileSearch },
      { to: "/admin/pages", label: "Pages", icon: FileSearch },
      { to: "/admin/blog", label: "Blog", icon: Newspaper },
      { to: "/admin/navigation", label: "Navigation & Footer", icon: PanelsTopLeft },
      { to: "/admin/redirects", label: "Redirects", icon: RouteIcon },
      { to: "/admin/seo-files", label: "Robots & Sitemap", icon: FileCode },
    ],
  },
  {
    title: "Growth",
    items: [
      { to: "/admin/templates", label: "Templates", icon: FileText },
      { to: "/admin/reviews", label: "Customer Reviews", icon: MessageSquareQuote },
      { to: "/admin/faqs", label: "Website FAQs", icon: HelpCircle },
      { to: "/admin/referrals", label: "Referral Program", icon: Gift },
      { to: "/admin/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    title: "Trust & Support",
    items: [
      { to: "/admin/subprocessors", label: "Subprocessors", icon: Server },
      { to: "/admin/user-guide", label: "User Guide & Alerts", icon: FileText },
      { to: "/admin/privacy-requests", label: "Privacy Requests", icon: Shield },
    ],
  },

  {
    title: "Platform",
    items: [
      { to: "/admin/analytics", label: "Platform Analytics", icon: BarChart3 },
      { to: "/admin/plans", label: "Plans & Pricing", icon: CreditCard },
      { to: "/admin/features", label: "Feature Manager", icon: Settings },
      { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/admin/payments", label: "Billing & Payments", icon: CreditCard },
      { to: "/admin/credits", label: "Credit Management", icon: Coins },
      { to: "/admin/credits/ledger", label: "Credit Ledger", icon: ScrollText },
      { to: "/admin/billing", label: "Billing", icon: CreditCard },
      { to: "/admin/billing-providers", label: "Billing Providers", icon: CreditCard },
      { to: "/admin/support", label: "Support Tickets", icon: LifeBuoy },
      { to: "/admin/audit", label: "Change Audit Log", icon: Shield },
      { to: "/admin/security", label: "Security & Sessions", icon: Shield },
      { to: "/admin/logs", label: "Logs", icon: ScrollText },
      { to: "/admin/usage", label: "Usage & Metering", icon: BarChart3 },
      { to: "/admin/production", label: "Production Checklist", icon: Shield },
      { to: "/admin/settings", label: "System Settings", icon: Settings },
    ],
  },
];

const allNav = navSections.flatMap((s) => s.items);

function useBreadcrumbs(pathname: string) {
  return useMemo(() => {
    const crumbs: { label: string; to?: string }[] = [{ label: "Admin", to: "/admin" }];
    const match = allNav
      .filter((item) => item.to !== "/admin" && pathname.startsWith(item.to))
      .sort((a, b) => b.to.length - a.to.length)[0];
    if (match) crumbs.push({ label: match.label, to: match.to });
    else if (pathname === "/admin") crumbs.push({ label: "Dashboard" });
    const rest = match ? pathname.slice(match.to.length).split("/").filter(Boolean) : [];
    for (const part of rest) crumbs.push({ label: decodeURIComponent(part) });
    return crumbs;
  }, [pathname]);
}

function GlobalSearch() {
  const search = useServerFn(adminGlobalSearch);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "search", debounced],
    queryFn: () => search({ data: { term: debounced } }),
    enabled: debounced.length >= 2,
  });

  const destination: Record<string, string> = {
    user: "/admin/users",
    workspace: "/admin/workspaces",
    campaign: "/admin/campaigns",
    ticket: "/admin/support",
  };

  return (
    <Popover open={debounced.length >= 2}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search users, workspaces, campaigns…"
            className="pl-9"
            aria-label="Global admin search"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {isFetching && !data ? (
          <p className="p-3 text-sm text-muted-foreground">Searching…</p>
        ) : !data || data.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No matches</p>
        ) : (
          data.map((r) => (
            <Link
              key={`${r.kind}-${r.id}`}
              to={destination[r.kind] ?? "/admin"}
              onClick={() => setTerm("")}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="truncate">
                {r.label}
                {r.sublabel ? (
                  <span className="ml-2 text-xs text-muted-foreground">{r.sublabel}</span>
                ) : null}
              </span>
              <Badge variant="secondary" className="shrink-0 capitalize">
                {r.kind}
              </Badge>
            </Link>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

function AdminNotifications() {
  const list = useServerFn(listAdminNotifications);
  const { data } = useQuery({
    queryKey: ["admin", "shell-notifications"],
    queryFn: () => list({ data: { kind: "all", channel: "all", status: "all", limit: 10 } }),
    staleTime: 60_000,
  });

  const failed = (data ?? []).filter((n: { status: string }) => n.status === "failed").length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Admin notifications">
          <BellRing className="size-4" />
          {failed > 0 ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
          Platform alerts
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!data ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : data.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No alerts sent yet.</p>
          ) : (
            data.map((n: { id: string; title: string; status: string; created_at: string }) => (
              <div key={n.id} className="border-b border-border/40 px-4 py-3 last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm">{n.title}</p>
                  <Badge
                    variant={n.status === "failed" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {n.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border/60 p-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link to="/admin/notifications">View alert audit log</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  const crumbs = useBreadcrumbs(pathname);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/signin", replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <Link to="/admin" className="mb-4 flex items-center gap-2 px-2 py-2">
        <BrandLogo className="h-7 max-w-[150px]" alt={`${BRAND_NAME} admin`} />
        <span className="text-sm font-semibold tracking-tight text-muted-foreground">Admin</span>
      </Link>
      {navSections.map((section) => (
        <div key={section.title} className="mb-2">
          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {section.title}
          </p>
          {section.items.map((item) => (
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
        </div>
      ))}
      <div className="mt-auto space-y-1 pt-4">
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" />
            Customer dashboard
          </Link>
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/95 px-4 backdrop-blur sm:px-6">
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm md:flex">
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3.5 text-muted-foreground/60" /> : null}
                {crumb.to && i < crumbs.length - 1 ? (
                  <Link to={crumb.to} className="text-muted-foreground hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <GlobalSearch />
            </div>
            <AdminNotifications />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    {(email ?? "A").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-[140px] truncate text-sm md:inline">
                    {email ?? "Admin"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{email ?? "Admin"}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/settings">
                    <Settings className="size-4" />
                    System settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <ArrowLeft className="size-4" />
                    Customer dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="border-b border-border/60 px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
