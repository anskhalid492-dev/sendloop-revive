import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Bookmark,
  Building2,
  CheckSquare,
  Contact,
  CreditCard,
  FileText,
  Flame,
  Gift,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Send,
  Server,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
  Workflow,
  X,
  Bug,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/app/NotificationBell";
import { WorkspaceSwitcher } from "@/components/app/WorkspaceSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getMyProfile } from "@/lib/workspaces.functions";
import { updateProfile } from "@/lib/profile.functions";
import { useNotifications } from "@/hooks/useNotifications";
import { useReferralClaim } from "@/hooks/useReferralClaim";
import { useOAuthPolicy } from "@/hooks/useOAuthPolicy";
import { useAvatarUrl } from "@/hooks/useAvatarUrl";
import { AnnouncementBar } from "@/components/platform/AnnouncementBar";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_NAME } from "@/lib/branding";
import { DEFAULT_COMMUNITY } from "@/lib/community-model";

/**
 * Customer navigation only. Sending infrastructure (providers, pool,
 * assignment) is MunchReach-managed and lives in the separate staff area,
 * which is never linked from the customer dashboard.
 */
const navGroups = [
  {
    label: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Outreach",
    items: [
      { to: "/campaigns", label: "Campaigns", icon: Send },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/leads", label: "Leads", icon: Users },
      { to: "/templates", label: "Templates", icon: FileText },
      { to: "/automations/workflows", label: "Automations", icon: Workflow },
    ],
  },

  {
    label: "Grow",
    items: [{ to: "/referrals", label: "Referrals", icon: Gift }],
  },
  {
    label: "Conversations",
    items: [{ to: "/inbox", label: "Unified Inbox", icon: Inbox }],
  },
  {
    label: "Infrastructure",
    items: [
      { to: "/mailboxes", label: "Email Accounts", icon: Server },
      { to: "/warmup", label: "Warmup", icon: Flame },
    ],
  },
  {
    label: "CRM",
    items: [
      { to: "/crm", label: "Contacts", icon: Contact },
      { to: "/crm", label: "Pipeline", icon: Bookmark, hash: "pipeline" },
      { to: "/crm", label: "Tasks", icon: CheckSquare, hash: "tasks" },
    ],
  },
  {
    label: "Workspace",
    items: [{ to: "/workspace", label: "Team & settings", icon: Building2 }],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/support", label: "Support", icon: LifeBuoy },
      { to: "/report-bug", label: "Report a bug", icon: Bug },
    ],
  },
] as const;

export function AppShell({
  title,
  actions,
  children,
  contentClassName,
}: {
  title: string;
  /** Kept for call sites; the sub-heading is no longer shown in the app header. */
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {

  const [open, setOpen] = useState(false);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (key: string) => {
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 1600);
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentHash = useRouterState({ select: (s) => s.location.hash });
  const { theme, setTheme } = useTheme();
  // Attributes a referred signup the first time the customer reaches the app.
  useReferralClaim(true);
  useOAuthPolicy();
  const fetchProfile = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const saveProfile = useServerFn(updateProfile);
  const avatarUrl = useAvatarUrl(profile.data?.avatar_url);
  const { supportUnread } = useNotifications();


  // The preference is applied instantly and remembered on the account too.
  function chooseTheme(next: "light" | "dark" | "system") {
    setTheme(next);
    void saveProfile({ data: { theme: next } }).catch(() => {});
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/signin", replace: true });
  }

  const name = profile.data?.full_name ?? profile.data?.email ?? "";
  const initials = name
    .split(" ")
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isActive = (to: string, hash?: string) => {
    const onRoute = pathname === to || pathname.startsWith(`${to}/`);
    if (!onRoute) return false;
    if (to !== "/crm") return true;
    return (hash ?? "") === (currentHash ?? "");
  };

  const linkClass = (to: string, hash?: string) =>
    cn(
      "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150",
      isActive(to, hash)
        ? "bg-primary/10 font-medium text-primary"
        : "text-foreground/70 hover:bg-muted hover:text-foreground",
    );

  const sidebar = (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-sidebar-border px-4 py-4">
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2"
          onClick={() => setOpen(false)}
          aria-label={BRAND_NAME}
        >
          <BrandLogo className="h-7 max-w-[168px]" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-sidebar-border lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* The top bar hides the workspace switcher on small screens, so the
          drawer carries it — switching workspaces must work on mobile. */}
      <div className="border-b border-sidebar-border p-3 md:hidden">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex-1 space-y-5 px-3 py-4">
        {navGroups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="space-y-0.5">
            {group.label ? (
              <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => (
              <Link
                key={`${item.to}-${item.label}`}
                to={item.to}
                {...("hash" in item && item.hash ? { hash: item.hash } : {})}
                onClick={() => setOpen(false)}
                className={linkClass(item.to, "hash" in item ? item.hash : undefined)}
                aria-current={isActive(item.to, "hash" in item ? item.hash : undefined) ? "page" : undefined}
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                <span className="flex-1 truncate text-left">{item.label}</span>
                {item.to === "/support" && supportUnread > 0 ? (
                  <span
                    aria-label={`${supportUnread} unread support updates`}
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
                  >
                    {supportUnread > 9 ? "9+" : supportUnread}
                  </span>
                ) : null}
              </Link>
            ))}
            {group.label === "Settings" ? (
              <a
                href={DEFAULT_COMMUNITY.external_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={linkClass("__external_community__")}
              >
                <Users className="size-[18px] shrink-0" strokeWidth={1.75} />
                <span className="flex-1 truncate text-left">Join Community</span>
              </a>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <Button asChild className="w-full justify-start" size="sm">
          <Link to="/billing" onClick={() => setOpen(false)}>
            <Sparkles className="size-4" />
            Upgrade plan
          </Link>
        </Button>
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          <Avatar className="size-8">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your profile picture" /> : null}
            <AvatarFallback className="text-xs">{initials || "S"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile.data?.full_name ?? profile.data?.email ?? "Your account"}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.data?.email ?? ""}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const railItem = (
    key: string,
    label: string,
    Icon: typeof Users,
    active: boolean,
    content: (cls: string, inner: ReactNode) => ReactNode,
    badge?: ReactNode,
  ) => {
    const shown = flashKey === key;
    const cls = cn(
      "group/rail relative flex size-10 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "bg-primary/10 text-primary" : "text-foreground/60 hover:bg-muted hover:text-foreground",
    );
    const inner = (
      <>
        <Icon className="size-[18px]" strokeWidth={1.75} />
        {badge}
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md transition-all duration-150",
            shown
              ? "translate-x-0 opacity-100"
              : "-translate-x-1 opacity-0 group-hover/rail:translate-x-0 group-hover/rail:opacity-100 group-focus-visible/rail:translate-x-0 group-focus-visible/rail:opacity-100",
          )}
        >
          {label}
        </span>
      </>
    );
    return <div key={key}>{content(cls, inner)}</div>;
  };

  const rail = (
    <div className="flex h-full flex-col items-center gap-1 py-3">
      <Link to="/dashboard" aria-label={BRAND_NAME} className="mb-2 flex size-10 items-center justify-center">
        <img src="/favicon.png" alt="" className="size-7 rounded-md" />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1" aria-label="Main navigation">
        {navGroups.map((group, i) => (
          <div key={group.label ?? `rail-${i}`} className="flex flex-col items-center gap-0.5">
            {i > 0 ? <div className="my-1.5 h-px w-6 bg-sidebar-border" /> : null}
            {group.items.map((item) => {
              const hash = "hash" in item ? item.hash : undefined;
              const key = `${item.to}-${item.label}`;
              return railItem(
                key,
                item.label,
                item.icon,
                isActive(item.to, hash),
                (cls, inner) => (
                  <Link
                    to={item.to}
                    {...(hash ? { hash } : {})}
                    onClick={() => flash(key)}
                    className={cls}
                    aria-label={item.label}
                    aria-current={isActive(item.to, hash) ? "page" : undefined}
                  >
                    {inner}
                  </Link>
                ),
                item.to === "/support" && supportUnread > 0 ? (
                  <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" aria-label={`${supportUnread} unread support updates`} />
                ) : null,
              );
            })}
            {group.label === "Settings"
              ? railItem("community", "Join Community", Users, false, (cls, inner) => (
                  <a
                    href={DEFAULT_COMMUNITY.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                    aria-label="Join Community"
                  >
                    {inner}
                  </a>
                ))
              : null}
          </div>
        ))}
      </nav>
      {railItem("upgrade", "Upgrade plan", Sparkles, isActive("/billing"), (cls, inner) => (
        <Link to="/billing" onClick={() => flash("upgrade")} className={cls} aria-label="Upgrade plan">
          {inner}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 border-r border-sidebar-border bg-sidebar lg:block">
        {rail}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-16">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur sm:px-6">
          <button
            className="inline-flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <div className="min-w-0 flex-1" data-page-title={title} />

          <div className="hidden md:block">
            <WorkspaceSwitcher />
          </div>
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full" aria-label="Account menu">
                <Avatar className="size-8">
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt="Your profile picture" /> : null}
                  <AvatarFallback className="text-xs">{initials || "S"}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{profile.data?.email ?? "Account"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <User className="size-4" /> Profile & account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/workspace">
                  <Building2 className="size-4" /> Workspace settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/billing">
                  <CreditCard className="size-4" /> Billing & upgrade
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/support">
                  <LifeBuoy className="size-4" /> Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Appearance
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => chooseTheme("light")}>
                <Sun className="size-4" /> Light {theme === "light" ? "•" : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chooseTheme("dark")}>
                <Moon className="size-4" /> Dark {theme === "dark" ? "•" : ""}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => chooseTheme("system")}>
                <Monitor className="size-4" /> System {theme === "system" ? "•" : ""}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {actions ? (
          <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 py-3 sm:px-6">{actions}</div>
        ) : null}

        <>
          <AnnouncementBar />
          <main className={contentClassName ?? "px-4 py-8 sm:px-6"}>{children}</main>
        </>
      </div>
    </div>
  );
}
