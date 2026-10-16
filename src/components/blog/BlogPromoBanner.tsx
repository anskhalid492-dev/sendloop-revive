import { ArrowRight } from "lucide-react";

import {
  blogPromoBannerRenderable,
  type BlogPromoBannerConfig,
} from "@/lib/blog-promo-banner";
import { brandLogo } from "@/lib/branding";

/**
 * Centrally managed promotional card for the single-blog-post sidebar.
 * Presentational only — the configuration comes from site_settings via the
 * article loader, so one admin edit updates every published post.
 */
export function BlogPromoBanner({
  config,
  variant,
}: {
  config: BlogPromoBannerConfig;
  /** `sidebar` renders on desktop, `inline` inside the mobile article flow. */
  variant: "sidebar" | "inline";
}) {
  if (!blogPromoBannerRenderable(config)) return null;
  if (variant === "sidebar" && !config.showOnDesktop) return null;
  if (variant === "inline" && !config.showOnMobile) return null;

  const external = /^https:\/\//i.test(config.ctaUrl);
  // The full MunchReach wordmark (admin branding upload wins), never the
  // square favicon — an admin-set image URL still overrides it.
  const iconSrc = config.iconUrl || brandLogo();

  return (
    <div
      data-testid={`blog-promo-banner-${variant}`}
      className={variant === "inline" ? "lg:hidden" : undefined}
      style={{
        backgroundColor: config.backgroundColor,
        color: config.textColor,
        border: `1px solid ${config.borderColor}`,
        borderRadius: `${config.borderRadius}px`,
      }}
    >
      <div className="flex flex-col items-start gap-4 p-6">
        <img
          src={iconSrc}
          alt="MunchReach"
          className="h-7 w-auto max-w-full object-contain"
          loading="lazy"
          onError={(e) => {
            // A missing optional image must never break the card. One swap to
            // the bundled logo, then stop, so a broken logo can't loop.
            const img = e.currentTarget;
            if (img.dataset["fallback"]) return;
            img.dataset["fallback"] = "1";
            img.src = "/brand/munchreach-logo.png";
          }}
        />
        <div>
          <p className="text-lg leading-snug font-semibold text-balance">{config.heading}</p>
          {config.description ? (
            <p className="mt-2 text-sm leading-relaxed opacity-80">{config.description}</p>
          ) : null}
        </div>
        <a
          href={config.ctaUrl}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            backgroundColor: config.buttonBackgroundColor,
            color: config.buttonTextColor,
          }}
        >
          {config.ctaLabel}
          <ArrowRight className="size-4" />
        </a>
      </div>
    </div>
  );
}
