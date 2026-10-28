import { MunchMateWidget } from "@/components/munchmate/MunchMateWidget";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  redirect,
  isRedirect,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  initStaleChunkReload,
  isStaleChunkError,
  recoverFromStaleChunk,
} from "@/lib/stale-chunk-reload";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/ThemeProvider";
import { supabase } from "@/integrations/supabase/client";
import { getSiteContent } from "@/lib/site-content.functions";
import { ensureProfile } from "@/lib/profile.functions";
import { getPlatformFlags } from "@/lib/platform-settings.functions";
import { getGlobalSeo, setSiteContent } from "@/lib/page-seo";
import { normalizeVerificationToken } from "@/lib/verification-token";
import { getPublicPlatformConfig } from "@/lib/platform-config.functions";
import {
  getPlatformConfig,
  setPlatformConfig,
  type PublicPlatformConfigShape,
} from "@/lib/platform-config-store";
import { CookieConsentBanner } from "@/components/platform/CookieConsentBanner";
import { NotFoundPage } from "@/components/site/NotFoundPage";
import { captureReferralCode } from "@/hooks/useReferralClaim";

// Initialise stale-chunk recovery as early as possible in the browser bundle.
// It is a no-op during SSR.
initStaleChunkReload();




function NotFoundComponent() {
  return <NotFoundPage />;
}


function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // A chunk that vanished after a deploy is not a real failure: reload quietly.
  const staleChunk = isStaleChunkError(error);
  if (!staleChunk) console.error(error);
  useEffect(() => {
    if (recoverFromStaleChunk(error)) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void import("@/instrument-browser").then(({ initBrowserSentry, captureBrowserError }) => {
      initBrowserSentry();
      captureBrowserError(error, { boundary: "tanstack_root_error_component" });
    });
  }, [error]);

  if (staleChunk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">A new version is available, reloading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const siteContentQueryOptions = {
  queryKey: ["site-content"] as const,
  queryFn: () => getSiteContent(),
  staleTime: 5 * 60 * 1000,
};

const PUBLIC_CONFIG_TIMEOUT_MS = 1_500;

async function withPublicConfigTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Public configuration request timed out")),
      PUBLIC_CONFIG_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    // Load the admin-managed navigation, footer, SEO overrides and redirects
    // once per session. A content failure must never take the site down, so
    // every error here falls back to the hardcoded defaults.
    try {
      const content = await withPublicConfigTimeout(
        context.queryClient.ensureQueryData(siteContentQueryOptions),
      );
      setSiteContent(content);
      const path =
        location.pathname.length > 1 ? location.pathname.replace(/\/+$/, "") : location.pathname;
      const rule = content.redirects.find((r) => r.source === path);
      if (rule) {
        throw redirect({ href: rule.destination, statusCode: rule.statusCode as 301 | 302 });
      }
    } catch (error) {
      if (isRedirect(error)) throw error;
    }
  },
  // The bundle is also returned as loader data so the client has the exact
  // same content the server rendered with; otherwise the footer and header
  // hydrate against the hardcoded fallbacks and React reports a mismatch.
  loader: async ({ context, location }) => {
    let siteContent: Awaited<ReturnType<typeof getSiteContent>> | null = null;
    try {
      siteContent = await withPublicConfigTimeout(
        context.queryClient.ensureQueryData(siteContentQueryOptions),
      );
      if (siteContent) setSiteContent(siteContent);

    } catch {
      siteContent = null;
    }

    // Maintenance mode is a real gate: when an admin turns it on, visitors see
    // the maintenance screen instead of the app. /auth and /admin stay open so
    // an operator can always sign in and turn it back off.
    let maintenance: { active: boolean; message: string } = { active: false, message: "" };
    const path = location.pathname;
    const exempt =
      path.startsWith("/mranuskhalid") ||
      path.startsWith("/auth") ||
      path.startsWith("/login") ||
      path.startsWith("/reset-password") ||
      path.startsWith("/api");
    if (!exempt) {
      try {
        const flags = await withPublicConfigTimeout(getPlatformFlags());
        maintenance = {
          active: Boolean(flags.maintenanceMode),
          message: flags.maintenanceMessage || "MunchReach is temporarily unavailable for scheduled maintenance.",
        };
      } catch {
        maintenance = { active: false, message: "" };
      }
    }

    // Public platform configuration (branding, legal, consent, limits) is
    // fetched here so head() and the consent banner render identically on the
    // server and after hydration.
    let platformConfig: PublicPlatformConfigShape | null = null;
    try {
      platformConfig = (await withPublicConfigTimeout(
        getPublicPlatformConfig(),
      )) as PublicPlatformConfigShape;
      setPlatformConfig(platformConfig);
    } catch {
      platformConfig = null;
    }

    return { siteContent, maintenance, platformConfig };
  },
  head: () => {
    // Global SEO defaults come from Admin → SEO Manager when set; the values
    // below stay as the fallback so the site never renders without metadata.
    const global = getGlobalSeo();
    const title = global?.site_title || "MunchReach — Cold Email Outreach Platform";
    const description =
      global?.meta_description ||
      "Cold email campaigns, automated follow-ups, warmup and a unified inbox for every connected mailbox.";

    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: global?.og_site_name || "MunchReach" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(global?.og_image_url
        ? [
            { property: "og:image", content: global.og_image_url },
            { name: "twitter:image", content: global.og_image_url },
          ]
        : []),
      ...(global?.twitter_handle ? [{ name: "twitter:site", content: global.twitter_handle }] : []),
      ...(normalizeVerificationToken(global?.google_verification)
        ? [
            {
              name: "google-site-verification",
              content: normalizeVerificationToken(global?.google_verification),
            },
          ]
        : []),
      ...(normalizeVerificationToken(global?.bing_verification)
        ? [{ name: "msvalidate.01", content: normalizeVerificationToken(global?.bing_verification) }]
        : []),
      ...(global && global.index_site === false ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],

    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
      ...faviconLinks(),
    ],
    ...(global?.head_scripts?.trim()
      ? { scripts: [{ children: global.head_scripts }] }
      : {}),
    };
  },


  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function iconType(href: string) {
  return href.endsWith(".svg")
    ? "image/svg+xml"
    : href.endsWith(".ico")
      ? "image/x-icon"
      : "image/png";
}

/**
 * Favicons come from Admin → Branding when uploaded, otherwise the default.
 * A separate dark-mode icon is emitted whenever one is available, so the tab
 * icon stays legible in both light and dark browser themes.
 */
function faviconLinks() {
  const branding = getPlatformConfig()?.branding ?? {};
  const pick = (key: string) => {
    const value = branding[key];
    return typeof value === "string" && value.trim() ? value.trim() : "";
  };
  const light = pick("favicon_url") || "/favicon.png";
  const dark = pick("favicon_dark_url") || pick("logo_dark_url") || "";
  const links: { rel: string; href: string; type: string; media?: string }[] = [
    { rel: "icon", href: light, type: iconType(light) },
  ];
  if (dark && dark !== light) {
    links[0] = { ...links[0]!, media: "(prefers-color-scheme: light)" };
    links.push({
      rel: "icon",
      href: dark,
      type: iconType(dark),
      media: "(prefers-color-scheme: dark)",
    });
  }
  return links;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <BodyScripts />
        <Scripts />
      </body>
    </html>
  );
}

/** Admin-managed tracking snippet rendered at the end of <body>. */
function BodyScripts() {
  const code = getGlobalSeo()?.body_scripts?.trim();
  if (!code) return null;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

function MaintenanceScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Scheduled maintenance</h1>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        <a href="/auth" className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Administrator sign in
        </a>
      </div>
    </main>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { siteContent, maintenance, platformConfig } = Route.useLoaderData();
  // Populate the module store before children render so SSR and hydration
  // read identical navigation, footer and SEO content.
  if (siteContent) setSiteContent(siteContent);
  if (platformConfig) setPlatformConfig(platformConfig);
  const router = useRouter();

  useEffect(() => {
    captureReferralCode(new URLSearchParams(window.location.search).get("ref"));
  }, [router.state.location.href]);

  useEffect(() => {
    // Browser error monitoring. Loaded after hydration so the SDK never runs
    // during SSR and never blocks the first paint.
    void import("@/instrument-browser").then(({ initBrowserSentry }) => initBrowserSentry());
  }, []);

  useEffect(() => {
    // Password recovery links land on the site root with the recovery token in
    // the URL hash. Send those visitors to the reset screen instead of leaving
    // them signed in on the marketing page without changing their password.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") && !window.location.pathname.startsWith("/reset-password")) {
      router.navigate({ to: "/reset-password", replace: true });
    }

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        if (!window.location.pathname.startsWith("/reset-password")) {
          router.navigate({ to: "/reset-password", replace: true });
        }
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") {
        queryClient.invalidateQueries();
        // Resume a pending destination captured before an OAuth round-trip.
        const pending = window.sessionStorage.getItem("munchreach.post-auth");
        if (pending && event === "SIGNED_IN") {
          window.sessionStorage.removeItem("munchreach.post-auth");
          router.navigate({ to: pending, replace: true });
        }
        // Guarantee a profile row exists for every signed-in account, even if
        // the database signup trigger did not fire.
        void ensureProfile().catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        {maintenance?.active ? <MaintenanceScreen message={maintenance.message} /> : <Outlet />}
        {maintenance?.active ? null : <MunchMateWidget />}
        <CookieConsentBanner />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
