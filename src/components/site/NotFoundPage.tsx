/**
 * Public 404 experience.
 *
 * Rendered by the root `notFoundComponent`, so it inherits the real HTTP 404
 * status from the router. It reuses the marketing chrome (header, footer,
 * buttons, tokens) so a missing URL still feels like a MunchReach page.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Home, LayoutDashboard, LifeBuoy, Mail, Sparkles, Tag } from "lucide-react";

import { MarketingLayout } from "@/components/site/MarketingPage";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const quickLinks = [
  { to: "/features", label: "Features", text: "Everything inside the outreach engine", icon: Sparkles },
  { to: "/pricing", label: "Pricing", text: "Plans, limits and what is included", icon: Tag },
  { to: "/blog", label: "Resources", text: "Guides, playbooks and deliverability tips", icon: Compass },
  { to: "/lifetime", label: "Lifetime Deal", text: "One payment, lifetime access", icon: Mail },
  { to: "/contact", label: "Contact", text: "Talk to a human on the team", icon: LifeBuoy },
] as const;

/** Envelope drifting off a curved flight path — hand-drawn, no stock art. */
function LostEmailIllustration() {
  return (
    <svg
      viewBox="0 0 420 200"
      role="img"
      aria-label="An email envelope drifting off its delivery path"
      className="mx-auto h-auto w-full max-w-md"
    >
      <path
        d="M12 168 C 90 168, 130 60, 210 60 S 320 130, 408 44"
        fill="none"
        stroke="currentColor"
        className="text-primary/25"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="7 9"
      />
      <circle cx="12" cy="168" r="5" className="fill-primary/40" />
      <g className="text-primary">
        <rect x="168" y="30" width="76" height="52" rx="8" className="fill-card stroke-current" strokeWidth="2" />
        <path d="M172 40 L206 62 L240 40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g className="text-primary/40">
        <circle cx="330" cy="96" r="4" className="fill-current" />
        <circle cx="360" cy="76" r="3" className="fill-current" />
        <circle cx="386" cy="58" r="2" className="fill-current" />
      </g>
      <text
        x="330"
        y="168"
        textAnchor="middle"
        className="fill-primary/70 text-[28px] font-extrabold"
        style={{ fontWeight: 800 }}
      >
        404
      </text>
    </svg>
  );
}

export function NotFoundPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    return () => {
      active = false;
    };
  }, []);

  // The router renders this outside a route `head()`, so metadata is applied
  // here. Crawlers must never index a missing URL.
  useEffect(() => {
    document.title = "Page Not Found | MunchReach";
    const ensure = (selector: string, attrs: Record<string, string>) => {
      let tag = document.head.querySelector<HTMLMetaElement>(selector);
      if (!tag) {
        tag = document.createElement("meta");
        document.head.appendChild(tag);
      }
      for (const [key, value] of Object.entries(attrs)) tag.setAttribute(key, value);
      return tag;
    };
    ensure('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    ensure('meta[name="description"]', {
      name: "description",
      content:
        "The page you're looking for could not be found. Return to MunchReach and explore our cold email and outreach platform.",
    });
  }, []);

  return (
    <MarketingLayout>
      <section className="hero-glow relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-primary uppercase">
              Error 404
            </span>
            <p className="text-gradient mt-6 text-6xl font-extrabold tracking-tight sm:text-7xl">404</p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Looks like this email went missing.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0">
              The page you're looking for doesn't exist or may have moved. Let's get you back to
              MunchReach.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button size="lg" asChild>
                <Link to="/">
                  <Home className="size-4" />
                  Go to Homepage
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to={signedIn ? "/dashboard" : "/signin"}>
                  <LayoutDashboard className="size-4" />
                  Go to Dashboard
                </Link>
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm sm:p-10">
            <LostEmailIllustration />
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Popular destinations</h2>
            <p className="mt-3 text-muted-foreground">
              A few places that probably have what you were after.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="surface-card group flex items-start gap-4 p-5 transition-colors hover:border-primary/40"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <item.icon className="size-5" />
                </span>
                <span>
                  <span className="flex items-center gap-1 font-semibold">
                    {item.label}
                    <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.text}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-secondary/40 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to turn cold emails into real conversations?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Build targeted campaigns, automate follow-ups, and manage every prospect conversation in
            one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/signup">Start Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/features">Explore Features</Link>
            </Button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
