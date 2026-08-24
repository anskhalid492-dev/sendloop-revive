import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
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
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { supabase } from "@/integrations/supabase/client";
import { getSiteContent } from "@/lib/site-content.functions";
import { ensureProfile } from "@/lib/profile.functions";
import { getPlatformFlags } from "@/lib/platform-settings.functions";
import { getGlobalSeo, setSiteContent } from "@/lib/page-seo";
import { getPublicPlatformConfig } from "@/lib/platform-config.functions";
import {
  getPlatformConfig,
  setPlatformConfig,
  type PublicPlatformConfigShape,
} from "@/lib/platform-config-store";
import { CookieConsentBanner } from "@/components/platform/CookieConsentBanner";
import { NotFoundPage } from "@/components/site/NotFoundPage";



function NotFoundComponent() {
  return <NotFoundPage />;
}


function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    // Load the admin-managed navigation, footer, SEO overrides and redirects
    // once per session. A content failure must never take the site down, so
    // every error here falls back to the hardcoded defaults.
    try {
      const content = await context.queryClient.ensureQueryData(siteContentQueryOptions);
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
      siteContent = await context.queryClient.ensureQueryData(siteContentQueryOptions);
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
      path.startsWith("/admin") ||
      path.startsWith("/auth") ||
      path.startsWith("/login") ||
      path.startsWith("/reset-password") ||
      path.startsWith("/api");
    if (!exempt) {
      try {
        const flags = await getPlatformFlags();
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
      platformConfig = (await getPublicPlatformConfig()) as PublicPlatformConfigShape;
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
      ...(global?.google_verification
        ? [{ name: "google-site-verification", content: global.google_verification }]
        : []),
      ...(global?.bing_verification ? [{ name: "msvalidate.01", content: global.bing_verification }] : []),
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
      faviconLink(),
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

/** Favicon comes from Admin → Branding when uploaded, otherwise the default. */
function faviconLink() {
  const custom = getPlatformConfig()?.branding?.["favicon_url"];
  const href = typeof custom === "string" && custom.trim() ? custom.trim() : "/favicon.png";
  const type = href.endsWith(".svg")
    ? "image/svg+xml"
    : href.endsWith(".ico")
      ? "image/x-icon"
      : "image/png";
  return { rel: "icon", href, type };
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
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
        <CookieConsentBanner />
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
